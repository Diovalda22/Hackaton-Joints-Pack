'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, ShieldCheck, Archive, Ban, RotateCcw, LoaderCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { roadmapApi } from '@/lib/roadmap-api';
import { remnantSchema, formatArea } from '@/lib/validation';
import type { Remnant, RemnantInput, StockStatus } from '@/lib/types';
import { PageHeading, LoadingState, ErrorState, EmptyState, VerificationBadge, FieldError, Notice } from './common';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { DemoLoader } from './demo-loader';
import { useCapabilities } from './roadmap';
const defaults: RemnantInput = { code: '', lot_code: '', material_code: 'COTTON', color_code: 'BLACK', width_mm: 1200, height_mm: 800, condition_note: '', source_note: '' };
function RemnantForm({ initial, onDone }: {
    initial?: Remnant;
    onDone: () => void;
}) {
    const [reverify, setReverify] = useState(false);
    const client = useQueryClient();
    const { register, handleSubmit, setError, formState: { errors } } = useForm<RemnantInput>({ resolver: zodResolver(remnantSchema), defaultValues: initial ?? defaults });
    const mutation = useMutation({ mutationFn: (input: RemnantInput) => initial ? api.updateRemnant(initial.id, { ...input, ...(reverify ? { verification_status: 'VERIFIED' as const } : {}) }) : api.createRemnant(input), onSuccess: () => { client.invalidateQueries({ queryKey: ['remnants'] }); onDone(); }, onError: e => { if (e instanceof ApiError && e.details.field)
            setError(e.details.field as keyof RemnantInput, { message: e.message }); } });
    return <form noValidate onSubmit={handleSubmit(values => mutation.mutate(values))} className="dialog-body">
    <div className="form-grid">
    <label>Kode lembar<input {...register('code')} aria-invalid={!!errors.code}/>
    <FieldError message={errors.code?.message}/>
    </label>
    <label>Kode lot <span className="optional">opsional</span>
    <input {...register('lot_code')}/>
    <FieldError message={errors.lot_code?.message}/>
    </label>
    <label>Jenis material<input list="materials" {...register('material_code')} aria-invalid={!!errors.material_code}/>
    <FieldError message={errors.material_code?.message}/>
    </label>
    <label>Kode warna<input list="colors" {...register('color_code')} aria-invalid={!!errors.color_code}/>
    <FieldError message={errors.color_code?.message}/>
    </label>
    <label>Lebar (mm)<input type="number" step="1" {...register('width_mm', { valueAsNumber: true })} aria-invalid={!!errors.width_mm}/>
    <FieldError message={errors.width_mm?.message}/>
    </label>
    <label>Panjang / tinggi (mm)<input type="number" step="1" {...register('height_mm', { valueAsNumber: true })} aria-invalid={!!errors.height_mm}/>
    <FieldError message={errors.height_mm?.message}/>
    </label>
    </div>
    <label>Catatan kondisi<textarea {...register('condition_note')} placeholder="Kondisi fisik kain dan hasil pemeriksaan manual"/>
    <FieldError message={errors.condition_note?.message}/>
    </label>
    <label>Sumber informasi<textarea {...register('source_note')} placeholder="Contoh: offcut batch produksi, diukur operator"/>
    <FieldError message={errors.source_note?.message}/>
    </label>{initial?.verification_status === 'VERIFIED' && <>
        <Notice tone="warning">Perubahan bahan, warna, ukuran, atau kondisi mengembalikan status menjadi Perlu review.</Notice>
        <label className="checkbox-label">
        <input type="checkbox" checked={reverify} onChange={e => setReverify(e.target.checked)}/>Saya telah memeriksa ulang dan mengonfirmasi data kain layak.</label>
        </>}{!initial && <Notice>Kain baru disimpan dengan status Perlu review. Verifikasi setelah pemeriksaan manual.</Notice>}{mutation.error && <ErrorState error={mutation.error}/>}<div className="form-actions">
    <Button type="button" variant="outline" onClick={onDone} disabled={mutation.isPending}>Batal</Button>
    <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? <LoaderCircle className="spin" size={16}/> : null}Simpan kain</Button>
    </div>
    <datalist id="materials">{['COTTON', 'POLYESTER', 'DENIM', 'OTHER_SPECIFIED'].map(v => <option key={v} value={v}/>)}</datalist>
    <datalist id="colors">{['BLACK', 'WHITE', 'NAVY', 'BEIGE', 'GREEN'].map(v => <option key={v} value={v}/>)}</datalist>
    </form>;
}
export function Inventory() {
    const health = useCapabilities();
    const executions = useQuery({ queryKey: ['executions'], queryFn: () => roadmapApi.listExecutions(), enabled: !!health.data?.capabilities?.executions });
    const usedSources = new Set(executions.data?.items.filter(ex => ex.status === 'CONFIRMED').flatMap(ex => ex.items.filter(item => item.outcome === 'COMPLETED' || item.outcome === 'FAILED').map(item => item.remnant_id)));
    const query = useQuery({ queryKey: ['remnants'], queryFn: () => api.listRemnants() });
    const client = useQueryClient();
    const [editing, setEditing] = useState<Remnant | null | undefined>(undefined);
    const [action, setAction] = useState<{
        remnant: Remnant;
        status?: StockStatus;
        verify?: boolean;
    } | null>(null);
    const [search, setSearch] = useState('');
    const [material, setMaterial] = useState('');
    const [color, setColor] = useState('');
    const [status, setStatus] = useState('');
    const [feedback, setFeedback] = useState('');
    const mutation = useMutation({ mutationFn: async () => {
        if (action!.verify && health.data?.capabilities?.csv_import) await roadmapApi.bulkVerify([{ id: action!.remnant.id, expected_updated_at: action!.remnant.updated_at }]);
        else await api.updateRemnant(action!.remnant.id, action!.verify ? { verification_status: 'VERIFIED' } : { stock_status: action!.status });
    }, onSuccess: () => { setFeedback('Status kain berhasil diperbarui.'); setAction(null); client.invalidateQueries({ queryKey: ['remnants'] }); } });
    const all = query.data?.items ?? [];
    const items = all.filter(r => (!search || `${r.code} ${r.lot_code ?? ''}`.toLowerCase().includes(search.toLowerCase())) && (!material || r.material_code === material) && (!color || r.color_code === color) && (!status || r.verification_status === status || r.stock_status === status));
    return <>
    <PageHeading eyebrow="01 / MATERIAL QUALIFICATION" title="Inventaris kain sisa" description="Satu lembar, satu identitas. Verifikasi sebelum masuk perencanaan." action={<Button onClick={() => setEditing(null)}>
        <Plus size={17}/>Tambah kain</Button>}/>
    {health.data?.capabilities?.csv_import && <p><Link className="button button-outline" href="/remnants/import">Impor CSV dan verifikasi massal</Link></p>}
    <Notice>Jenis kain belum terverifikasi, tidak akan digunakan dalam optimasi.</Notice>{feedback && <p className="success-message" role="status">{feedback}</p>}<section className="panel">
    <div className="inventory-toolbar">
    <div className="search-field">
    <Search size={17}/>
    <input aria-label="Cari kode kain atau lot" placeholder="Cari kode lembar atau lot…" value={search} onChange={e => setSearch(e.target.value)}/>
    </div>
    <select aria-label="Filter material" value={material} onChange={e => setMaterial(e.target.value)}>
    <option value="">Semua material</option>{Array.from(new Set(all.map(r => r.material_code))).sort().map(v => <option key={v}>{v}</option>)}</select>
    <select aria-label="Filter warna" value={color} onChange={e => setColor(e.target.value)}>
    <option value="">Semua warna</option>{Array.from(new Set(all.map(r => r.color_code))).sort().map(v => <option key={v}>{v}</option>)}</select>
    <select aria-label="Filter status" value={status} onChange={e => setStatus(e.target.value)}>
    <option value="">Semua status</option>
    <option value="VERIFIED">Verified</option>
    <option value="NEEDS_REVIEW">Perlu review</option>
    <option value="AVAILABLE">Tersedia</option>
    <option value="QUARANTINED">Karantina</option>
    <option value="ARCHIVED">Diarsipkan</option>
    </select>
    </div>{query.isLoading ? <LoadingState /> : query.error ? <ErrorState error={query.error} retry={() => query.refetch()}/> : items.length ? <>
        <div className="table-scroll">
        <table className="inventory-table">
        <thead>
        <tr>
        <th>Kode / lot</th>
        <th>Material</th>
        <th>Warna</th>
        <th>Dimensi (mm)</th>
        <th>Luas (m²)</th>
        <th>Verifikasi / stok</th>
        <th>Aksi</th>
        </tr>
        </thead>
        <tbody>{items.map(r => <tr key={r.id}>
            <td>
            <strong><Link href={`/remnants/${r.id}`}>{r.code}</Link></strong>
            <small>{r.lot_code || '—'}</small>
            </td>
            <td>{r.material_code}</td>
            <td>
            <span className="color-chip" data-color={r.color_code}/>{r.color_code}</td>
            <td className="numeric">{r.width_mm} × {r.height_mm}</td>
            <td className="numeric">{formatArea(r.width_mm * r.height_mm / 1e6)}</td>
            <td>
            <VerificationBadge remnant={r}/>{r.stock_status === 'AVAILABLE' && <small>Tersedia</small>}</td>
            <td>
            <div className="row-actions">
            <Button variant="ghost" size="icon" disabled={usedSources.has(r.id)} aria-label={`Edit ${r.code}`} title={usedSources.has(r.id) ? 'Source terpakai; buka riwayat rekonsiliasi' : 'Edit kain'} onClick={() => setEditing(r)}>
            <Pencil size={15}/>
            </Button>{r.verification_status !== 'VERIFIED' && !usedSources.has(r.id) && <Button variant="ghost" size="icon" disabled={!remnantSchema.safeParse(r).success || (!!health.data?.capabilities?.csv_import && r.stock_status !== 'AVAILABLE')} aria-label={`Verifikasi ${r.code}`} title="Verifikasi manual" onClick={() => { mutation.reset(); setAction({ remnant: r, verify: true }); }}>
                <ShieldCheck size={16}/>
                </Button>}{r.stock_status === 'AVAILABLE' ? <>
                <Button variant="ghost" size="icon" aria-label={`Karantina ${r.code}`} title="Karantina" onClick={() => { mutation.reset(); setAction({ remnant: r, status: 'QUARANTINED' }); }}>
                <Ban size={15}/>
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Arsipkan ${r.code}`} title="Arsipkan" onClick={() => { mutation.reset(); setAction({ remnant: r, status: 'ARCHIVED' }); }}>
                <Archive size={15}/>
                </Button>
                </> : usedSources.has(r.id) ? <Link href={`/remnants/${r.id}`} className="button button-ghost button-sm">Riwayat</Link> : <Button variant="ghost" size="icon" aria-label={`Pulihkan ${r.code}`} title="Kembalikan ke tersedia" onClick={() => { mutation.reset(); setAction({ remnant: r, status: 'AVAILABLE' }); }}>
                <RotateCcw size={15}/>
                </Button>}</div>
            </td>
            </tr>)}</tbody>
        </table>
        </div>
        <div className="table-footer">{items.length} dari {all.length} lembar <span>Dimensi dalam mm · luas dalam m²</span>
        </div>
        </> : <EmptyState title={all.length ? 'Tidak ada kain yang cocok' : 'Belum ada kain tersedia'} description={all.length ? 'Ubah pencarian atau filter untuk melihat kain lainnya.' : 'Tambahkan lembar kain atau muat stok contoh sintetis.'} action={all.length ? <Button variant="outline" onClick={() => { setSearch(''); setMaterial(''); setColor(''); setStatus(''); }}>Hapus filter</Button> : <DemoLoader />}/>}</section>
    <Modal open={editing !== undefined} onOpenChange={open => { if (!open)
        setEditing(undefined); }} title={editing ? 'Edit lembar kain' : 'Tambah lembar kain'} description="Catat data yang dapat diperiksa oleh operator." wide>{editing !== undefined && <RemnantForm key={editing?.id ?? 'new'} initial={editing ?? undefined} onDone={() => setEditing(undefined)}/>}</Modal>
    <Modal open={!!action} onOpenChange={open => { if (!open && !mutation.isPending)
        setAction(null); }} title={action?.verify ? 'Konfirmasi verifikasi manual' : action?.status === 'ARCHIVED' ? 'Arsipkan kain?' : action?.status === 'QUARANTINED' ? 'Karantina kain?' : 'Pulihkan kain?'} description={action?.verify ? 'Pastikan jenis material, warna, dimensi, dan kondisi fisik sudah Anda periksa.' : 'Perubahan status menentukan apakah kain boleh menjadi kandidat perencanaan.'}>
    <div className="dialog-body">
    <p>
    <strong>{action?.remnant.code}</strong> · {action?.remnant.material_code} / {action?.remnant.color_code}</p>{mutation.error && <ErrorState error={mutation.error}/>}<div className="form-actions">
    <Button variant="outline" onClick={() => setAction(null)} disabled={mutation.isPending}>Batal</Button>
    <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending && <LoaderCircle className="spin" size={16}/>}Konfirmasi</Button>
    </div>
    </div>
    </Modal>
    </>;
}
