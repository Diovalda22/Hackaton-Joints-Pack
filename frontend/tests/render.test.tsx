import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { RemnantCanvas, PlanStatusNotice, pieceColor } from '../src/components/plan-results';
import { MetricCard } from '../src/components/common';
import { createFixturePlan, demoRemnants, scenarios } from '../src/lib/fixtures';
import { eligible } from '../src/lib/validation';
import type { Order } from '../src/lib/types';
const input = scenarios.find(s => s.id === 'rotation')!.order;
const order: Order = { ...input, id: 'o', created_at: 'now', lines: input.lines.map((l, i) => ({ ...l, id: `l_${i}` })) };
const plan = createFixturePlan(order, demoRemnants.filter(eligible), 'p', 'now');
test('SVG uses actual viewBox, top-left coordinates and final oriented dimensions once', () => { const remnant = plan.input_snapshot.remnants.find(r => r.id === plan.selected.placements[0].remnant_id)!; const html = renderToStaticMarkup(<RemnantCanvas remnant={remnant} placements={plan.selected.placements}/>); assert.match(html, /viewBox="0 0 500 1400"/); assert.match(html, /preserveAspectRatio="xMidYMid meet"/); assert.match(html, /width="400" height="1300"/); assert.match(html, /tabindex="0"/); assert.match(html, /aria-label=/); assert.match(html, /Rotasi 90°/); });
test('piece colors are stable across plan modes', () => assert.equal(pieceColor('same#1'), pieceColor('same#1')));
test('timeout notice does not label itself optimal and explicitly labels fixture', () => { const p = structuredClone(plan); p.solver_status = 'FEASIBLE_TIMEOUT'; const html = renderToStaticMarkup(<PlanStatusNotice plan={p}/>); assert.match(html, /belum terbukti optimal/); assert.match(html, /solver tidak dijalankan/); assert.doesNotMatch(html, /Optimal — terbukti/); });
test('actual HTTP plan shows true backend status without fixture claim', () => { const p = structuredClone(plan); p.solver_metadata.engine = 'ortools-cpsat'; p.solver_status = 'BASELINE_FALLBACK'; const html = renderToStaticMarkup(<PlanStatusNotice plan={p}/>); assert.match(html, /Fallback baseline/); assert.doesNotMatch(html, /Contoh status fixture/); });
test('metric exposes unit and definition to keyboard/screen readers', () => { const html = renderToStaticMarkup(<MetricCard label="Luas reuse" value="0" unit="m²" definition="Luas komponen"/>); assert.match(html, /m²/); assert.match(html, /tabindex="0"/); assert.match(html, /aria-label="Luas komponen"/); });
test('defect overlay renders snapshot coordinates, dimensions and accessible labels', () => {
    const remnant = plan.input_snapshot.remnants[0];
    const html = renderToStaticMarkup(<RemnantCanvas remnant={remnant} placements={[]} defects={[{ id: 'd', remnant_id: remnant.id,
        x_mm: 20, y_mm: 30, width_mm: 40, height_mm: 50, defect_type: 'TEAR', note: 'Pemetaan manual' }]} />);
    assert.match(html, /x="20" y="30" width="40" height="50"/);
    assert.match(html, /Zona cacat TEAR/);
    assert.match(html, /Pemetaan manual/);
});
