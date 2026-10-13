import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHttpService, ApiError } from '../src/lib/api';
import { remnantSchema, eligible } from '../src/lib/validation';
import { RemnantCanvas, PlanStatusNotice } from '../src/components/plan-results';

// Same HTTP adapter used by pages. Only the transport is replaced by an ASGI bridge
// because the sandbox cannot open the Next.js port; neither API nor solver is mocked.
test('frontend HTTP adapter → FastAPI → SQLite/CP-SAT → frontend renderer', async () => {
    const backend = resolve('../backend');
    const python = join(backend, '.venv/bin/python');
    const directory = mkdtempSync(join(tmpdir(), 'loopcut-integration-'));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        const parsed = new URL(String(url));
        const request = { database_path: join(directory, 'workspace.db'), path: parsed.pathname + parsed.search,
            method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body ?? null };
        const processResult = spawnSync(python, [join(backend, 'tests/asgi_bridge.py')], {
            cwd: backend, input: JSON.stringify(request) + '\n', encoding: 'utf8', timeout: 15000,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (processResult.status !== 0) throw processResult.error ?? new Error(processResult.stderr || 'Backend bridge failed');
        const response = JSON.parse(processResult.stdout);
        return new Response(JSON.stringify(response.body), { status: response.status, headers: response.headers });
    };
    try {
        const service = createHttpService('http://backend.test');
        assert.equal((await service.health()).status, 'ok');
        const created = await service.createRemnant({ code: 'INTEGRATION-001', material_code: 'cotton', color_code: 'black',
            width_mm: 1100, height_mm: 800 });
        assert.equal(created.verification_status, 'NEEDS_REVIEW');
        assert.equal(remnantSchema.safeParse(created).success, true, 'Backend optional fields must pass the actual frontend schema');
        assert.equal(eligible(created), false);
        const stock = await service.updateRemnant(created.id, { verification_status: 'VERIFIED' });
        assert.equal(eligible(stock), true);
        const order = await service.createOrder({ name: 'Pesanan bebas integrasi', lines: [{ label: 'Panel bebas',
            material_code: 'COTTON', color_code: 'BLACK', width_mm: 457, height_mm: 311, quantity: 2, allow_rotation_90: false }] });
        assert.equal((await service.listOrders()).items[0].lines[0].quantity, 2);
        const before = await service.listRemnants();
        const plan = await service.runPlan({ order_id: order.id, solver_time_limit_sec: 2 });
        assert.equal(plan.solver_metadata.engine, 'ortools-cpsat');
        assert.equal(plan.solver_status, 'OPTIMAL');
        assert.equal(plan.selected.metrics.reuse_area_mm2, 457 * 311 * 2);
        assert.equal(plan.selected.metrics.placed_count, 2);
        assert.deepEqual(await service.listRemnants(), before, 'Plan must not consume stock');
        const rendered = renderToStaticMarkup(<RemnantCanvas remnant={plan.input_snapshot.remnants[0]} placements={plan.selected.placements}/>);
        assert.match(rendered, /viewBox="0 0 1100 800"/);
        assert.match(rendered, /width="457" height="311"/);
        const status = renderToStaticMarkup(<PlanStatusNotice plan={plan}/>);
        assert.doesNotMatch(status, /Contoh status fixture/);
        await service.updateRemnant(stock.id, { width_mm: 1099 });
        assert.equal((await service.listRemnants()).items[0].verification_status, 'NEEDS_REVIEW');
        assert.deepEqual(await service.getPlan(plan.id), plan, 'Snapshot persists across fresh Python/API/database instances');
        await assert.rejects(() => service.createRemnant({ code: 'INTEGRATION-001', material_code: 'COTTON', color_code: 'BLACK', width_mm: 1, height_mm: 1 }),
            e => e instanceof ApiError && e.code === 'DUPLICATE_REMNANT_CODE' && e.status === 409);
        await service.updateRemnant(stock.id, { verification_status: 'VERIFIED' });
        const mismatch = await service.createOrder({ name: 'Tidak cocok', lines: [{ label: 'Panel denim', material_code: 'DENIM', color_code: 'NAVY',
            width_mm: 50, height_mm: 50, quantity: 1, allow_rotation_90: false }] });
        const empty = await service.runPlan({ order_id: mismatch.id });
        assert.equal(empty.solver_status, 'NO_ASSIGNABLE_PIECES');
        assert.equal(empty.selected.unallocated[0].reason_code, 'NO_VERIFIED_MATERIAL_MATCH');
        const rotationStock = await service.createRemnant({ code: 'INTEGRATION-ROT', material_code: 'COTTON', color_code: 'BLACK', width_mm: 400, height_mm: 900 });
        await service.updateRemnant(rotationStock.id, { verification_status: 'VERIFIED' });
        const rotationOrder = await service.createOrder({ name: 'Rotasi integrasi', lines: [{ label: 'Panel panjang', material_code: 'COTTON', color_code: 'BLACK', width_mm: 900, height_mm: 400, quantity: 1, allow_rotation_90: true }] });
        const rotationPlan = await service.runPlan({ order_id: rotationOrder.id, remnant_ids: [rotationStock.id], solver_time_limit_sec: 2 });
        assert.equal(rotationPlan.selected.placements[0].rotated, true);
        assert.equal(rotationPlan.selected.placements[0].placed_width_mm, 400);
        assert.equal(rotationPlan.selected.placements[0].placed_height_mm, 900);
        const rotationSvg = renderToStaticMarkup(<RemnantCanvas remnant={rotationPlan.input_snapshot.remnants[0]} placements={rotationPlan.selected.placements}/>);
        assert.match(rotationSvg, /viewBox="0 0 400 900"/);
        assert.match(rotationSvg, /width="400" height="900"/);
        await assert.rejects(() => service.getOrder('missing'), e => e instanceof ApiError && e.code === 'NOT_FOUND');
    } finally {
        globalThis.fetch = originalFetch;
        rmSync(directory, { recursive: true, force: true });
    }
});
