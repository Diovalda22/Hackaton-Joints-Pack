'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ArrowRight, LoaderCircle, Scissors, Save, ShieldCheck, Copy, ArrowLeft } from 'lucide-react';
import { api, isMock, latestRun, rememberRun } from '@/lib/api';
import { matchingScenario } from '@/lib/fixtures';
import { defaultLine, eligible, formatArea, orderSchema, totalArea, totalPieces } from '@/lib/validation';
import type { Order, OrderInput, Remnant } from '@/lib/types';
import { Button } from './ui/button';
import { DemoLoader } from './demo-loader';
import { PageHeading, ErrorState, EmptyState, LoadingState, FieldError, Notice, TextLink } from './common';
export function OrderList() {
    const query = useQuery({ queryKey: ['orders'], queryFn: () => api.listOrders() });
    return <>
    <PageHeading eyebrow="02 / PRODUCTION ORDERS" title="Pesanan produksi" description="Tentukan kebutuhan nyata sebelum mencari pemanfaatan material." action={<Link href="/orders/new" className="button button-primary">
        <Plus size={17}/>Buat pesanan</Link>}/>
    <div className="panel">
    <div className="section-heading">
    <h2>Pesanan tersimpan</h2>
    <DemoLoader />
    </div>{query.isLoading ? <LoadingState /> : query.error ? <ErrorState error={query.error} retry={() => query.refetch()}/> : query.data?.items.length ? <div className="table-scroll">
        <table>
        <thead>
        <tr>
        <th>Nama pesanan</th>
        <th>Komponen</th>
        <th>Luas kebutuhan</th>
        <th>Dibuat</th>
        <th>Aksi</th>
        </tr>
        </thead>
        <tbody>{[...query.data.items].reverse().map(o => <tr key={o.id}>
            <td>
            <strong>{o.name}</strong>
            <small>{o.id.startsWith('o_demo_') ? 'Skenario sintetis' : 'Pesanan pengguna'}</small>
            </td>
            <td>{o.lines ? `${totalPieces(o)} unit / ${o.lines.length} baris` : 'Lihat detail'}</td>
            <td>{o.lines ? `${formatArea(totalArea(o) / 1e6)} m²` : '—'}</td>
            <td>{new Date(o.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
            <td>
            <TextLink href={`/orders/${o.id}`}>Buka pesanan</TextLink>
            </td>
            </tr>)}</tbody>
        </table>
        </div> : <EmptyState title="Belum ada pesanan" description="Buat komponen potong pertama atau jelajahi skenario sintetis." action={<Link className="button button-primary" href="/orders/new">Buat pesanan<ArrowRight size={16}/>
            </Link>}/>}</div>
    </>;
}
function PoolPicker({ remnants, selection, onChange }: {
    remnants: Remnant[];
    selection: string[] | null;
    onChange: (ids: string[] | null) => void;
}) {
    const candidates = remnants.filter(eligible);
    const selected = selection ?? (candidates.length <= 15 ? candidates.map(r => r.id) : []);
    const toggle = (key: string) => { const next = selected.includes(key) ? selected.filter(id => id !== key) : [...selected, key]; onChange(next); };
    return <section className="panel pool-panel">
    <div className="section-heading">
    <div>
    <h2>
    <ShieldCheck size={18}/>Pool kain terverifikasi</h2>
    <p>{selected.length} dipilih · maksimal 15 lembar</p>
    </div>
    <span className="badge badge-green">VERIFIED + AVAILABLE</span>
    </div>{candidates.length > 15 && <Notice tone="warning">Stok eligible melebihi 15 lembar. Pilih maksimal 15 kain secara eksplisit; daftar tidak dipotong otomatis.</Notice>}{!candidates.length ? <Notice tone="warning">Belum ada kain tersedia yang terverifikasi. <Link href="/remnants">Tambahkan atau verifikasi stok.</Link>
        </Notice> : <div className="pool-list">{candidates.map(r => <label key={r.id} className={`pool-item ${selected.includes(r.id) ? 'selected' : ''}`}>
            <input type="checkbox" checked={selected.includes(r.id)} disabled={!selected.includes(r.id) && selected.length >= 15} onChange={() => toggle(r.id)}/>
            <div>
            <strong>{r.code}</strong>
            <span>{r.material_code} / {r.color_code}</span>
            </div>
            <span>{r.width_mm} × {r.height_mm}<small>mm</small>
            </span>
            </label>)}</div>}<p className="helper">{remnants.length - candidates.length} lembar dikecualikan karena perlu review, karantina, atau arsip.</p>
    </section>;
}
function poolOf(remnants: Remnant[], selection: string[] | null) { const candidates = remnants.filter(eligible); return selection === null ? candidates : candidates.filter(r => selection.includes(r.id)); }
export function OrderBuilder() {
    const router = useRouter();
    const client = useQueryClient();
    const query = useQuery({ queryKey: ['remnants'], queryFn: () => api.listRemnants() });
    const [selection, setSelection] = useState<string[] | null>(null);
    const [saved, setSaved] = useState<{
        signature: string;
        order: Order;
    } | null>(null);
    const { register, control, handleSubmit, formState: { errors } } = useForm<OrderInput>({ resolver: zodResolver(orderSchema), defaultValues: { name: '', lines: [defaultLine()] } });
    const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
    const values = useWatch({ control }) as OrderInput;
    const pool = poolOf(query.data?.items ?? [], selection);
    const tooMany = selection === null && pool.length > 15;
    const fixture = matchingScenario(values, pool);
    const submit = useMutation({ mutationFn: async ({ input, run }: {
            input: OrderInput;
            run: boolean;
        }) => { const signature = JSON.stringify(input); let order = saved?.signature === signature ? saved.order : undefined; if (!order) {
            order = await api.createOrder(input);
            setSaved({ signature, order });
            client.invalidateQueries({ queryKey: ['orders'] });
        } if (run) {
            const plan = await api.runPlan({ order_id: order.id, remnant_ids: selection, solver_time_limit_sec: 8 });
            rememberRun(order.id, plan.id);
            return `/plans/${plan.id}`;
        } return `/orders/${order.id}`; }, onSuccess: path => router.push(path) });
    return <>
    <PageHeading eyebrow="02 / NEW PRODUCTION ORDER" title="Susun pesanan baru" description="Masukkan komponen potong, bukan pola jahit atau bentuk bebas." action={<Link className="button button-outline" href="/orders">
        <ArrowLeft size={16}/>Daftar pesanan</Link>}/>
    <form noValidate onSubmit={handleSubmit(input => submit.mutate({ input, run: false }))}>
    <section className="panel order-name-panel">
    <label>Nama pesanan<input placeholder="Contoh: aksesori tote bag — batch Oktober" {...register('name')} aria-invalid={!!errors.name}/>
    <FieldError message={errors.name?.message}/>
    </label>
    </section>
    <div className="builder-columns">
    <div>
    <section className="panel">
    <div className="section-heading">
    <div>
    <h2>Komponen potong</h2>
    <p>Masukkan dimensi potong (sudah mencakup allowance jahitan bila diperlukan).</p>
    </div>
    <span className="badge badge-gray">MM INTEGER</span>
    </div>
    <div className="order-lines">{fields.map((field, index) => <div className="order-line" key={field.id}>
        <div className="line-header">
        <span className="line-index">{String(index + 1).padStart(2, '0')}</span>
        <strong>Komponen {index + 1}</strong>
        <Button variant="ghost" size="icon" type="button" disabled={fields.length === 1 || submit.isPending} aria-label={`Hapus komponen ${index + 1}`} onClick={() => remove(index)}>
        <Trash2 size={16}/>
        </Button>
        </div>
        <div className="form-grid line-grid">
        <label className="line-name">Nama komponen<input placeholder="Contoh: panel depan" {...register(`lines.${index}.label`)} aria-invalid={!!errors.lines?.[index]?.label}/>
        <FieldError message={errors.lines?.[index]?.label?.message}/>
        </label>
        <label>Material<input list="order-materials" {...register(`lines.${index}.material_code`)} aria-invalid={!!errors.lines?.[index]?.material_code}/>
        <FieldError message={errors.lines?.[index]?.material_code?.message}/>
        </label>
        <label>Warna<input list="order-colors" {...register(`lines.${index}.color_code`)} aria-invalid={!!errors.lines?.[index]?.color_code}/>
        <FieldError message={errors.lines?.[index]?.color_code?.message}/>
        </label>
        <label>Lebar (mm)<input type="number" step="1" {...register(`lines.${index}.width_mm`, { valueAsNumber: true })} aria-invalid={!!errors.lines?.[index]?.width_mm}/>
        <FieldError message={errors.lines?.[index]?.width_mm?.message}/>
        </label>
        <label>Tinggi (mm)<input type="number" step="1" {...register(`lines.${index}.height_mm`, { valueAsNumber: true })} aria-invalid={!!errors.lines?.[index]?.height_mm}/>
        <FieldError message={errors.lines?.[index]?.height_mm?.message}/>
        </label>
        <label>Jumlah unit<input type="number" step="1" {...register(`lines.${index}.quantity`, { valueAsNumber: true })} aria-invalid={!!errors.lines?.[index]?.quantity}/>
        <FieldError message={errors.lines?.[index]?.quantity?.message}/>
        </label>
        </div>
        <label className="checkbox-label">
        <input type="checkbox" {...register(`lines.${index}.allow_rotation_90`)}/>Izinkan rotasi 90°<span className="helper">Perhatikan arah serat & motif</span>
        </label>
        </div>)}</div>
    <div className="line-add">
    <Button type="button" variant="outline" disabled={fields.length >= 30 || submit.isPending} onClick={() => append(defaultLine())}>
    <Plus size={16}/>Tambah komponen</Button>
    <FieldError message={errors.lines?.root?.message ?? errors.lines?.message}/>
    </div>
    </section>{query.isLoading ? <LoadingState /> : query.error ? <ErrorState error={query.error} retry={() => query.refetch()}/> : <PoolPicker remnants={query.data?.items ?? []} selection={selection} onChange={setSelection}/>}</div>
    <aside className="order-summary panel">
    <span className="eyebrow">RINGKASAN KEBUTUHAN</span>
    <h2>Siap direncanakan?</h2>
    <div className="summary-stat">
    <span>Total komponen</span>
    <strong className={totalPieces(values) > 30 ? 'invalid' : ''}>{totalPieces(values)} <small>/ 30 unit</small>
    </strong>
    </div>
    <div className="summary-stat">
    <span>Luas komponen</span>
    <strong>{formatArea(totalArea(values) / 1e6)} <small>m²</small>
    </strong>
    </div>
    <div className="summary-stat">
    <span>Kain kandidat</span>
    <strong>{tooMany ? 'Pilih pool' : pool.length} <small>lembar</small>
    </strong>
    </div>{isMock && !fixture && <Notice tone="warning">Pesanan dapat disimpan. Perhitungan input bebas membutuhkan backend; muat skenario demo untuk melihat hasil.</Notice>}{submit.error && <ErrorState error={submit.error}/>}<Button type="submit" variant="outline" disabled={submit.isPending}>
    <Save size={16}/>Simpan pesanan</Button>
    <Button type="button" disabled={submit.isPending || query.isLoading || !!query.error || tooMany || (isMock && !fixture)} onClick={handleSubmit(input => submit.mutate({ input, run: true }))}>{submit.isPending ? <LoaderCircle className="spin" size={16}/> : <Scissors size={16}/>}Jalankan rencana</Button>{submit.isPending && <p role="status" className="helper">Menyimpan / memproses rencana…</p>}{saved && submit.error && <TextLink href={`/orders/${saved.order.id}`}>Buka pesanan yang sudah tersimpan</TextLink>}<DemoLoader />
    <p className="helper">Simulasi ini belum mengurangi stok. Luas kebutuhan bukan estimasi pembelian kain baru.</p>
    </aside>
    </div>
    <datalist id="order-materials">{['COTTON', 'POLYESTER', 'DENIM', 'OTHER_SPECIFIED'].map(v => <option key={v}>{v}</option>)}</datalist>
    <datalist id="order-colors">{['BLACK', 'WHITE', 'NAVY', 'BEIGE', 'GREEN'].map(v => <option key={v}>{v}</option>)}</datalist>
    </form>
    </>;
}
export function OrderDetail({ id }: {
    id: string;
}) {
    const router = useRouter();
    const query = useQuery({ queryKey: ['order', id], queryFn: () => api.getOrder(id) });
    const stock = useQuery({ queryKey: ['remnants'], queryFn: () => api.listRemnants() });
    const last = useQuery({ queryKey: ['lastRun', id], queryFn: async () => latestRun(id) ?? null });
    const [selection, setSelection] = useState<string[] | null>(null);
    const client = useQueryClient();
    const run = useMutation({ mutationFn: () => api.runPlan({ order_id: id, remnant_ids: selection, solver_time_limit_sec: 8 }), onSuccess: plan => { rememberRun(id, plan.id); client.invalidateQueries({ queryKey: ['lastRun', id] }); router.push(`/plans/${plan.id}`); } });
    if (query.isLoading)
        return <LoadingState />;
    if (query.error)
        return <ErrorState error={query.error} retry={() => query.refetch()}/>;
    const order = query.data!;
    const pool = poolOf(stock.data?.items ?? [], selection);
    const tooMany = selection === null && pool.length > 15;
    const fixture = matchingScenario(order, pool);
    return <>
    <PageHeading eyebrow="02 / ORDER OVERVIEW" title={order.name} description={`${totalPieces(order)} unit komponen · ${formatArea(totalArea(order) / 1e6)} m² kebutuhan potong`} action={<Link href="/orders/new" className="button button-outline">
        <Copy size={16}/>Buat revisi baru</Link>}/>
    <div className="builder-columns">
    <div>
    <section className="panel">
    <div className="section-heading">
    <h2>Spesifikasi komponen</h2>
    <span className="badge badge-gray">{order.lines.length} BARIS</span>
    </div>
    <div className="table-scroll">
    <table>
    <thead>
    <tr>
    <th>Komponen</th>
    <th>Material / warna</th>
    <th>Dimensi (mm)</th>
    <th>Jumlah</th>
    <th>Rotasi 90°</th>
    </tr>
    </thead>
    <tbody>{order.lines.map(l => <tr key={l.id}>
        <td>
        <strong>{l.label}</strong>
        </td>
        <td>{l.material_code}<small>{l.color_code}</small>
        </td>
        <td>{l.width_mm} × {l.height_mm}</td>
        <td>{l.quantity}</td>
        <td>{l.allow_rotation_90 ? 'Diizinkan' : 'Tidak'}</td>
        </tr>)}</tbody>
    </table>
    </div>
    </section>{stock.isLoading ? <LoadingState /> : stock.error ? <ErrorState error={stock.error} retry={() => stock.refetch()}/> : <PoolPicker remnants={stock.data?.items ?? []} selection={selection} onChange={setSelection}/>}</div>
    <aside className="panel order-summary">
    <Scissors className="summary-icon" size={28}/>
    <h2>Cari rencana pemotongan</h2>
    <p>Bandingkan greedy baseline dengan hasil terpilih pada input yang sama.</p>{isMock && <Notice tone={fixture ? 'info' : 'warning'}>{fixture ? `Skenario sintetis: ${fixture.name}. Hasil diambil dari fixture, tanpa menjalankan solver.` : 'Perhitungan input bebas membutuhkan backend. Pilih skenario demo atau pulihkan pool contoh.'}</Notice>}{run.error && <ErrorState error={run.error}/>}<Button disabled={run.isPending || stock.isLoading || !!stock.error || tooMany || (isMock && !fixture)} onClick={() => run.mutate()}>{run.isPending ? <LoaderCircle className="spin" size={16}/> : <Scissors size={16}/>}Jalankan rencana</Button>{run.isPending && <p role="status" className="helper">Memproses rencana… Tunggu respons.</p>}{last.data && <Link className="button button-outline" href={`/plans/${last.data}`}>Lihat hasil terakhir<ArrowRight size={16}/>
        </Link>}<DemoLoader />
    <p className="helper">Ukuran potong sudah mencakup allowance. Run tidak memesan atau mengurangi stok.</p>
    </aside>
    </div>
    <Link href="/orders" className="text-link">
    <ArrowLeft size={15}/>Kembali ke pesanan</Link>
    </>;
}
