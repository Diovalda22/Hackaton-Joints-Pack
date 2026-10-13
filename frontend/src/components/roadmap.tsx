'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { roadmapApi } from '@/lib/roadmap-api';
import type { Capabilities, CutExecution, ExecutionItem, ExecutionOutcome, MeasuredLeftover, ReportSummary } from '@/lib/types';
import { formatArea } from '@/lib/validation';
import { Button } from './ui/button';
import { PageHeading, Notice, ErrorState, LoadingState, MetricCard, EmptyState } from './common';

export function useCapabilities() {
    return useQuery({ queryKey: ['health'], queryFn: () => api.health() });
}

export function RoadmapGate({ feature, children }: { feature: keyof Capabilities; children: ReactNode }) {
    const health = useCapabilities();
    if (health.isLoading) return <LoadingState />;
    if (health.error) return <ErrorState error={health.error} retry={() => health.refetch()} />;
    if (!health.data?.capabilities?.[feature]) return <Notice>Fitur ini belum aktif. Jalankan backend roadmap dengan database demo terisolasi sesuai panduan di README.</Notice>;
    return <>{children}</>;
}

export function ExecutionLaunch({ planId, hasPlacements }: { planId: string; hasPlacements: boolean }) {
    const health = useCapabilities();
    const enabled = !!health.data?.capabilities?.executions;
    const router = useRouter();
    const list = useQuery({ queryKey: ['executions', planId], queryFn: () => roadmapApi.listExecutions(planId), enabled });
    const create = useMutation({ mutationFn: () => roadmapApi.createExecution(planId), onSuccess: execution => router.push(`/executions/${execution.id}`) });
    if (!enabled) return null;
    return <section className="panel roadmap-panel">
        <h2>Pelaksanaan pemotongan</h2>
        <p>Simulasi operator pada stok demo terisolasi. Konfirmasi akan mengarantina sumber demo; hasil plan tetap tersimpan.</p>
        <Button disabled={!hasPlacements || create.isPending} onClick={() => create.mutate()}>Simulasikan eksekusi selected plan</Button>
        {create.error && <ErrorState error={create.error} />}
        {list.error && <ErrorState error={list.error} retry={() => list.refetch()} />}
        <div className="roadmap-links">{list.data?.items.map(ex => <Link key={ex.id} href={`/executions/${ex.id}`}>{ex.id.slice(0, 15)} · {ex.status}</Link>)}</div>
    </section>;
}

const outcomeLabels: Record<ExecutionOutcome, string> = { COMPLETED: 'Selesai sesuai layout', FAILED: 'Gagal / ukuran menyimpang', NOT_ATTEMPTED: 'Tidak dicoba' };

function ItemForm({ item, disabled, onSave }: { item: ExecutionItem; disabled: boolean; onSave: (outcome: ExecutionOutcome, note: string) => void }) {
    return <form className="execution-item" onSubmit={e => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        onSave(form.get('outcome') as ExecutionOutcome, String(form.get('note') ?? ''));
    }}>
        <div><strong>{item.piece_instance_id}</strong><small>{formatArea(item.area_mm2 / 1e6)} m² · {item.outcome ? outcomeLabels[item.outcome] : 'Belum ditinjau'}</small></div>
        <label>Hasil potongan<select name="outcome" defaultValue={item.outcome ?? ''} required disabled={disabled}>
            <option value="" disabled>Pilih hasil</option>{Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Catatan<textarea name="note" maxLength={1000} defaultValue={item.note} disabled={disabled} placeholder="Catat deviasi atau alasan kegagalan" /></label>
        <Button type="submit" variant="outline" disabled={disabled}>Simpan hasil</Button>
    </form>;
}

function ReconciliationForm({ executionId, sourceId, sourceCode }: { executionId: string; sourceId: string; sourceCode: string }) {
    const client = useQueryClient();
    const history = useQuery({ queryKey: ['history', sourceId], queryFn: () => roadmapApi.history(sourceId) });
    const [leftovers, setLeftovers] = useState<MeasuredLeftover[]>([]);
    const [note, setNote] = useState('');
    const [inspected, setInspected] = useState(false);
    const save = useMutation({ mutationFn: () => roadmapApi.reconcile(executionId, sourceId, leftovers, note), onSuccess: () => {
        client.invalidateQueries({ queryKey: ['history', sourceId] });
        client.invalidateQueries({ queryKey: ['remnants'] });
        client.invalidateQueries({ queryKey: ['reports'] });
    } });
    if (history.isLoading) return <LoadingState />;
    if (history.error) return <ErrorState error={history.error} retry={() => history.refetch()} />;
    if (history.data?.reconciliation) return <section className="panel roadmap-panel"><h3>{sourceCode} · rekonsiliasi selesai</h3>
        {history.data.reconciliation.new_remnant_ids.length ? history.data.reconciliation.new_remnant_ids.map(id => <p key={id}><Link href={`/remnants/${id}`}>Buka sisa terukur · {id.slice(0, 14)}</Link></p>) : <p>Tidak ada sisa yang dapat digunakan kembali.</p>}
    </section>;
    const update = (index: number, field: keyof MeasuredLeftover, value: string | number) => setLeftovers(rows => rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
    return <form className="panel roadmap-panel" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <h3>Rekonsiliasi {sourceCode}</h3><p>Catat persegi panjang yang benar-benar diukur. Sisa bentuk L tidak otomatis dianggap satu lembar utuh.</p>
        {leftovers.map((row, i) => <fieldset className="roadmap-fieldset" key={i}><legend>Sisa {i + 1}</legend><div className="form-grid">
            <label>Kode lembar<input required maxLength={64} value={row.code} onChange={e => update(i, 'code', e.target.value)} /></label>
            <label>Lebar (mm)<input required type="number" min={1} max={10000} step={1} value={row.width_mm} onChange={e => update(i, 'width_mm', Number(e.target.value))} /></label>
            <label>Tinggi (mm)<input required type="number" min={1} max={10000} step={1} value={row.height_mm} onChange={e => update(i, 'height_mm', Number(e.target.value))} /></label>
            <label>Kondisi<input maxLength={1000} value={row.condition_note} onChange={e => update(i, 'condition_note', e.target.value)} /></label>
        </div><Button type="button" variant="ghost" onClick={() => setLeftovers(rows => rows.filter((_, index) => index !== i))}>Hapus sisa</Button></fieldset>)}
        <Button type="button" variant="outline" disabled={leftovers.length >= 20 || save.isPending} onClick={() => { setInspected(false); setLeftovers(rows => [...rows, { code: '', width_mm: 1, height_mm: 1, condition_note: '' }]); }}>Tambah sisa terukur</Button>
        <label>Catatan inspeksi<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>
        <label className="checkbox-label"><input required type="checkbox" checked={inspected} onChange={e => setInspected(e.target.checked)} />{leftovers.length ? 'Saya sudah memeriksa ukuran dan kondisi setiap sisa pada simulasi ini.' : 'Saya mengonfirmasi tidak ada sisa yang dapat digunakan kembali pada simulasi ini.'}</label>
        <Notice>Sumber akan diarsipkan. Record sisa baru tetap perlu verifikasi sebelum dipakai dalam optimizer.</Notice>
        {save.error && <ErrorState error={save.error} />}
        <Button type="submit" disabled={!inspected || save.isPending}>Simpan rekonsiliasi</Button>
    </form>;
}

export function ExecutionDetails({ id }: { id: string }) {
    const client = useQueryClient();
    const query = useQuery({ queryKey: ['execution', id], queryFn: () => roadmapApi.getExecution(id) });
    const plan = useQuery({ queryKey: ['plan', query.data?.plan_run_id], queryFn: () => api.getPlan(query.data!.plan_run_id), enabled: !!query.data });
    const [checked, setChecked] = useState(false);
    const [note, setNote] = useState('');
    const [confirmReview, setConfirmReview] = useState(false);
    const refresh = (execution: CutExecution) => {
        client.setQueryData(['execution', id], execution);
        client.invalidateQueries({ queryKey: ['remnants'] });
        client.invalidateQueries({ queryKey: ['executions'] });
        client.invalidateQueries({ queryKey: ['reports'] });
    };
    const transition = useMutation({ mutationFn: (action: 'approve' | 'start' | 'confirm' | 'cancel') => roadmapApi.transition(id, action, note), onSuccess: refresh });
    const item = useMutation({ mutationFn: (input: { piece: string; outcome: ExecutionOutcome; note: string }) => roadmapApi.patchItem(id, input.piece, input.outcome, input.note), onSuccess: refresh });
    if (query.isLoading || plan.isLoading) return <LoadingState />;
    if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;
    if (plan.error) return <ErrorState error={plan.error} retry={() => plan.refetch()} />;
    const ex = query.data!;
    const busy = transition.isPending || item.isPending;
    const reviewed = ex.items.filter(i => i.outcome !== null).length;
    const completed = ex.items.filter(i => i.outcome === 'COMPLETED').reduce((area, i) => area + i.area_mm2, 0);
    const touched = [...new Set(ex.items.filter(i => i.outcome === 'COMPLETED' || i.outcome === 'FAILED').map(i => i.remnant_id))];
    const names = new Map(plan.data?.input_snapshot.remnants.map(r => [r.id, r.code]));
    return <>
        <PageHeading eyebrow="04 / PRODUCTION TRACKING" title="Eksekusi pemotongan" description={`${ex.id} · ${ex.status}`} action={<Link className="button button-outline" href={`/plans/${ex.plan_run_id}`}>Buka selected plan</Link>} />
        <Notice tone="warning">DEMO SINTETIS · Konfirmasi ini hanya simulasi operator. Bukan bukti penggunaan bahan di lapangan atau penghematan pembelian.</Notice>
        <div className="result-metrics"><MetricCard label="Direncanakan" value={formatArea(ex.planned_reuse_area_m2)} unit="m²" definition="Luas selected placements dari snapshot." />
            <MetricCard label={ex.status === 'CONFIRMED' ? 'Dikonfirmasi' : 'Selesai, belum dikonfirmasi'} value={formatArea(ex.status === 'CONFIRMED' ? ex.confirmed_reuse_area_m2 : completed / 1e6)} unit="m²" definition="Luas item yang ditandai selesai sesuai ukuran snapshot." />
            <MetricCard label="Outcome ditinjau" value={`${reviewed}/${ex.items.length}`} unit="item" definition="Seluruh outcome harus disimpan sebelum konfirmasi." /></div>
        <section className="panel roadmap-panel"><h2>Checklist stok dan potongan</h2>
            <ul>{plan.data?.input_snapshot.remnants.filter(r => ex.items.some(i => i.remnant_id === r.id)).map(r => <li key={r.id}><Link href={`/remnants/${r.id}`}>{r.code}</Link> · {r.material_code}/{r.color_code} · {r.width_mm} × {r.height_mm} mm</li>)}</ul>
            {ex.status === 'DRAFT' && <><label className="checkbox-label"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />Saya sudah meninjau stok, kondisi, zona cacat, dan layout selected plan.</label><Button disabled={!checked || busy} onClick={() => transition.mutate('approve')}>Setujui plan</Button></>}
            {ex.status === 'APPROVED' && <Button disabled={busy} onClick={() => transition.mutate('start')}>Mulai simulasi pemotongan</Button>}
            {ex.items.map(row => <ItemForm key={`${row.piece_instance_id}/${row.outcome}/${row.note}`} item={row} disabled={ex.status !== 'IN_PROGRESS' || busy} onSave={(outcome, note) => { setConfirmReview(false); item.mutate({ piece: row.piece_instance_id, outcome, note }); }} />)}
            {ex.status === 'IN_PROGRESS' && <><label>Catatan eksekusi<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>
                <label className="checkbox-label"><input type="checkbox" checked={confirmReview} onChange={e => setConfirmReview(e.target.checked)} />Saya sudah meninjau seluruh outcome tersimpan. Source yang tersentuh akan dikarantina.</label>
                <Button disabled={busy || reviewed !== ex.items.length || !touched.length || !confirmReview} onClick={() => transition.mutate('confirm')}>Konfirmasi hasil simulasi</Button></>}
            {ex.status !== 'CONFIRMED' && ex.status !== 'CANCELLED' && !touched.length && <Button variant="outline" disabled={busy} onClick={() => transition.mutate('cancel')}>Batalkan eksekusi</Button>}
            {transition.error && <ErrorState error={transition.error} />}{item.error && <ErrorState error={item.error} />}
        </section>
        {ex.status === 'CONFIRMED' && touched.map(source => <ReconciliationForm key={source} executionId={id} sourceId={source} sourceCode={names.get(source) ?? source} />)}
    </>;
}

export function ReportCards() {
    const health = useCapabilities();
    const enabled = !!health.data?.capabilities?.executions;
    const query = useQuery({ queryKey: ['reports', 'SYNTHETIC_DEMO'], queryFn: () => roadmapApi.reports('SYNTHETIC_DEMO'), enabled });
    if (!enabled) return null;
    return <section className="panel roadmap-panel"><h2>Pelaksanaan demo</h2><p>Planned dan confirmed dihitung dari sesi yang telah dikonfirmasi.</p>
        {query.error && <ErrorState error={query.error} retry={() => query.refetch()} />}
        {query.data && <p>{formatArea(query.data.confirmed_reuse_area_m2)} m² dikonfirmasi dalam simulasi · {query.data.pending_reconciliation_count} sumber menunggu rekonsiliasi.</p>}
        <Link href="/reports" className="button button-outline">Lihat laporan eksekusi</Link>
    </section>;
}

export function Reports() {
    const [mode, setMode] = useState<ReportSummary['mode']>('SYNTHETIC_DEMO');
    const query = useQuery({ queryKey: ['reports', mode], queryFn: () => roadmapApi.reports(mode) });
    const executions = useQuery({ queryKey: ['executions'], queryFn: () => roadmapApi.listExecutions() });
    return <>
        <PageHeading eyebrow="05 / REUSE REPORTS" title="Rencana dan realisasi" description="Konfirmasi operator berbeda dari pengukuran atau audit independen." />
        <label className="roadmap-mode">Sumber laporan<select value={mode} onChange={e => setMode(e.target.value as ReportSummary['mode'])}><option value="SYNTHETIC_DEMO">Simulasi demo sintetis</option><option value="OPERATOR_REPORTED">Laporan operator lapangan</option></select></label>
        <Notice>Perbandingan luas menggunakan sesi CONFIRMED yang sama. Draft dan pembatalan tidak menambah angka realisasi. Data demo tidak masuk laporan lapangan.</Notice>
        {query.isLoading ? <LoadingState /> : query.error ? <ErrorState error={query.error} retry={() => query.refetch()} /> : query.data && <>
            <p className="badge badge-amber">{query.data.evidence_label}</p>
            <div className="result-metrics"><MetricCard label="Direncanakan" value={formatArea(query.data.planned_reuse_area_m2)} unit="m²" definition="Selected plan dari sesi terkonfirmasi." /><MetricCard label="Dikonfirmasi" value={formatArea(query.data.confirmed_reuse_area_m2)} unit="m²" definition="Item completed berdasarkan konfirmasi simulasi/operator, bukan audit independen." /><MetricCard label="Menunggu rekonsiliasi" value={String(query.data.pending_reconciliation_count)} unit="lembar" definition="Sumber terpakai yang belum dicatat hasil inspeksi sisanya." /></div>
            <section className="panel roadmap-panel"><p>{query.data.completed_piece_count} potongan selesai · {query.data.confirmed_execution_count}/{query.data.execution_count} sesi dikonfirmasi · tingkat konfirmasi {query.data.confirmation_rate_pct.toFixed(1)}%.</p><p>Selisih luas: {formatArea(query.data.difference_area_m2)} m². Durasi rata-rata mulai hingga konfirmasi: {query.data.mean_confirmation_duration_sec === null ? 'belum tersedia' : `${query.data.mean_confirmation_duration_sec.toFixed(1)} detik`}.</p></section>
        </>}
        <section className="panel roadmap-panel"><h2>Riwayat eksekusi</h2>
            {executions.error && <ErrorState error={executions.error} retry={() => executions.refetch()} />}
            {executions.data?.items.filter(ex => ex.mode === mode).map(ex => <p key={ex.id}><Link href={`/executions/${ex.id}`}>{ex.id.slice(0, 18)}</Link> · {ex.status} · {formatArea(ex.confirmed_reuse_area_m2)} m²</p>)}
            {executions.data && !executions.data.items.some(ex => ex.mode === mode) && <EmptyState description="Belum ada eksekusi untuk sumber laporan ini." />}
        </section>
    </>;
}
