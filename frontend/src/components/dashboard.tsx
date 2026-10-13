'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Layers3, ShieldCheck, Clock3, ClipboardList, MoveUpRight, Scissors } from 'lucide-react';
import { api } from '@/lib/api';
import { eligible } from '@/lib/validation';
import { DemoLoader } from './demo-loader';
import { PageHeading, MetricCard, ErrorState, LoadingState, TextLink, VerificationBadge } from './common';
import { ReportCards } from './roadmap';
function LayoutIllustration() {
    return <svg viewBox="0 0 440 300" role="img" aria-label="Ilustrasi susunan komponen pada kain, bukan hasil perhitungan" className="hero-layout">
    <defs>
    <pattern id="hero-grid" width="20" height="20" patternUnits="userSpaceOnUse">
    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#b8d4ca" strokeWidth="0.6"/>
    </pattern>
    </defs>
    <text x="38" y="27" fill="#44695e" fontSize="11" letterSpacing="2">CUTTING PLAN / ILUSTRASI</text>
    <rect x="38" y="48" width="350" height="212" fill="#e7f1ec" stroke="#8bafa1"/>
    <rect x="38" y="48" width="350" height="212" fill="url(#hero-grid)"/>
    <rect x="42" y="52" width="167" height="114" fill="#719dce" stroke="#4779ad"/>
    <rect x="213" y="52" width="171" height="114" fill="#a4bedc" stroke="#4779ad"/>
    <rect x="42" y="170" width="81" height="86" fill="#b7cba0" stroke="#789061"/>
    <rect x="127" y="170" width="82" height="86" fill="#b7cba0" stroke="#789061"/>
    <text x="125" y="106" textAnchor="middle" fill="#173b61" fontSize="14" fontWeight="600">PANEL 01</text>
    <text x="125" y="125" textAnchor="middle" fill="#244f7c" fontSize="11">600 × 400</text>
    <text x="298" y="106" textAnchor="middle" fill="#173b61" fontSize="14" fontWeight="600">PANEL 02</text>
    <text x="298" y="125" textAnchor="middle" fill="#244f7c" fontSize="11">600 × 400</text>
    <text x="82" y="218" textAnchor="middle" fill="#466438" fontSize="11">SAKU 01</text>
    <text x="168" y="218" textAnchor="middle" fill="#466438" fontSize="11">SAKU 02</text>
    <text x="298" y="218" textAnchor="middle" fill="#7c968a" fontSize="11">Sisa material</text>
    <path d="M38 274H388 M38 270V278 M388 270V278" stroke="#8bafa1"/>
    <text x="213" y="291" textAnchor="middle" fill="#44695e" fontSize="11">1.200 mm</text>
    <text x="407" y="160" fill="#44695e" fontSize="11" transform="rotate(90 407 160)">800 mm</text>
    </svg>;
}
export function Dashboard() {
    const stock = useQuery({ queryKey: ['remnants'], queryFn: () => api.listRemnants() });
    const orders = useQuery({ queryKey: ['orders'], queryFn: () => api.listOrders() });
    const items = stock.data?.items ?? [];
    const available = items.filter(r => r.stock_status === 'AVAILABLE').length;
    const verified = items.filter(r => r.verification_status === 'VERIFIED').length;
    const review = items.filter(r => r.verification_status === 'NEEDS_REVIEW').length;
    return <>
    <PageHeading eyebrow="MATERIAL PLANNING STUDIO" title="Sisa kain. Kesempatan baru." description="Kelola material yang ada, lalu temukan rencana pemanfaatannya." action={<DemoLoader />}/>
    <ReportCards />
    <section className="hero">
    <div className="hero-copy">
    <span className="pill">
    <span className="status-dot"/> VERIFIED REUSE PLANNING</span>
    <h2>Gunakan kembali kain sisa<br />untuk pesanan <em>baru.</em>
    </h2>
    <p>Dari lembar yang tersimpan menjadi rencana potong yang jelas. Verifikasi material, susun kebutuhan, dan periksa setiap penempatan.</p>
    <div className="hero-actions">
    <DemoLoader label="Mulai demo" primary/>
    <Link href="/orders/new" className="hero-link">Buat pesanan<ArrowRight size={16}/>
    </Link>
    </div>
    <span className="hero-caption">
    <Scissors size={13}/> Dirancang untuk konveksi & studio produksi</span>
    </div>
    <div className="hero-visual">
    <LayoutIllustration />
    <span className="illustration-label">Ilustrasi layout · bukan hasil benchmark</span>
    </div>
    </section>{stock.isLoading ? <LoadingState /> : stock.error ? <ErrorState error={stock.error} retry={() => stock.refetch()}/> : <div className="metrics-grid">
        <MetricCard label="Lembar tersedia" value={available} unit="lembar" definition="Jumlah lembar berstatus AVAILABLE, termasuk yang perlu review." icon={<Layers3 size={18}/>} foot={`${items.length} lembar dalam inventaris`}/>
        <MetricCard label="Material terverifikasi" value={verified} unit="lembar" definition="Jumlah kain VERIFIED pada seluruh inventaris." icon={<ShieldCheck size={18}/>} foot={`${items.filter(eligible).length} layak masuk pool perencanaan`}/>
        <MetricCard label="Perlu pemeriksaan" value={review} unit="lembar" definition="Jumlah kain NEEDS_REVIEW; tidak dapat dipakai dalam plan." icon={<Clock3 size={18}/>} foot="Verifikasi sebelum digunakan"/>
        <MetricCard label="Pesanan tersimpan" value={orders.isLoading ? '…' : orders.error ? '—' : orders.data?.total ?? 0} unit="pesanan" definition="Jumlah pesanan yang sudah disimpan." icon={<ClipboardList size={18}/>} foot="Siap direncanakan dari stok sisa"/>
        </div>}{orders.error && <ErrorState error={orders.error} retry={() => orders.refetch()}/>}<section className="workflow-section">
    <div className="section-heading">
    <div>
    <h2>Dari inventaris ke rencana potong</h2>
    <p>Tiga langkah untuk keputusan material yang lebih jelas.</p>
    </div>
    <span className="quiet-label">ALUR KERJA</span>
    </div>
    <div className="workflow-grid">{[{ n: '01', icon: ShieldCheck, title: 'Verifikasi stok', text: 'Catat ukuran, bahan, dan warna. Pastikan kain layak digunakan.', href: '/remnants', link: 'Buka inventaris' }, { n: '02', icon: ClipboardList, title: 'Susun pesanan', text: 'Tentukan komponen, jumlah, dan aturan rotasi yang dibutuhkan.', href: '/orders/new', link: 'Buat pesanan' }, { n: '03', icon: Scissors, title: 'Periksa rencana', text: 'Bandingkan baseline, lihat layout, dan pahami yang belum terpenuhi.', href: '/orders', link: 'Lihat pesanan' }].map(step => <Link href={step.href} key={step.n} className="workflow-card">
        <div className="workflow-top">
        <span className="step-icon">
        <step.icon size={21}/>
        </span>
        <span>{step.n}</span>
        </div>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <span className="text-link">{step.link}<ArrowRight size={14}/>
        </span>
        </Link>)}</div>
    </section>
    <section className="inventory-preview panel">
    <div className="section-heading">
    <div>
    <h2>Material dalam workspace</h2>
    <p>Keputusan yang baik dimulai dari data yang terverifikasi.</p>
    </div>
    <TextLink href="/remnants">Semua inventaris</TextLink>
    </div>{items.length ? <div className="table-scroll">
        <table>
        <thead>
        <tr>
        <th>Kode lembar</th>
        <th>Material / warna</th>
        <th>Dimensi</th>
        <th>Status</th>
        <th>
        <span className="sr-only">Buka</span>
        </th>
        </tr>
        </thead>
        <tbody>{items.slice(0, 4).map(r => <tr key={r.id}>
            <td>
            <strong>{r.code}</strong>
            <small>{r.lot_code || 'Tanpa lot'}</small>
            </td>
            <td>{r.material_code}<small>{r.color_code}</small>
            </td>
            <td className="numeric">{r.width_mm} × {r.height_mm}<small>mm</small>
            </td>
            <td>
            <VerificationBadge remnant={r}/>
            </td>
            <td>
            <Link href="/remnants" aria-label={`Buka inventaris ${r.code}`}>
            <MoveUpRight size={17}/>
            </Link>
            </td>
            </tr>)}</tbody>
        </table>
        </div> : <div className="inline-empty">
        <Layers3 size={26}/>
        <div>
        <strong>Inventaris Anda masih kosong</strong>
        <p>Tambahkan lembar kain pertama atau muat skenario sintetis.</p>
        </div>
        <Link href="/remnants" className="button button-outline">Tambah kain<ArrowRight size={15}/>
        </Link>
        </div>}</section>
    </>;
}
