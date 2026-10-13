'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Clock3, ShieldCheck, AlertTriangle, Scissors, Info, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatArea, formatNumber } from '@/lib/validation';
import type { Placement, Remnant, RemnantDefect, SolverStatus, PlanRun } from '@/lib/types';
import { ExecutionLaunch } from './roadmap';
import { PageHeading, ErrorState, LoadingState, MetricCard, Notice, EmptyState } from './common';
const palette = ['#9dbbdc', '#b8c9a2', '#d9b9a4', '#b8b1d3', '#9ac7c8', '#e2c783'];
export function pieceColor(id: string) { let h = 0; for (const c of id)
    h = (h * 31 + c.charCodeAt(0)) >>> 0; return palette[h % palette.length]; }
export function RemnantCanvas({ remnant, placements, defects = [] }: {
    remnant: Remnant;
    placements: Placement[];
    defects?: RemnantDefect[];
}) {
    return <div className="canvas-frame">
    <div className="canvas-ruler">
    <span>0, 0 ↘</span>
    <span>{remnant.width_mm} mm</span>
    </div>
    <svg viewBox={`0 0 ${remnant.width_mm} ${remnant.height_mm}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Layout ${remnant.code}, ${remnant.width_mm} kali ${remnant.height_mm} mm. ${placements.length} potongan; koordinat tersedia pada tabel.`} className="remnant-svg">
    <rect x={0} y={0} width={remnant.width_mm} height={remnant.height_mm} fill="#f1f3ee" stroke="#8c9f90" strokeWidth={2} vectorEffect="non-scaling-stroke"/>{placements.map(p => <g key={p.piece_instance_id} tabIndex={0} className="svg-piece" aria-label={`${p.piece_instance_id}, x ${p.x_mm}, y ${p.y_mm}, ${p.placed_width_mm} kali ${p.placed_height_mm} mm, ${p.rotated ? 'rotasi 90 derajat' : 'tanpa rotasi'}`}>
        <title>{`${p.piece_instance_id} · ${p.placed_width_mm} × ${p.placed_height_mm} mm · x=${p.x_mm}, y=${p.y_mm} · ${p.rotated ? 'Rotasi 90°' : 'Rotasi 0°'}`}</title>
        <rect x={p.x_mm} y={p.y_mm} width={p.placed_width_mm} height={p.placed_height_mm} fill={pieceColor(p.piece_instance_id)} fillOpacity={0.88} stroke="#496977" strokeWidth={1.4} vectorEffect="non-scaling-stroke"/>
        <text x={p.x_mm + p.placed_width_mm / 2} y={p.y_mm + p.placed_height_mm / 2} fontSize={Math.min(p.placed_width_mm / 12, p.placed_height_mm / 5, remnant.width_mm / 35)} textAnchor="middle" dominantBaseline="middle" fill="#233f49" fontWeight={600} pointerEvents="none">{p.piece_instance_id.length > 17 ? `${p.order_line_id.slice(0, 5)}…#${p.piece_instance_id.split('#')[1]}` : p.piece_instance_id}</text>
        </g>)}{defects.map(d => <g key={d.id} tabIndex={0} aria-label={`Zona cacat ${d.defect_type}, x ${d.x_mm}, y ${d.y_mm}, ${d.width_mm} kali ${d.height_mm} mm`}>
            <title>{`${d.defect_type} · ${d.width_mm} × ${d.height_mm} mm · x=${d.x_mm}, y=${d.y_mm} · ${d.note}`}</title>
            <rect x={d.x_mm} y={d.y_mm} width={d.width_mm} height={d.height_mm} fill="#b84646" fillOpacity={0.6} stroke="#8c2828" strokeDasharray="4 3" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </g>)}</svg>
    <div className="canvas-bottom">
    <span>Origin kiri atas · skala proporsional</span>
    <strong>{remnant.height_mm} mm ↑↓</strong>
    </div>
    </div>;
}
const statuses: Record<SolverStatus, {
    label: string;
    detail: string;
    tone: 'success' | 'warning' | 'info';
}> = { OPTIMAL: { label: 'Optimal — terbukti', detail: 'Backend melaporkan optimum dan hasil tervalidasi.', tone: 'success' }, FEASIBLE_TIMEOUT: { label: 'Layak — belum terbukti optimal', detail: 'Ditemukan rencana valid, tetapi belum terbukti paling optimal.', tone: 'warning' }, BASELINE_FALLBACK: { label: 'Fallback baseline', detail: 'Perhitungan lanjutan belum selesai atau tidak memberi hasil lebih baik; menampilkan rencana baseline yang valid.', tone: 'warning' }, NO_ASSIGNABLE_PIECES: { label: 'Tidak ada komponen yang dapat dialokasikan', detail: 'Periksa kesesuaian bahan, warna, dimensi, dan verifikasi stok.', tone: 'info' } };
export function PlanStatusNotice({ plan }: {
    plan: PlanRun;
}) {
    const status = statuses[plan.solver_status] ?? { label: plan.solver_status, detail: 'Periksa status dari layanan perencanaan.', tone: 'info' };
    const synthetic = plan.solver_metadata.engine === 'synthetic-fixture';
    return <Notice tone={status.tone}>
    <strong>{synthetic ? 'Contoh status fixture: ' : ''}{status.label}</strong>
    <p>{synthetic ? 'Status ini memperagakan respons backend; solver tidak dijalankan pada demo.' : status.detail}</p>{synthetic && <p>Makna status API: {status.detail}</p>}</Notice>;
}
const reasons = { NO_VERIFIED_MATERIAL_MATCH: 'Belum ada stok terverifikasi dengan bahan dan warna sesuai.', DOES_NOT_FIT_ANY_COMPATIBLE_REMNANT: 'Ukuran tidak muat pada kain yang kompatibel, termasuk rotasi yang diizinkan.', UNALLOCATED_AFTER_SEARCH: 'Belum ditempatkan oleh rencana terpilih; bukan bukti bahwa penempatan mustahil.', BLOCKED_BY_DEFECT: 'Secara dimensi muat, tetapi tidak ada posisi bebas zona cacat pada kain yang kompatibel.' };
function stockDiff(snapshot: Remnant, actual?: Remnant) { if (!actual)
    return true; return (['material_code', 'color_code', 'width_mm', 'height_mm', 'verification_status', 'stock_status', 'condition_note', 'source_note', 'lot_code', 'code', 'updated_at'] as const).some(k => snapshot[k] !== actual[k]); }
export function PlanResults({ id }: {
    id: string;
}) {
    const query = useQuery({ queryKey: ['plan', id], queryFn: () => api.getPlan(id) });
    const stock = useQuery({ queryKey: ['remnants'], queryFn: () => api.listRemnants() });
    const [mode, setMode] = useState<'selected' | 'baseline'>('selected');
    if (query.isLoading)
        return <LoadingState message="Memuat snapshot rencana…"/>;
    if (query.error)
        return <ErrorState error={query.error} retry={() => query.refetch()}/>;
    const plan = query.data!;
    const synthetic = plan.solver_metadata.engine === 'synthetic-fixture';
    const result = plan[mode];
    const m = result.metrics;
    const rems = plan.input_snapshot.remnants;
    const used = rems.filter(r => result.placements.some(p => p.remnant_id === r.id));
    const changed = stock.data && rems.some(r => stockDiff(r, stock.data.items.find(a => a.id === r.id)));
    return <>
    <PageHeading eyebrow="03 / VERIFIED CUTTING PLAN" title={plan.input_snapshot.order.name} description={`Rencana ${new Date(plan.created_at).toLocaleString('id-ID')} · snapshot input tersimpan`} action={<Link href={`/orders/${plan.order_id}`} className="button button-outline">
        <ArrowLeft size={16}/>Ringkasan pesanan</Link>}/>
    <div className="plan-meta">
    <span className="badge badge-blue">
    <ShieldCheck size={13}/> {synthetic ? 'Snapshot sintetis' : 'Snapshot perhitungan'}</span>
    <span>
    <Clock3 size={14}/>{formatNumber(plan.solver_metadata.wall_time_sec)} detik {synthetic ? '(fixture)' : ''}</span>
    <span>Strategi: {plan.selected_strategy}</span>
    <code>{plan.solver_status}</code>
    </div>
    <PlanStatusNotice plan={plan}/><ExecutionLaunch planId={id} hasPlacements={plan.selected.placements.length > 0} />{changed && <Notice tone="warning">Stok terbaru berbeda dengan snapshot run ini. Layout historis tetap menggunakan data saat rencana dibuat.</Notice>}{stock.error && <Notice tone="warning">Status inventaris terbaru belum dapat diperiksa. Snapshot rencana tetap tersedia.</Notice>}<div className="result-metrics">
    <MetricCard label="Luas reuse" value={formatArea(m.reuse_area_m2)} unit="m²" definition="Jumlah luas komponen yang dialokasikan dari kain sisa." foot={mode === 'selected' ? 'Hasil terpilih' : 'Greedy baseline'}/>
    <MetricCard label="Cakupan luas pesanan" value={formatNumber(m.area_coverage_pct)} unit="%" definition="Luas komponen teralokasi dibagi total luas komponen pesanan, bukan packing density."/>
    <MetricCard label="Komponen terpenuhi" value={`${m.placed_count} / ${m.requested_count}`} unit="unit" definition="Jumlah unit yang ditempatkan dibanding jumlah unit yang diminta."/>
    <MetricCard label="Belum teralokasi" value={formatArea(m.unallocated_area_m2)} unit="m²" definition="Luas komponen yang belum ditempatkan; bukan estimasi pembelian kain baru."/>
    <MetricCard label="Selisih vs greedy" value={formatArea(plan.comparison.gain_vs_greedy_m2)} unit="m²" definition="Luas reuse selected dikurangi baseline, pada input dan batasan identik." foot={plan.comparison.gain_vs_greedy_m2 === 0 ? 'Tidak ada peningkatan luas' : 'Selisih luas komponen'}/>
    </div>
    <section className="comparison-bar">
    <div>
    <span className="eyebrow">PERBANDINGAN YANG SAMA</span>
    <p>Input, aturan material, dan batasan identik.</p>
    </div>
    <div className="comparison-numbers">
    <div>
    <span>Greedy baseline</span>
    <strong>{formatArea(plan.baseline.metrics.reuse_area_m2)} <small>m²</small>
    </strong>
    </div>
    <ArrowRight size={18}/>
    <div>
    <span>Selected plan</span>
    <strong>{formatArea(plan.selected.metrics.reuse_area_m2)} <small>m²</small>
    </strong>
    </div>
    </div>
    <div className="plan-toggle" role="group" aria-label="Pilih tampilan rencana">
    <button aria-pressed={mode === 'baseline'} className={mode === 'baseline' ? 'selected' : ''} onClick={() => setMode('baseline')}>Greedy baseline</button>
    <button aria-pressed={mode === 'selected'} className={mode === 'selected' ? 'selected' : ''} onClick={() => setMode('selected')}>Selected plan</button>
    </div>
    </section>
    <div className="results-columns">
    <div>
    <section className="panel layout-panel">
    <div className="section-heading">
    <div>
    <h2>
    <Scissors size={19}/>Layout pemotongan</h2>
    <p>{mode === 'selected' ? 'Selected plan' : 'Greedy baseline'} · {m.used_remnant_count} kain digunakan</p>
    </div>
    <span className="badge badge-gray">SVG / MM</span>
    </div>{used.length ? <div className="remnant-gallery">{used.map(r => <article className="remnant-card" key={r.id}>
            <header>
            <div>
            <h3>{r.code}</h3>
            <span>{r.material_code} / {r.color_code}</span>
            </div>
            <span>{r.width_mm} × {r.height_mm} mm</span>
            </header>
            <RemnantCanvas remnant={r} placements={result.placements.filter(p => p.remnant_id === r.id)} defects={plan.input_snapshot.remnant_defects?.[r.id]} />
            </article>)}</div> : <EmptyState title="Tidak ada placement pada rencana ini" description="Lihat alasan setiap komponen pada panel tidak teralokasi."/>}{rems.length > used.length && <div className="unused-note">Kain snapshot yang tidak digunakan: {rems.filter(r => !used.includes(r)).map(r => r.code).join(', ') || '—'}</div>}</section>
    <section className="panel placement-panel">
    <div className="section-heading">
    <h2>Koordinat potongan</h2>
    <span className="quiet-label">ALTERNATIF TABEL</span>
    </div>
    <div className="table-scroll">
    <table>
    <caption className="sr-only">Koordinat {mode === 'selected' ? 'hasil terpilih' : 'baseline'}, semua ukuran dalam mm</caption>
    <thead>
    <tr>
    <th>Unit komponen</th>
    <th>Kain</th>
    <th>X</th>
    <th>Y</th>
    <th>Lebar</th>
    <th>Tinggi</th>
    <th>Rotasi</th>
    </tr>
    </thead>
    <tbody>{result.placements.map(p => <tr key={p.piece_instance_id}>
        <td>
        <span className="piece-dot" style={{ background: pieceColor(p.piece_instance_id) }}/>
        <span title={p.piece_instance_id} className="piece-id">{p.piece_instance_id}</span>
        </td>
        <td>{rems.find(r => r.id === p.remnant_id)?.code}</td>
        <td>{p.x_mm}</td>
        <td>{p.y_mm}</td>
        <td>{p.placed_width_mm}</td>
        <td>{p.placed_height_mm}</td>
        <td>{p.rotated ? '90°' : '0°'}</td>
        </tr>)}</tbody>
    </table>{!result.placements.length && <p className="table-empty">Tidak ada koordinat untuk ditampilkan.</p>}</div>
    </section>
    </div>
    <aside>
    <section className="panel unallocated-panel">
    <div className="section-heading">
    <h2>
    <AlertTriangle size={18}/>Tidak teralokasi</h2>
    <span className="badge badge-amber">{result.unallocated.length} UNIT</span>
    </div>{result.unallocated.length ? <ul className="unallocated-list">{result.unallocated.map(u => <li key={u.piece_instance_id}>
            <strong>{plan.input_snapshot.order.lines.find(l => u.piece_instance_id.startsWith(`${l.id}#`))?.label ?? 'Komponen'}</strong>
            <small className="piece-id">{u.piece_instance_id}</small>
            <p>{reasons[u.reason_code] ?? u.reason_code}</p>
            <code>{u.reason_code}</code>
            </li>)}</ul> : <div className="all-allocated">
        <CheckCircle2 size={28}/>
        <h3>Semua komponen terpenuhi</h3>
        <p>Seluruh unit ditempatkan pada rencana ini.</p>
        </div>}</section>{plan.excluded_remnants.length > 0 && <section className="panel">
        <h3>Kain dikecualikan</h3>
        <ul>{plan.excluded_remnants.map(r => <li key={r.remnant_id}>{r.remnant_id}: {r.reason_code}</li>)}</ul>
        </section>}<section className="panel metric-explainer">
    <Info size={20}/>
    <h3>Angka yang bisa dijelaskan</h3>
    <p>Luas reuse menunjukkan luas komponen yang ditempatkan, bukan kain baru yang pasti tidak perlu dibeli.</p>
    <p>Cakupan luas bukan kepadatan layout. Run ini belum mengurangi stok.</p>
    <details>
    <summary>Lihat respons JSON</summary>
    <pre>{JSON.stringify(plan, null, 2)}</pre>
    </details>
    </section>
    </aside>
    </div>
    <div className="plan-warnings">{plan.warnings.map((w, i) => <Notice key={i} tone="warning">{w}</Notice>)}</div>
    <div className="result-actions">
    <Link className="button button-outline" href="/remnants">Kembali ke inventaris</Link>
    <Link className="button button-primary" href="/orders/new">Buat skenario lain<ArrowRight size={16}/>
    </Link>
    </div>
    </>;
}
