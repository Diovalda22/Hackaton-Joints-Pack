'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowRight, Database } from 'lucide-react';
import { Modal } from './ui/dialog';
import { Button } from './ui/button';
import { demoEnabled, seedDemo } from '@/lib/api';
import { scenarios } from '@/lib/fixtures';
export function DemoLoader({ label = 'Muat data demo', primary = false }: {
    label?: string;
    primary?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState('normal');
    const [error, setError] = useState('');
    const client = useQueryClient();
    const router = useRouter();
    if (!demoEnabled)
        return null;
    return <>
    <Button variant={primary ? 'default' : 'outline'} onClick={() => setOpen(true)}>
    <Database size={16}/>{label}{primary && <ArrowRight size={16}/>}</Button>
    <Modal open={open} onOpenChange={setOpen} title="Muat skenario demo" description="Data sintetis untuk memperagakan alur, tanpa menjalankan solver.">
    <div className="dialog-body">
    <div className="notice notice-warning">Inventaris, pesanan, dan hasil lokal yang ada akan diganti dengan data demo. Pilih skenario untuk dibuka setelah pemuatan.</div>
    <div className="scenario-options">{scenarios.map(s => <label key={s.id} className={`scenario-option ${selected === s.id ? 'chosen' : ''}`}>
        <input type="radio" name="scenario" value={s.id} checked={selected === s.id} onChange={() => setSelected(s.id)}/>
        <div>
        <strong>{s.name}</strong>
        <p>{s.description}</p>
        </div>
        </label>)}</div>{error && <p role="alert" className="field-error">{error}</p>}<div className="form-actions">
    <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
    <Button onClick={() => { try {
        seedDemo();
        client.removeQueries({ type: 'inactive' });
        void client.resetQueries();
        setOpen(false);
        router.push(`/orders/o_demo_${selected}`);
    }
    catch (e) {
        setError((e as Error).message);
    } }}>Ganti data & buka skenario<ArrowRight size={16}/>
    </Button>
    </div>
    </div>
    </Modal>
    </>;
}
