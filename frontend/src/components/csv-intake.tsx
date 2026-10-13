'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { roadmapApi } from '@/lib/roadmap-api';
import type { ImportPreview } from '@/lib/types';
import { Button } from './ui/button';
import { PageHeading, Notice, ErrorState, LoadingState } from './common';

export const CSV_TEMPLATE = 'code,lot_code,material_code,color_code,width_mm,height_mm,quantity,condition_note\nKAIN,LOT-001,COTTON,BLACK,1200,800,3,Diukur operator\n';

export function CsvIntake() {
    const client = useQueryClient();
    const [text, setText] = useState('');
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [reviewed, setReviewed] = useState(false);
    const [error, setError] = useState('');
    const [importedIds, setImportedIds] = useState<string[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [reviewStamps, setReviewStamps] = useState<Record<string, string>>({});
    const [readingFile, setReadingFile] = useState(false);
    const [inspected, setInspected] = useState(false);
    const stock = useQuery({ queryKey: ['remnants'], queryFn: () => api.listRemnants() });
    const imported = (stock.data?.items ?? []).filter(r => importedIds.includes(r.id));
    const makePreview = useMutation({ mutationFn: () => roadmapApi.previewCsv(text), onSuccess: data => { setPreview(data); setReviewed(false); } });
    const commit = useMutation({ mutationFn: () => roadmapApi.commitCsv(preview!.preview_token), onSuccess: data => {
        setImportedIds(data.remnant_ids); setSelected([]); setReviewStamps({}); setPreview(null); setReviewed(false);
        client.invalidateQueries({ queryKey: ['remnants'] });
    } });
    const verify = useMutation({ mutationFn: () => roadmapApi.bulkVerify(selected.map(id => ({ id, expected_updated_at: reviewStamps[id] }))), onSuccess: () => {
        client.invalidateQueries({ queryKey: ['remnants'] }); setSelected([]); setReviewStamps({}); setInspected(false);
    } });
    const setCsv = (value: string) => { setText(value); setPreview(null); setReviewed(false); setError(''); };
    const busy = makePreview.isPending || commit.isPending || readingFile;
    return <>
        <PageHeading eyebrow="01 / SMART INVENTORY INTAKE" title="Impor inventaris CSV" description="Satu quantity menjadi satu record per lembar, semuanya perlu review." action={<a className="button button-outline" download="loopcut-inventory-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}>Unduh template CSV</a>} />
        <Notice>Maksimal 256 KB, 1.000 baris, dan 1.000 lembar hasil ekspansi. Impor dilakukan seluruhnya atau dibatalkan seluruhnya.</Notice>
        <section className="panel roadmap-panel"><label>File CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={async e => {
            const file = e.target.files?.[0]; if (!file) return;
            if (file.size > 262144) { setError('File maksimal 256 KB.'); return; }
            setReadingFile(true);
            try { setCsv(await file.text()); } catch { setError('File tidak dapat dibaca.'); } finally { setReadingFile(false); }
        }} /></label><label>Isi CSV<textarea rows={10} value={text} disabled={busy} onChange={e => setCsv(e.target.value)} placeholder="Tempel CSV dengan header sesuai template" /></label>
            <Button disabled={!text.trim() || busy} onClick={() => { setPreview(null); setReviewed(false); makePreview.mutate(); }}>Preview dan validasi</Button>
            {error && <p role="alert" className="field-error">{error}</p>}{makePreview.error && <ErrorState error={makePreview.error} />}
        </section>
        {preview && <section className="panel roadmap-panel"><h2>Preview {preview.row_count} baris → {preview.sheet_count} lembar</h2><p>Berlaku sampai {new Date(preview.expires_at).toLocaleString('id-ID')}.</p>
            {preview.errors.length > 0 && <div className="notice notice-error" role="alert"><ul>{preview.errors.map((e, i) => <li key={i}>Baris {e.row}: {e.message}</li>)}</ul></div>}
            <div className="table-scroll"><table><thead><tr><th>Baris</th><th>Kode hasil</th><th>Bahan/warna</th><th>Ukuran (mm)</th></tr></thead><tbody>{preview.items.map(r => <tr key={r.code}><td>{r.row}</td><td>{r.code}</td><td>{r.material_code}/{r.color_code}</td><td>{r.width_mm} × {r.height_mm}</td></tr>)}</tbody></table></div>
            <label className="checkbox-label"><input type="checkbox" checked={reviewed} disabled={!preview.can_commit || busy} onChange={e => setReviewed(e.target.checked)} />Saya sudah meninjau kode dan jumlah lembar pada preview.</label>
            <Button disabled={!preview.can_commit || !reviewed || busy} onClick={() => commit.mutate()}>Impor {preview.sheet_count} lembar</Button>
        </section>}
        {commit.error && <ErrorState error={commit.error} />}
        {importedIds.length > 0 && <section className="panel roadmap-panel"><h2>{importedIds.length} lembar berhasil diimpor</h2>
            <Notice>Periksa dimensi, bahan, warna, kondisi, dan defect setiap lembar. Pilih maksimal 100 lembar yang sudah diperiksa untuk satu transaksi verifikasi.</Notice>
            {stock.isFetching && <LoadingState />}{stock.error && <ErrorState error={stock.error} retry={() => stock.refetch()} />}
            <div className="table-scroll"><table><thead><tr><th>Pilih</th><th>Kode</th><th>Bahan/warna</th><th>Dimensi</th><th>Status</th></tr></thead><tbody>{imported.map(r => <tr key={r.id}><td><input type="checkbox" aria-label={`Pilih ${r.code}`} checked={selected.includes(r.id)} disabled={r.verification_status === 'VERIFIED' || verify.isPending || (!selected.includes(r.id) && selected.length >= 100)} onChange={e => { setInspected(false); setReviewStamps(stamps => ({ ...stamps, [r.id]: r.updated_at })); setSelected(ids => e.target.checked ? [...ids, r.id] : ids.filter(id => id !== r.id)); }} /></td><td><Link href={`/remnants/${r.id}`}>{r.code}</Link></td><td>{r.material_code}/{r.color_code}</td><td>{r.width_mm} × {r.height_mm}</td><td>{r.verification_status}</td></tr>)}</tbody></table></div>
            <label className="checkbox-label"><input type="checkbox" checked={inspected} onChange={e => setInspected(e.target.checked)} />Saya sudah memeriksa seluruh {selected.length} lembar terpilih.</label>
            <Button disabled={!selected.length || !inspected || verify.isPending || stock.isFetching || !!stock.error} onClick={() => verify.mutate()}>Verifikasi {selected.length} lembar</Button>
            {verify.error && <ErrorState error={verify.error} />}{verify.isSuccess && <p role="status">Verifikasi tersimpan.</p>}
        </section>}
    </>;
}
