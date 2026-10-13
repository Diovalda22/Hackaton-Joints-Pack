'use client';
import Link from 'next/link';
import { useRef, useState, type PointerEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { roadmapApi } from '@/lib/roadmap-api';
import type { DefectInput, Remnant, RemnantDefect } from '@/lib/types';
import { Button } from './ui/button';
import { PageHeading, Notice, ErrorState, LoadingState, VerificationBadge } from './common';
import { useCapabilities } from './roadmap';
import { RemnantCanvas } from './plan-results';

const blankZone = (): DefectInput => ({ x_mm: 0, y_mm: 0, width_mm: 1, height_mm: 1, defect_type: 'STAIN', note: '' });

function DefectEditor({ remnant, initial }: { remnant: Remnant; initial: RemnantDefect[] }) {
    const client = useQueryClient();
    const [zones, setZones] = useState<DefectInput[]>(initial.map(({ x_mm, y_mm, width_mm, height_mm, defect_type, note }) => ({ x_mm, y_mm, width_mm, height_mm, defect_type, note })));
    const [timestamp] = useState(remnant.updated_at);
    const [drag, setDrag] = useState<DefectInput | null>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const save = useMutation({ mutationFn: () => roadmapApi.replaceDefects(remnant.id, timestamp, zones), onSuccess: () => {
        client.invalidateQueries({ queryKey: ['defects', remnant.id] });
        client.invalidateQueries({ queryKey: ['remnants'] });
    } });
    const point = (e: PointerEvent<SVGSVGElement>) => {
        const matrix = e.currentTarget.getScreenCTM();
        if (!matrix) return null;
        const location = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
        return { x: Math.max(0, Math.min(remnant.width_mm, Math.round(location.x))), y: Math.max(0, Math.min(remnant.height_mm, Math.round(location.y))) };
    };
    const updateDrag = (e: PointerEvent<SVGSVGElement>) => {
        const end = point(e);
        if (!start.current || !end) return null;
        return { ...blankZone(), x_mm: Math.min(start.current.x, end.x), y_mm: Math.min(start.current.y, end.y), width_mm: Math.abs(end.x - start.current.x), height_mm: Math.abs(end.y - start.current.y) };
    };
    const update = (i: number, field: keyof DefectInput, value: string | number) => setZones(rows => rows.map((row, index) => index === i ? { ...row, [field]: value } : row));
    return <form className="panel roadmap-panel" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <h2>Peta zona cacat</h2><p>Tarik pada gambar untuk menambah rectangle, atau gunakan angka mm. Maksimal 20 zona; zona tidak boleh overlap.</p>
        <svg className="defect-editor-svg" viewBox={`0 0 ${remnant.width_mm} ${remnant.height_mm}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Editor zona cacat ${remnant.code}; alternatif input numerik tersedia di bawah.`}
            onPointerDown={e => { if (zones.length >= 20 || save.isPending) return; start.current = point(e); e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={e => { if (start.current) setDrag(updateDrag(e)); }}
            onPointerUp={e => { const zone = updateDrag(e); if (zone && zone.width_mm > 0 && zone.height_mm > 0) setZones(rows => [...rows, zone]); start.current = null; setDrag(null); }}
            onPointerCancel={() => { start.current = null; setDrag(null); }}>
            <rect width={remnant.width_mm} height={remnant.height_mm} fill="#f1f3ee" stroke="#8c9f90" />
            {[...zones, ...(drag ? [drag] : [])].map((zone, i) => <g key={i}><rect x={zone.x_mm} y={zone.y_mm} width={zone.width_mm} height={zone.height_mm} fill="#d96767" fillOpacity={0.45} stroke="#8c2828" vectorEffect="non-scaling-stroke" /><title>Zona {i + 1}: {zone.defect_type}</title></g>)}
        </svg>
        {zones.map((zone, i) => <fieldset className="roadmap-fieldset" key={i}><legend>Zona {i + 1}</legend><div className="form-grid">
            {(['x_mm', 'y_mm', 'width_mm', 'height_mm'] as const).map(field => <label key={field}>{({ x_mm: 'X', y_mm: 'Y', width_mm: 'Lebar', height_mm: 'Tinggi' })[field]} (mm)<input required type="number" min={field === 'x_mm' || field === 'y_mm' ? 0 : 1} max={10000} step={1} value={zone[field]} onChange={e => update(i, field, Number(e.target.value))} /></label>)}
            <label>Jenis cacat<input required maxLength={64} value={zone.defect_type} onChange={e => update(i, 'defect_type', e.target.value)} /></label>
            <label>Catatan<input maxLength={1000} value={zone.note} onChange={e => update(i, 'note', e.target.value)} /></label>
        </div><Button type="button" variant="ghost" disabled={save.isPending} onClick={() => setZones(rows => rows.filter((_, index) => index !== i))}>Hapus zona</Button></fieldset>)}
        <div className="form-actions"><Button type="button" variant="outline" disabled={zones.length >= 20 || save.isPending} onClick={() => setZones(rows => [...rows, blankZone()])}>Tambah zona numerik</Button><Button type="submit" disabled={save.isPending}>Simpan zona cacat</Button></div>
        <Notice tone="warning">Menyimpan perubahan mengembalikan kain ke Perlu review. Periksa seluruh zona dan verifikasi ulang sebelum optimasi.</Notice>
        {save.error && <ErrorState error={save.error} />}
    </form>;
}

export function RemnantDetail({ id }: { id: string }) {
    const client = useQueryClient();
    const health = useCapabilities();
    const stock = useQuery({ queryKey: ['remnants'], queryFn: () => api.listRemnants(), refetchOnWindowFocus: false });
    const defects = useQuery({ queryKey: ['defects', id], queryFn: () => roadmapApi.getDefects(id), enabled: !!health.data?.capabilities?.defects, refetchOnWindowFocus: false });
    const history = useQuery({ queryKey: ['history', id], queryFn: () => roadmapApi.history(id), enabled: !!health.data?.capabilities?.executions });
    const [inspected, setInspected] = useState(false);
    const [reviewTimestamp, setReviewTimestamp] = useState('');
    const verify = useMutation({ mutationFn: async () => {
        if (health.data?.capabilities?.csv_import) await roadmapApi.bulkVerify([{ id, expected_updated_at: reviewTimestamp }]);
        else await api.updateRemnant(id, { verification_status: 'VERIFIED' });
    }, onSuccess: () => {
        setInspected(false); client.invalidateQueries({ queryKey: ['remnants'] }); client.invalidateQueries({ queryKey: ['defects', id] });
    } });
    if (stock.isLoading) return <LoadingState />;
    if (stock.error) return <ErrorState error={stock.error} retry={() => stock.refetch()} />;
    const remnant = stock.data?.items.find(r => r.id === id);
    if (!remnant) return <Notice tone="error">Kain tidak ditemukan.</Notice>;
    const consumed = !!history.data?.execution_id;
    const controlsReady = !health.isLoading && !health.error && (!health.data?.capabilities?.executions || history.isSuccess);
    return <>
        <PageHeading eyebrow="01 / REMNANT DETAIL" title={remnant.code} description={`${remnant.material_code}/${remnant.color_code} · ${remnant.width_mm} × ${remnant.height_mm} mm`} action={<Link href="/remnants" className="button button-outline">Kembali ke inventaris</Link>} />
        <VerificationBadge remnant={remnant} />
        <section className="panel roadmap-panel"><p>{remnant.condition_note || 'Belum ada catatan kondisi.'}</p><p>{remnant.source_note}</p>
            {history.data?.execution_id && <p>Sumber telah digunakan: <Link href={`/executions/${history.data.execution_id}`}>buka eksekusi dan rekonsiliasi</Link>.</p>}
            {history.data?.parent && <p>Sisa dari <Link href={`/remnants/${history.data.parent.source_remnant_id}`}>kain sumber</Link> · <Link href={`/executions/${history.data.parent.execution_id}`}>riwayat eksekusi</Link>.</p>}
            {history.error && <ErrorState error={history.error} retry={() => history.refetch()} />}
            {remnant.verification_status !== 'VERIFIED' && !consumed && controlsReady && <><label className="checkbox-label"><input type="checkbox" checked={inspected} onChange={e => { setInspected(e.target.checked); setReviewTimestamp(remnant.updated_at); }} />Saya sudah memeriksa bahan, warna, ukuran, kondisi, dan seluruh zona cacat.</label><Button disabled={!inspected || verify.isPending || defects.isLoading || !!defects.error} onClick={() => verify.mutate()}>Verifikasi kain</Button></>}
            {verify.error && <ErrorState error={verify.error} />}
        </section>
        {defects.isLoading && <LoadingState />}{defects.error && <ErrorState error={defects.error} retry={() => defects.refetch()} />}
        {defects.data && <RemnantCanvas remnant={remnant} placements={[]} defects={defects.data.items} />}
        {defects.data && !consumed && controlsReady && <DefectEditor key={`${id}/${remnant.updated_at}/${defects.dataUpdatedAt}`} remnant={remnant} initial={defects.data.items} />}
    </>;
}
