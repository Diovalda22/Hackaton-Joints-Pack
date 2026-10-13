import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHttpService, ApiError } from '../src/lib/api';
import { createRoadmapService } from '../src/lib/roadmap-api';
import { RemnantCanvas } from '../src/components/plan-results';

test('roadmap HTTP adapters → real defect solver, execution, reconciliation and CSV persistence', async () => {
    const backend = resolve('../backend');
    const directory = mkdtempSync(join(tmpdir(), 'loopcut-roadmap-integration-'));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        const parsed = new URL(String(url));
        const result = spawnSync(join(backend, '.venv/bin/python'), [join(backend, 'tests/asgi_bridge.py')], {
            cwd: backend, input: JSON.stringify({ database_path: join(directory, 'demo.db'), roadmap: true,
                path: parsed.pathname + parsed.search, method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body ?? null }) + '\n',
            encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (result.status !== 0) throw result.error ?? new Error(result.stderr || 'Backend failed');
        const response = JSON.parse(result.stdout);
        return new Response(JSON.stringify(response.body), { status: response.status, headers: response.headers });
    };
    try {
        const api = createHttpService('http://backend.test');
        const roadmap = createRoadmapService('http://backend.test');
        assert.equal((await api.health()).capabilities?.executions, true);
        const stock = await api.createRemnant({ code: 'ROADMAP-001', material_code: 'COTTON', color_code: 'BLACK', width_mm: 1000, height_mm: 800 });
        await roadmap.replaceDefects(stock.id, stock.updated_at, [{ x_mm: 0, y_mm: 0, width_mm: 200, height_mm: 800, defect_type: 'TEAR', note: 'Demo' }]);
        await api.updateRemnant(stock.id, { verification_status: 'VERIFIED' });
        const order = await api.createOrder({ name: 'Roadmap integration', lines: [{ label: 'Panel', material_code: 'COTTON', color_code: 'BLACK', width_mm: 350, height_mm: 300, quantity: 2, allow_rotation_90: true }] });
        const plan = await api.runPlan({ order_id: order.id, remnant_ids: [stock.id], solver_time_limit_sec: 1 });
        assert.equal(plan.selected.metrics.placed_count, 2);
        assert.ok(plan.selected.placements.every(p => p.x_mm >= 200));
        const svg = renderToStaticMarkup(<RemnantCanvas remnant={plan.input_snapshot.remnants[0]} placements={plan.selected.placements} defects={plan.input_snapshot.remnant_defects?.[stock.id]} />);
        assert.match(svg, /Zona cacat TEAR/);
        assert.match(svg, /width="200" height="800"/);
        const ex = await roadmap.createExecution(plan.id);
        await roadmap.transition(ex.id, 'approve');
        await roadmap.transition(ex.id, 'start');
        await roadmap.patchItem(ex.id, ex.items[0].piece_instance_id, 'COMPLETED', 'Sesuai snapshot');
        await roadmap.patchItem(ex.id, ex.items[1].piece_instance_id, 'FAILED', 'Simulasi deviasi');
        const confirmed = await roadmap.transition(ex.id, 'confirm', 'Demo only');
        assert.equal(confirmed.confirmed_reuse_area_m2, 350 * 300 / 1e6);
        assert.deepEqual(await roadmap.transition(ex.id, 'confirm'), confirmed);
        assert.equal((await api.listRemnants()).items.find(r => r.id === stock.id)?.stock_status, 'QUARANTINED');
        assert.equal((await roadmap.reports('SYNTHETIC_DEMO')).pending_reconciliation_count, 1);
        assert.equal((await roadmap.reports('OPERATOR_REPORTED')).confirmed_reuse_area_m2, 0);
        await assert.rejects(() => api.updateRemnant(stock.id, { stock_status: 'AVAILABLE' }), e => e instanceof ApiError && e.status === 409);
        const rec = await roadmap.reconcile(ex.id, stock.id, [{ code: 'LEFT-001', width_mm: 300, height_mm: 200, condition_note: 'Terukur' }], 'Demo');
        const history = await roadmap.history(rec.new_remnant_ids[0]);
        assert.equal(history.parent?.source_remnant_id, stock.id);
        assert.equal((await roadmap.reports('SYNTHETIC_DEMO')).pending_reconciliation_count, 0);
        assert.deepEqual(await api.getPlan(plan.id), plan);
        const preview = await roadmap.previewCsv('code,lot_code,material_code,color_code,width_mm,height_mm,quantity,condition_note\nCSV,LOT,COTTON,BLACK,100,200,3,Diukur\n');
        assert.equal(preview.sheet_count, 3);
        const committed = await roadmap.commitCsv(preview.preview_token);
        assert.deepEqual((await roadmap.commitCsv(preview.preview_token)).remnant_ids, committed.remnant_ids);
        const imported = (await api.listRemnants()).items.filter(r => committed.remnant_ids.includes(r.id));
        assert.equal(imported.length, 3);
        assert.ok(imported.every(r => r.verification_status === 'NEEDS_REVIEW'));
        await roadmap.bulkVerify(imported.map(r => ({ id: r.id, expected_updated_at: r.updated_at })));
        assert.ok((await api.listRemnants()).items.filter(r => committed.remnant_ids.includes(r.id)).every(r => r.verification_status === 'VERIFIED'));
    } finally {
        globalThis.fetch = originalFetch;
        rmSync(directory, { recursive: true, force: true });
    }
});
