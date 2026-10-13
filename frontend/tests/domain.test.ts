import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixturePlan, demoRemnants, matchingScenario, scenarios, validateFixture } from '../src/lib/fixtures';
import { eligible, orderSchema, remnantSchema, totalArea, totalPieces } from '../src/lib/validation';
import { ApiError, createMockService, STORAGE_KEY, createHttpService, type StorageLike } from '../src/lib/api';
import type { Order, OrderInput, Remnant } from '../src/lib/types';
class MemoryStorage implements StorageLike {
    values = new Map<string, string>();
    getItem(k: string) { return this.values.get(k) ?? null; }
    setItem(k: string, v: string) { this.values.set(k, v); }
    removeItem(k: string) { this.values.delete(k); }
}
function workspace() { const storage = new MemoryStorage(); storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, remnants: structuredClone(demoRemnants), orders: [], plans: [] })); return { storage, api: createMockService(() => storage, 0) }; }
function order(input: OrderInput): Order { return { ...structuredClone(input), id: 'o_1', created_at: '2026-10-13T08:00:00+07:00', lines: input.lines.map((l, i) => ({ ...l, id: `line_${i}` })) }; }
const pool = demoRemnants.filter(eligible);
test('mm dimensions: zero, negative, decimal, NaN and >10000 rejected', () => { for (const width_mm of [0, -1, 1.5, NaN, 10001])
    assert.equal(remnantSchema.safeParse({ ...demoRemnants[0], width_mm }).success, false); assert.equal(remnantSchema.safeParse({ ...demoRemnants[0], width_mm: 10000 }).success, true); });
test('codes are normalized, malformed and long codes rejected', () => { const parsed = remnantSchema.parse({ ...demoRemnants[0], material_code: ' cotton ', color_code: 'black' }); assert.equal(parsed.material_code, 'COTTON'); assert.equal(parsed.color_code, 'BLACK'); for (const color_code of ['', 'BLACK/WHITE', 'X'.repeat(65)])
    assert.equal(remnantSchema.safeParse({ ...demoRemnants[0], color_code }).success, false); });
test('order enforces 1–30 units after expansion and minimum one line', () => { const input = structuredClone(scenarios[0].order); assert.equal(totalPieces(input), 5); assert.equal(totalArea(input), 660000); input.lines[0].quantity = 30; assert.equal(orderSchema.safeParse(input).success, false); input.lines = [{ ...input.lines[0], quantity: 30 }]; assert.equal(orderSchema.safeParse(input).success, true); for (const quantity of [0, 31, 1.5])
    assert.equal(orderSchema.safeParse({ ...input, lines: [{ ...input.lines[0], quantity }] }).success, false); assert.equal(orderSchema.safeParse({ name: 'A', lines: [] }).success, false); });
test('oversized piece is valid order input, not rejected before planning', () => assert.equal(orderSchema.safeParse(scenarios.find(s => s.id === 'oversize')!.order).success, true));
test('qualification excludes unverified, quarantined, archived and malformed stock', () => { assert.equal(pool.length, 5); for (const r of [{ ...demoRemnants[0], verification_status: 'NEEDS_REVIEW' }, { ...demoRemnants[0], stock_status: 'QUARANTINED' }, { ...demoRemnants[0], stock_status: 'ARCHIVED' }, { ...demoRemnants[0], width_mm: 0 }])
    assert.equal(eligible(r as Remnant), false); });
for (const scenario of scenarios)
    test(`fixture ${scenario.id}: geometry, unique units, coverage and comparison are consistent`, () => { const plan = createFixturePlan(order(scenario.order), pool, 'p_1', '2026-10-13'); assert.doesNotThrow(() => validateFixture(plan)); assert.equal(plan.solver_status, scenario.status); assert.equal(plan.comparison.gain_vs_greedy_m2, 0); if (scenario.id === 'rotation') {
        assert.equal(plan.selected.placements[0].rotated, true);
        assert.equal(plan.selected.placements[0].placed_width_mm, 400);
        assert.equal(plan.selected.placements[0].placed_height_mm, 1300);
    } if (scenario.id === 'mismatch')
        assert.equal(plan.selected.unallocated[0].reason_code, 'NO_VERIFIED_MATERIAL_MATCH'); if (scenario.id === 'oversize')
        assert.equal(plan.selected.unallocated[0].reason_code, 'DOES_NOT_FIT_ANY_COMPATIBLE_REMNANT'); if (scenario.id === 'partial')
        assert.equal(plan.selected.metrics.placed_count, 1); });
test('fixture match ignores IDs/names but refuses changed quantity, dimensions, rotation or stock', () => { const o = order(scenarios[0].order); o.name = 'Different name'; o.lines[0].label = 'Renamed panel'; assert.equal(matchingScenario(o, [...pool].reverse())?.id, 'normal'); for (const patch of [{ width_mm: 601 }, { quantity: 3 }, { allow_rotation_90: true }, { material_code: 'DENIM' }, { color_code: 'WHITE' }]) {
    const changed = structuredClone(o);
    Object.assign(changed.lines[0], patch);
    assert.equal(matchingScenario(changed, pool), undefined);
} const altered = structuredClone(pool); altered[0].width_mm++; assert.equal(matchingScenario(o, altered), undefined); assert.equal(matchingScenario(o, []), undefined); });
test('independent fixture validator detects overlap, duplicate, out-of-bounds and wrong orientation', () => { for (const mutate of [(p: ReturnType<typeof createFixturePlan>) => { p.selected.placements[1].x_mm = 0; }, (p: ReturnType<typeof createFixturePlan>) => { p.selected.placements[1].piece_instance_id = p.selected.placements[0].piece_instance_id; }, (p: ReturnType<typeof createFixturePlan>) => { p.selected.placements[0].x_mm = 9999; }, (p: ReturnType<typeof createFixturePlan>) => { p.selected.placements[0].rotated = true; }, (p: ReturnType<typeof createFixturePlan>) => { p.selected.metrics.reuse_area_m2 = 9; }]) {
    const p = createFixturePlan(order(scenarios[0].order), pool, 'p', 'now');
    mutate(p);
    assert.throws(() => validateFixture(p));
} });
test('CRUD persists after service recreation; new stock defaults to review; code must be unique', async () => { const { storage, api } = workspace(); const input = { ...demoRemnants[0], code: 'USER-001' }; const created = await api.createRemnant(input); assert.equal(created.verification_status, 'NEEDS_REVIEW'); assert.equal(created.stock_status, 'AVAILABLE'); await assert.rejects(() => api.createRemnant(input), e => e instanceof ApiError && e.code === 'DUPLICATE_REMNANT_CODE'); const loaded = await createMockService(() => storage, 0).listRemnants(); assert.ok(loaded.items.some(r => r.id === created.id)); });
test('core edit resets verification; note edit does not; explicit reverification retains it', async () => { const { api } = workspace(); const r = demoRemnants[0]; assert.equal((await api.updateRemnant(r.id, { source_note: 'New source' })).verification_status, 'VERIFIED'); assert.equal((await api.updateRemnant(r.id, { width_mm: 1100 })).verification_status, 'NEEDS_REVIEW'); assert.equal((await api.updateRemnant(r.id, { verification_status: 'VERIFIED' })).verification_status, 'VERIFIED'); assert.equal((await api.updateRemnant(r.id, { color_code: 'WHITE', verification_status: 'VERIFIED' })).verification_status, 'VERIFIED'); assert.equal((await api.updateRemnant(r.id, { condition_note: 'Condition edited' })).verification_status, 'NEEDS_REVIEW'); });
test('run persists immutable snapshot and does not consume stock', async () => { const { storage, api } = workspace(); const o = await api.createOrder(scenarios[0].order); const before = await api.listRemnants(); const p = await api.runPlan({ order_id: o.id }); assert.deepEqual(await api.listRemnants(), before); await api.updateRemnant('r_01', { stock_status: 'ARCHIVED' }); assert.deepEqual(await createMockService(() => storage, 0).getPlan(p.id), p); const caller = structuredClone(p); caller.input_snapshot.remnants[0].width_mm = 99; assert.deepEqual(await api.getPlan(p.id), p); });
test('custom input cannot receive unrelated fixture results', async () => { const { api } = workspace(); const input = structuredClone(scenarios[0].order); input.lines[0].width_mm = 601; const o = await api.createOrder(input); await assert.rejects(() => api.runPlan({ order_id: o.id }), e => e instanceof ApiError && e.code === 'MOCK_SCENARIO_REQUIRED'); });
test('explicit invalid stock is excluded and reported', async () => { const { api } = workspace(); const o = await api.createOrder(scenarios[0].order); const p = await api.runPlan({ order_id: o.id, remnant_ids: demoRemnants.map(r => r.id) }); assert.equal(p.excluded_remnants.length, 2); assert.ok(p.selected.placements.every(p => p.remnant_id !== 'r_06' && p.remnant_id !== 'r_07')); });
test('more than 15 eligible requires explicit selection, duplicates and >15 IDs rejected', async () => { const { api } = workspace(); for (let i = 0; i < 11; i++) {
    const r = await api.createRemnant({ ...demoRemnants[0], code: `ADDED-${i}` });
    await api.updateRemnant(r.id, { verification_status: 'VERIFIED' });
} const o = await api.createOrder(scenarios[0].order); await assert.rejects(() => api.runPlan({ order_id: o.id }), e => e instanceof ApiError && e.code === 'REMNANT_SELECTION_REQUIRED'); await assert.rejects(() => api.runPlan({ order_id: o.id, remnant_ids: ['r_01', 'r_01'] }), e => e instanceof ApiError && e.code === 'VALIDATION_ERROR'); await assert.rejects(() => api.runPlan({ order_id: o.id, remnant_ids: Array.from({ length: 16 }, (_, i) => `${i}`) }), e => e instanceof ApiError && e.code === 'VALIDATION_ERROR'); assert.equal((await api.runPlan({ order_id: o.id, remnant_ids: pool.map(r => r.id) })).selected.metrics.placed_count, 5); });
test('missing IDs return NOT_FOUND; corrupt/old storage is not silently overwritten', async () => { const { storage, api } = workspace(); await assert.rejects(() => api.getOrder('missing'), e => e instanceof ApiError && e.code === 'NOT_FOUND'); for (const value of ['bad json', JSON.stringify({ version: 2 })]) {
    storage.setItem(STORAGE_KEY, value);
    await assert.rejects(() => api.listRemnants(), e => e instanceof ApiError && e.code === 'STORAGE_CORRUPT');
    assert.equal(storage.getItem(STORAGE_KEY), value);
} });
test('storage write failure is reported and not claimed as success', async () => { const { storage } = workspace(); storage.setItem = () => { throw new Error('quota'); }; const api = createMockService(() => storage, 0); await assert.rejects(() => api.createOrder(scenarios[0].order), e => e instanceof ApiError && e.code === 'STORAGE_UNAVAILABLE'); });
test('HTTP adapter uses JSON contracts, encoded IDs and structured errors', async () => { const original = globalThis.fetch; const calls: {
    url: string;
    init?: RequestInit;
}[] = []; globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); if (String(url).includes('bad'))
    return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Tidak ditemukan', details: {} } }), { status: 404 }); return new Response(JSON.stringify({ id: 'created', status: 'ok' }), { status: 200 }); }; try {
    const api = createHttpService('http://backend.test/');
    await api.createOrder(scenarios[0].order);
    assert.equal(calls[0].url, 'http://backend.test/api/v1/orders');
    assert.equal(calls[0].init?.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].init?.body as string), scenarios[0].order);
    await api.getOrder('id/with slash');
    assert.ok(calls[1].url.endsWith('/orders/id%2Fwith%20slash'));
    await assert.rejects(() => api.getPlan('bad'), e => e instanceof ApiError && e.code === 'NOT_FOUND');
}
finally {
    globalThis.fetch = original;
} });
