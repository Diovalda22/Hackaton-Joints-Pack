import type { Remnant, OrderInput, Order, PlanRun, PlanResult, Placement, ReasonCode, SolverStatus } from './types';
import { eligible, totalArea, totalPieces } from './validation';
const date = '2026-10-13T08:00:00+07:00';
function remnant(id: string, code: string, w: number, h: number, material = 'COTTON', color = 'BLACK', review = false, quarantine = false): Remnant { return { id, code, lot_code: 'LOT-DEMO-2026', material_code: material, color_code: color, width_mm: w, height_mm: h, verification_status: review ? 'NEEDS_REVIEW' : 'VERIFIED', stock_status: quarantine ? 'QUARANTINED' : 'AVAILABLE', condition_note: 'Lembar contoh sintetis, bukan pengukuran lapangan.', source_note: 'Fixture demo LoopCut AI', created_at: date, updated_at: date }; }
export const demoRemnants: Remnant[] = [remnant('r_01', 'REM-001', 1200, 800), remnant('r_02', 'REM-002', 800, 600), remnant('r_03', 'REM-003', 500, 1400), remnant('r_04', 'REM-004', 1000, 700, 'DENIM', 'NAVY'), remnant('r_05', 'REM-005', 900, 600, 'COTTON', 'WHITE'), remnant('r_06', 'REM-006', 1000, 800, 'COTTON', 'BLACK', true), remnant('r_07', 'REM-007', 800, 500, 'POLYESTER', 'BLACK', false, true)];
function line(label: string, w: number, h: number, q = 1, rot = false, material = 'COTTON', color = 'BLACK') { return { label, material_code: material, color_code: color, width_mm: w, height_mm: h, quantity: q, allow_rotation_90: rot }; }
export const scenarios: {
    id: string;
    name: string;
    description: string;
    order: OrderInput;
    status: SolverStatus;
}[] = [
    { id: 'normal', name: 'Aksesori tote bag', description: 'Lima komponen terpenuhi; hasil seri dengan baseline.', order: { name: 'Aksesori tote bag', lines: [line('Panel depan', 600, 400, 2), line('Saku dalam', 300, 200, 3, true)] }, status: 'OPTIMAL' },
    { id: 'rotation', name: 'Rotasi 90°', description: 'Panel panjang hanya muat dengan rotasi pada REM-003.', order: { name: 'Panel panjang — rotasi', lines: [line('Panel panjang', 1300, 400, 1, true)] }, status: 'OPTIMAL' },
    { id: 'mismatch', name: 'Bahan tidak cocok', description: 'Tidak tersedia polyester berwarna navy yang terverifikasi.', order: { name: 'Pesanan polyester navy', lines: [line('Panel polyester', 400, 300, 2, false, 'POLYESTER', 'NAVY')] }, status: 'NO_ASSIGNABLE_PIECES' },
    { id: 'oversize', name: 'Ukuran tidak muat', description: 'Bahan cocok, tetapi tidak ada lembar dengan ukuran cukup.', order: { name: 'Panel ukuran besar', lines: [line('Panel besar', 5000, 5000)] }, status: 'NO_ASSIGNABLE_PIECES' },
    { id: 'partial', name: 'Sebagian terpenuhi', description: 'Satu dari tiga panel ditempatkan; sisanya belum teralokasi.', order: { name: 'Tiga panel besar', lines: [line('Panel utama', 900, 700, 3)] }, status: 'OPTIMAL' },
    { id: 'timeout', name: 'Solusi layak / timeout', description: 'Contoh status belum terbukti optimal; runtime berasal dari fixture.', order: { name: 'Solusi layak demo', lines: [line('Panel lebar', 700, 500), line('Panel tambahan', 600, 300)] }, status: 'FEASIBLE_TIMEOUT' },
    { id: 'fallback', name: 'Fallback baseline', description: 'Contoh greedy terpilih saat optimizer tidak memberi hasil lebih baik.', order: { name: 'Fallback demo', lines: [line('Panel persegi', 300, 300, 4)] }, status: 'BASELINE_FALLBACK' }
];
// Canonical signatures intentionally ignore record IDs, names, labels, timestamps and notes.
function lineSignature(order: OrderInput) { return order.lines.map(l => [l.material_code.trim().toUpperCase(), l.color_code.trim().toUpperCase(), l.width_mm, l.height_mm, l.quantity, l.allow_rotation_90].join('|')).join(';'); }
function stockSignature(remnants: Remnant[]) { return remnants.map(r => [r.material_code, r.color_code, r.width_mm, r.height_mm, r.verification_status, r.stock_status].join('|')).sort().join(';'); }
export function matchingScenario(order: OrderInput, pool: Remnant[]) { if (stockSignature(pool) !== stockSignature(demoRemnants.filter(eligible)))
    return undefined; return scenarios.find(s => lineSignature(s.order) === lineSignature(order)); }
function placement(order: Order, remnants: Remnant[], lineIndex: number, unit: number, stockCode: string, x: number, y: number, rotated = false): Placement { const l = order.lines[lineIndex]; const source = demoRemnants.find(r => r.code === stockCode)!; const r = remnants.find(r => r.material_code === source.material_code && r.color_code === source.color_code && r.width_mm === source.width_mm && r.height_mm === source.height_mm)!; return { piece_instance_id: `${l.id}#${unit}`, order_line_id: l.id, remnant_id: r.id, x_mm: x, y_mm: y, placed_width_mm: rotated ? l.height_mm : l.width_mm, placed_height_mm: rotated ? l.width_mm : l.height_mm, rotated }; }
function result(order: Order, placements: Placement[], reason: ReasonCode = 'UNALLOCATED_AFTER_SEARCH'): PlanResult { const placed = new Set(placements.map(p => p.piece_instance_id)); const unallocated = order.lines.flatMap(l => Array.from({ length: l.quantity }, (_, i) => ({ piece_instance_id: `${l.id}#${i + 1}`, reason_code: reason }))).filter(p => !placed.has(p.piece_instance_id)); const area = placements.reduce((s, p) => s + p.placed_width_mm * p.placed_height_mm, 0); const total = totalArea(order); return { placements, unallocated, metrics: { reuse_area_mm2: area, reuse_area_m2: area / 1e6, unallocated_area_mm2: total - area, unallocated_area_m2: (total - area) / 1e6, area_coverage_pct: 100 * area / total, count_coverage_pct: 100 * placements.length / totalPieces(order), placed_count: placements.length, requested_count: totalPieces(order), used_remnant_count: new Set(placements.map(p => p.remnant_id)).size } }; }
export function createFixturePlan(order: Order, pool: Remnant[], id: string, created_at: string): PlanRun {
    const scenario = matchingScenario(order, pool);
    if (!scenario)
        throw new Error('MOCK_SCENARIO_REQUIRED');
    const p = (li: number, u: number, r: string, x: number, y: number, rot = false) => placement(order, pool, li, u, r, x, y, rot);
    let baseline: Placement[] = [];
    let selected: Placement[] = [];
    if (scenario.id === 'normal') {
        baseline = [p(0, 1, 'REM-002', 0, 0), p(0, 2, 'REM-001', 0, 0), p(1, 1, 'REM-002', 0, 400), p(1, 2, 'REM-002', 300, 400), p(1, 3, 'REM-002', 600, 0, true)];
        selected = [p(0, 1, 'REM-001', 0, 0), p(0, 2, 'REM-001', 600, 0), p(1, 1, 'REM-001', 0, 600), p(1, 2, 'REM-001', 300, 600), p(1, 3, 'REM-001', 600, 600)];
    }
    if (scenario.id === 'rotation')
        baseline = selected = [p(0, 1, 'REM-003', 0, 0, true)];
    if (scenario.id === 'partial')
        baseline = selected = [p(0, 1, 'REM-001', 0, 0)];
    if (scenario.id === 'timeout') {
        baseline = [p(0, 1, 'REM-002', 0, 0), p(1, 1, 'REM-001', 0, 0)];
        selected = [p(0, 1, 'REM-001', 0, 0), p(1, 1, 'REM-001', 0, 500)];
    }
    if (scenario.id === 'fallback')
        baseline = selected = [p(0, 1, 'REM-002', 0, 0), p(0, 2, 'REM-002', 300, 0), p(0, 3, 'REM-002', 0, 300), p(0, 4, 'REM-002', 300, 300)];
    const reason: ReasonCode = scenario.id === 'mismatch' ? 'NO_VERIFIED_MATERIAL_MATCH' : scenario.id === 'oversize' ? 'DOES_NOT_FIT_ANY_COMPATIBLE_REMNANT' : 'UNALLOCATED_AFTER_SEARCH';
    const plan: PlanRun = { id, order_id: order.id, created_at, solver_status: scenario.status, selected_strategy: scenario.status === 'BASELINE_FALLBACK' ? 'GREEDY' : 'OPTIMIZER', solver_metadata: { engine: 'synthetic-fixture', engine_version: '1.0', random_seed: 2026, time_limit_sec: 8, wall_time_sec: scenario.id === 'timeout' || scenario.id === 'fallback' ? 8 : 0.21, raw_solver_status: scenario.status === 'OPTIMAL' ? 'OPTIMAL' : scenario.status === 'FEASIBLE_TIMEOUT' ? 'FEASIBLE' : scenario.status === 'BASELINE_FALLBACK' ? 'UNKNOWN' : 'SKIPPED' }, input_snapshot: { order: structuredClone(order), remnants: structuredClone(pool), solver_time_limit_sec: 8 }, baseline: result(order, baseline, reason), selected: result(order, selected, reason), comparison: { gain_vs_greedy_mm2: 0, gain_vs_greedy_m2: 0, gain_vs_greedy_count: 0 }, excluded_remnants: [], warnings: ['Data dan hasil sintetis dari fixture; tidak menjalankan solver.', 'Simulasi perencanaan; belum mengurangi stok dan belum menjamin penghematan pembelian bahan.'] };
    validateFixture(plan);
    return plan;
}
export function validateFixture(plan: PlanRun) {
    for (const result of [plan.baseline, plan.selected]) {
        const seen = new Set<string>();
        for (const p of result.placements) {
            const r = plan.input_snapshot.remnants.find(r => r.id === p.remnant_id);
            const l = plan.input_snapshot.order.lines.find(l => l.id === p.order_line_id);
            if (!r || !l || !eligible(r) || r.material_code !== l.material_code || r.color_code !== l.color_code || seen.has(p.piece_instance_id) || !Array.from({ length: l.quantity }, (_, i) => `${l.id}#${i + 1}`).includes(p.piece_instance_id))
                throw new Error('Fixture identity/material invalid');
            seen.add(p.piece_instance_id);
            if (![p.x_mm, p.y_mm, p.placed_width_mm, p.placed_height_mm].every(Number.isInteger) || p.x_mm < 0 || p.y_mm < 0 || p.x_mm + p.placed_width_mm > r.width_mm || p.y_mm + p.placed_height_mm > r.height_mm)
                throw new Error('Fixture outside remnant');
            if (p.rotated && !l.allow_rotation_90 || p.placed_width_mm !== (p.rotated ? l.height_mm : l.width_mm) || p.placed_height_mm !== (p.rotated ? l.width_mm : l.height_mm))
                throw new Error('Fixture rotation invalid');
        }
        for (let i = 0; i < result.placements.length; i++)
            for (let j = i + 1; j < result.placements.length; j++) {
                const a = result.placements[i], b = result.placements[j];
                if (a.remnant_id === b.remnant_id && a.x_mm < b.x_mm + b.placed_width_mm && b.x_mm < a.x_mm + a.placed_width_mm && a.y_mm < b.y_mm + b.placed_height_mm && b.y_mm < a.y_mm + a.placed_height_mm)
                    throw new Error('Fixture overlap');
            }
        const all = plan.input_snapshot.order.lines.flatMap(l => Array.from({ length: l.quantity }, (_, i) => `${l.id}#${i + 1}`));
        const reported = [...seen, ...result.unallocated.map(u => u.piece_instance_id)];
        if (reported.length !== all.length || new Set(reported).size !== all.length || all.some(id => !reported.includes(id)))
            throw new Error('Fixture incomplete');
        const area = result.placements.reduce((a, p) => a + p.placed_width_mm * p.placed_height_mm, 0);
        const m = result.metrics;
        const expected = [area, area / 1e6, totalArea(plan.input_snapshot.order) - area, (totalArea(plan.input_snapshot.order) - area) / 1e6, 100 * area / totalArea(plan.input_snapshot.order), 100 * seen.size / all.length, seen.size, all.length, new Set(result.placements.map(p => p.remnant_id)).size];
        const actual = [m.reuse_area_mm2, m.reuse_area_m2, m.unallocated_area_mm2, m.unallocated_area_m2, m.area_coverage_pct, m.count_coverage_pct, m.placed_count, m.requested_count, m.used_remnant_count];
        if (actual.some((v, i) => v !== expected[i]))
            throw new Error('Fixture metrics invalid');
    }
    if (plan.comparison.gain_vs_greedy_mm2 !== plan.selected.metrics.reuse_area_mm2 - plan.baseline.metrics.reuse_area_mm2 || plan.comparison.gain_vs_greedy_m2 !== plan.comparison.gain_vs_greedy_mm2 / 1e6 || plan.comparison.gain_vs_greedy_count !== plan.selected.metrics.placed_count - plan.baseline.metrics.placed_count)
        throw new Error('Fixture comparison invalid');
}
