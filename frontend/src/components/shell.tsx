'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, Layers3, ClipboardList, ArrowUpRight, HelpCircle, Scissors, Leaf, CircleCheck, RefreshCw } from 'lucide-react';
import { Modal } from './ui/dialog';
import { Button } from './ui/button';
import { api, ApiError, demoEnabled, isMock, resetWorkspace } from '@/lib/api';
export function Shell({ children }: {
    children: ReactNode;
}) {
    const path = usePathname();
    const [about, setAbout] = useState(false);
    const [reset, setReset] = useState(false);
    const [error, setError] = useState('');
    const client = useQueryClient();
    const stock = useQuery({ queryKey: ['remnants'], queryFn: () => api.listRemnants() });
    const health = useQuery({ queryKey: ['health'], queryFn: () => api.health() });
    const nav = [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }, { href: '/remnants', label: 'Inventaris kain', icon: Layers3 }, { href: '/orders', label: 'Pesanan', icon: ClipboardList }, ...(health.data?.capabilities?.executions ? [{ href: '/reports', label: 'Laporan eksekusi', icon: CircleCheck }] : [])];
    const corrupt = stock.error instanceof ApiError && stock.error.code === 'STORAGE_CORRUPT';
    return <div className="app-shell">
    <a href="#main" className="skip-link">Lewati ke konten</a>
    <aside className="sidebar">
    <Link href="/" className="brand">
    <span className="brand-icon">
    <Scissors size={24}/>
    </span>
    <span>LoopCut<span className="brand-ai">AI</span>
    <small>MATERIAL PLANNING STUDIO</small>
    </span>
    </Link>
    <div className="workspace-label">
    <span className="workspace-avatar">LC</span>
    <div>{isMock || health.data?.capabilities?.execution_mode === 'SYNTHETIC_DEMO' ? 'Workspace demo sintetis' : 'Workspace lokal'}<small>Single operator · LoopCut AI</small>
    </div>
    </div>
    <div className="nav-caption">WORKSPACE</div>
    <nav aria-label="Navigasi utama">{nav.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? path === '/' : path.startsWith(href);
            return <Link key={href} href={href} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
            <Icon size={19}/>{label}{active && <span className="nav-dot"/>}</Link>;
        })}</nav>
    <div className="sidebar-bottom">
    <div className="circular-note">
    <Leaf size={22}/>
    <strong>Lebih sedikit terbuang.<br />Lebih banyak digunakan.</strong>
    <p>Mulai dari kain yang sudah Anda miliki.</p>
    </div>
    <button className="nav-item" onClick={() => setAbout(true)}>
    <HelpCircle size={18}/>Metode & batasan<ArrowUpRight size={14}/>
    </button>{demoEnabled && <button className="nav-item" onClick={() => setReset(true)}>
        <RefreshCw size={16}/>Reset workspace</button>}<div className="sidebar-footer">LOOPCUT AI <span>© 2026</span>
    </div>
    </div>
    </aside>
    <div className="workspace">
    <header className="topbar">
    <span className="breadcrumb">Workspace <span>/</span> <strong>{path === '/' ? 'Dashboard' : path.startsWith('/remnants') ? 'Inventaris' : path.startsWith('/plans') ? 'Rencana pemotongan' : path.startsWith('/executions') ? 'Eksekusi' : path.startsWith('/reports') ? 'Laporan' : 'Pesanan'}</strong>
    </span>
    <div className="topbar-right">
    <span className={`badge ${isMock ? 'badge-amber' : health.isSuccess ? 'badge-green' : 'badge-red'}`}>
    <span className="status-dot"/>{isMock ? 'Mode demo · sintetis' : health.isLoading ? 'Memeriksa API…' : health.isSuccess ? 'API terhubung' : 'API tidak terhubung'}</span>
    <span className="operator-avatar" title={isMock ? "Operator demo" : "Operator workspace"}>OP</span>
    </div>
    </header>
    <main id="main">{corrupt && <div className="notice notice-error" role="alert">Data lokal tidak dapat dibaca. <Button size="sm" variant="outline" onClick={() => setReset(true)}>Reset workspace</Button>
        </div>}{children}</main>
    <footer className="global-footer">
    <CircleCheck size={14}/>
    <span>Simulasi perencanaan; belum otomatis memotong atau mengurangi stok.</span>
    <button onClick={() => setAbout(true)}>Tentang metode</button>
    </footer>
    </div>
    <Modal open={about} onOpenChange={setAbout} title="Metode & batasan" description="Perencanaan yang bisa diperiksa, dengan klaim yang terukur.">
    <div className="prose">
    <h3>Qualification → matching → layout</h3>
    <p>Hanya kain terverifikasi dan tersedia yang menjadi kandidat. Bahan dan warna harus cocok persis. Komponen berupa persegi panjang dengan rotasi 90° jika diizinkan.</p>
    <h3>Arti angka</h3>
    <p>
    <strong>Luas reuse</strong> adalah luas komponen yang dialokasikan. <strong>Cakupan luas</strong> adalah bagian luas pesanan yang terpenuhi. Angka ini belum menjamin penghematan pembelian bahan atau pengurangan emisi.</p>
    <h3>{isMock ? "Mode demo" : "Perhitungan backend"}</h3>
    <p>{isMock ? "Seluruh data, koordinat, runtime, dan status solver demo berasal dari fixture sintetis. Tidak ada solver yang dijalankan. Status optimal pada fixture hanya memperagakan tampilan respons backend." : "Inventaris dan pesanan disimpan di backend. Backend menghitung greedy baseline, menjalankan CP-SAT, memvalidasi layout, dan menyimpan snapshot. Jika optimizer tidak memberi solusi yang lebih baik atau belum tersedia, hasil memakai baseline dengan status fallback. Seed backend tetap berupa input sintetis."}</p>
    <h3>Batas geometri</h3>
    <p>Ukuran dalam mm integer. Ukuran potong sudah harus mencakup allowance. {health.data?.capabilities?.defects ? 'Zona cacat berupa rectangle dipetakan manual dan diperiksa pada layout.' : 'Pemetaan cacat manual belum aktif pada workspace ini.'} Kerf, pola bebas, dan arah serat tidak dimodelkan.</p>
    <h3>Sumber konteks produk</h3>
    <p>Angka penelitian merupakan konteks masalah, bukan performa LoopCut.</p>
    <a href="https://doi.org/10.1186/s40691-021-00262-9" target="_blank" rel="noreferrer">Aus dkk. (2021)</a>
    <br />
    <a href="https://doi.org/10.3390/recycling11030062" target="_blank" rel="noreferrer">Nurkomariyah dkk. (2026)</a>
    </div>
    </Modal>
    <Modal open={reset} onOpenChange={setReset} title="Reset workspace lokal?" description="Inventaris, pesanan, dan hasil demo pada browser ini akan dihapus.">
    <div className="dialog-body">{error && <p role="alert" className="field-error">{error}</p>}<div className="form-actions">
    <Button variant="outline" onClick={() => setReset(false)}>Batal</Button>
    <Button variant="destructive" onClick={() => { try {
        resetWorkspace();
        client.clear();
        setReset(false);
        window.location.assign('/');
    }
    catch (e) {
        setError((e as Error).message);
    } }}>Reset workspace</Button>
    </div>
    </div>
    </Modal>
    </div>;
}
