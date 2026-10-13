import Link from 'next/link';
export default function NotFound() {
    return <div className="empty-state">
    <span className="eyebrow">404 / HALAMAN TIDAK DITEMUKAN</span>
    <h1>Halaman ini belum tersedia.</h1>
    <p>Kembali ke workspace untuk melanjutkan perencanaan.</p>
    <Link href="/" className="button button-primary">Buka dashboard</Link>
    </div>;
}
