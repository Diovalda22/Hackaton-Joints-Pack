import { z } from 'zod';
import type { ApiErrorBody, Capabilities, ListResponse, Order, OrderInput, PlanRequest, PlanRun, Remnant, RemnantInput, Workspace } from './types';
import { coreChanged, eligible, orderSchema, remnantSchema } from './validation';
import { createFixturePlan, demoRemnants, scenarios, validateFixture } from './fixtures';
export class ApiError extends Error {
    constructor(public code: string, message: string, public details: Record<string, unknown> = {}, public status = 400) { super(message); this.name = 'ApiError'; }
}
export interface ApiService {
    listRemnants(): Promise<ListResponse<Remnant>>;
    createRemnant(input: RemnantInput): Promise<Remnant>;
    updateRemnant(id: string, input: Partial<RemnantInput> & {
        verification_status?: Remnant['verification_status'];
        stock_status?: Remnant['stock_status'];
    }): Promise<Remnant>;
    listOrders(): Promise<ListResponse<Order>>;
    createOrder(input: OrderInput): Promise<Order>;
    getOrder(id: string): Promise<Order>;
    runPlan(input: PlanRequest): Promise<PlanRun>;
    getPlan(id: string): Promise<PlanRun>;
    health(): Promise<{
        status: string;
        capabilities?: Capabilities;
    }>;
}
export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
export const STORAGE_KEY = 'loopcut.workspace.v1';
const empty = (): Workspace => ({ version: 1, remnants: [], orders: [], plans: [] });
const storedRemnant = remnantSchema.extend({ id: z.string(), verification_status: z.enum(['NEEDS_REVIEW', 'VERIFIED']), stock_status: z.enum(['AVAILABLE', 'QUARANTINED', 'ARCHIVED']), created_at: z.string(), updated_at: z.string() });
const storedOrder = orderSchema.extend({ id: z.string(), created_at: z.string(), updated_at: z.string().optional(), lines: z.array(orderSchema.shape.lines.element.extend({ id: z.string() })) });
function load(storage: StorageLike): Workspace { try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw)
        return empty();
    const data = JSON.parse(raw);
    z.object({ version: z.literal(1), remnants: z.array(storedRemnant), orders: z.array(storedOrder), plans: z.array(z.unknown()) }).parse(data);
    for (const p of data.plans) {
        if (!p.id || !p.order_id || !p.created_at || !['OPTIMAL', 'FEASIBLE_TIMEOUT', 'BASELINE_FALLBACK', 'NO_ASSIGNABLE_PIECES'].includes(p.solver_status))
            throw new Error();
        validateFixture(p);
    }
    return data;
}
catch {
    throw new ApiError('STORAGE_CORRUPT', 'Data lokal tidak dapat dibaca. Reset workspace untuk memulai kembali.', {}, 500);
} }
function save(storage: StorageLike, data: Workspace) { try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
}
catch {
    throw new ApiError('STORAGE_UNAVAILABLE', 'Penyimpanan browser tidak tersedia atau penuh. Data belum disimpan.', {}, 500);
} }
function validate<T>(schema: z.ZodType<T>, input: unknown): T { const result = schema.safeParse(input); if (!result.success) {
    const issue = result.error.issues[0];
    throw new ApiError('VALIDATION_ERROR', issue.message, { field: issue.path.join('.') }, 422);
} return result.data; }
const id = () => crypto.randomUUID();
const timestamp = () => new Date().toISOString();
export function createMockService(getStorage: () => StorageLike, latency = 350): ApiService {
    const execute = async <T>(fn: (store: StorageLike, data: Workspace) => T) => { await new Promise(resolve => setTimeout(resolve, latency)); const storage = getStorage(); return structuredClone(fn(storage, load(storage))); };
    const find = <T extends {
        id: string;
    }>(items: T[], key: string) => { const item = items.find(i => i.id === key); if (!item)
        throw new ApiError('NOT_FOUND', 'Data tidak ditemukan.', {}, 404); return item; };
    return {
        listRemnants: () => execute((_, d) => ({ items: d.remnants, total: d.remnants.length })),
        createRemnant: input => execute((s, d) => { const parsed = validate(remnantSchema, input); if (d.remnants.some(r => r.code === parsed.code))
            throw new ApiError('DUPLICATE_REMNANT_CODE', 'Kode kain sudah digunakan.', { field: 'code' }, 409); const now = timestamp(); const r: Remnant = { ...parsed, id: id(), verification_status: 'NEEDS_REVIEW', stock_status: 'AVAILABLE', created_at: now, updated_at: now }; d.remnants.push(r); save(s, d); return r; }),
        updateRemnant: (key, input) => execute((s, d) => { const before = find(d.remnants, key); const parsed = validate(remnantSchema, { ...before, ...input }); if (d.remnants.some(r => r.id !== key && r.code === parsed.code))
            throw new ApiError('DUPLICATE_REMNANT_CODE', 'Kode kain sudah digunakan.', { field: 'code' }, 409); if (input.stock_status && !['AVAILABLE', 'QUARANTINED', 'ARCHIVED'].includes(input.stock_status) || input.verification_status && !['VERIFIED', 'NEEDS_REVIEW'].includes(input.verification_status))
            throw new ApiError('VALIDATION_ERROR', 'Status tidak valid.', {}, 422); const r: Remnant = { ...before, ...parsed, stock_status: input.stock_status ?? before.stock_status, verification_status: input.verification_status ?? (coreChanged(before, parsed) ? 'NEEDS_REVIEW' : before.verification_status), updated_at: timestamp() }; d.remnants = d.remnants.map(item => item.id === key ? r : item); save(s, d); return r; }),
        listOrders: () => execute((_, d) => ({ items: d.orders, total: d.orders.length })),
        createOrder: input => execute((s, d) => { const parsed = validate(orderSchema, input); const o: Order = { ...parsed, id: id(), created_at: timestamp(), lines: parsed.lines.map(l => ({ ...l, id: id() })) }; d.orders.push(o); save(s, d); return o; }),
        getOrder: key => execute((_, d) => find(d.orders, key)),
        runPlan: input => execute((s, d) => { const o = find(d.orders, input.order_id); const limit = input.solver_time_limit_sec ?? 8; if (!Number.isInteger(limit) || limit < 1 || limit > 8)
            throw new ApiError('VALIDATION_ERROR', 'Batas solver harus 1–8 detik.', {}, 422); let pool: Remnant[]; if (input.remnant_ids == null) {
            pool = d.remnants.filter(eligible);
            if (pool.length > 15)
                throw new ApiError('REMNANT_SELECTION_REQUIRED', 'Pilih maksimal 15 lembar kain.', {}, 422);
        }
        else {
            if (input.remnant_ids.length > 15 || new Set(input.remnant_ids).size !== input.remnant_ids.length)
                throw new ApiError('VALIDATION_ERROR', 'Pilih maksimal 15 kain tanpa duplikasi.', {}, 422);
            pool = input.remnant_ids.map(key => find(d.remnants, key));
        } const excluded = pool.filter(r => !eligible(r)); try {
            const p = createFixturePlan(o, pool.filter(eligible), id(), timestamp());
            if (limit !== 8)
                throw new ApiError('MOCK_SCENARIO_REQUIRED', 'Fixture demo menggunakan batas 8 detik.');
            p.excluded_remnants = excluded.map(r => ({ remnant_id: r.id, reason_code: r.verification_status !== 'VERIFIED' ? 'NEEDS_REVIEW' : r.stock_status }));
            d.plans.push(p);
            save(s, d);
            return p;
        }
        catch (error) {
            if (error instanceof Error && error.message === 'MOCK_SCENARIO_REQUIRED')
                throw new ApiError('MOCK_SCENARIO_REQUIRED', 'Perhitungan input bebas membutuhkan backend. Muat skenario demo untuk melihat layout sintetis.', {}, 422);
            throw error;
        } }),
        getPlan: key => execute((_, d) => find(d.plans, key)), health: async () => ({ status: 'demo' })
    };
}
export const isMock = process.env.NEXT_PUBLIC_API_MODE === 'mock';
export const demoEnabled = isMock && process.env.NEXT_PUBLIC_ENABLE_DEMO_SEED !== 'false';
export function makeHttpRequest(base: string) { return async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000); try {
    const response = await fetch(`${base.replace(/\/$/, '')}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) {
        const err = (data as ApiErrorBody).error;
        throw new ApiError(err?.code ?? 'INTERNAL_ERROR', err?.message ?? 'Request gagal.', err?.details ?? {}, response.status);
    }
    return data as T;
}
catch (e) {
    if (e instanceof ApiError)
        throw e;
    throw new ApiError('NETWORK_ERROR', 'Gagal memproses request. Periksa koneksi, lalu coba lagi.', {}, 503);
}
finally {
    clearTimeout(timer);
} }; }
export function createHttpService(base: string): ApiService { const request = makeHttpRequest(base); return { listRemnants: () => request('/remnants'), createRemnant: body => request('/remnants', 'POST', body), updateRemnant: (id, body) => request(`/remnants/${encodeURIComponent(id)}`, 'PATCH', body), listOrders: () => request('/orders'), createOrder: body => request('/orders', 'POST', body), getOrder: id => request(`/orders/${encodeURIComponent(id)}`), runPlan: body => request('/plan-runs', 'POST', body), getPlan: id => request(`/plan-runs/${encodeURIComponent(id)}`), health: () => request('/health') }; }
const browserStorage = () => window.localStorage;
export const api = isMock ? createMockService(browserStorage) : createHttpService(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8100');
export function resetWorkspace() { if (!demoEnabled)
    throw new ApiError('DEMO_DISABLED', 'Reset hanya tersedia di mode demo.'); window.localStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem('loopcut.last-runs'); }
export function seedDemo() { if (!demoEnabled)
    throw new ApiError('DEMO_DISABLED', 'Data demo tidak tersedia.'); const d = empty(); d.remnants = structuredClone(demoRemnants); d.orders = scenarios.map(s => ({ ...structuredClone(s.order), id: `o_demo_${s.id}`, created_at: timestamp(), lines: s.order.lines.map((l, i) => ({ ...l, id: `ol_${s.id}_${i}` })) })); save(browserStorage(), d); sessionStorage.removeItem('loopcut.last-runs'); }
export function rememberRun(orderId: string, planId: string) { try {
    const data = JSON.parse(sessionStorage.getItem('loopcut.last-runs') ?? '{}');
    data[orderId] = planId;
    sessionStorage.setItem('loopcut.last-runs', JSON.stringify(data));
}
catch { /* Results remain available at their permanent route. */ } }
export function latestRun(orderId: string): string | undefined { try {
    return JSON.parse(sessionStorage.getItem('loopcut.last-runs') ?? '{}')[orderId];
}
catch {
    return undefined;
} }
