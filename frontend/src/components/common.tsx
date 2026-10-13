'use client';
import Link from 'next/link';
import { AlertCircle, ArrowUpRight, Inbox, LoaderCircle, ShieldCheck, CircleHelp } from 'lucide-react';
import { Button } from './ui/button';
import type { Remnant } from '@/lib/types';
import type { ReactNode } from 'react';
export function PageHeading({ eyebrow, title, description, action }: {
    eyebrow: string;
    title: string;
    description: string;
    action?: ReactNode;
}) {
    return <div className="page-heading">
    <div>
    <div className="eyebrow">{eyebrow}</div>
    <h1>{title}</h1>
    <p>{description}</p>
    </div>{action}</div>;
}
export function EmptyState({ title = 'Belum ada data', description, action }: {
    title?: string;
    description: string;
    action?: ReactNode;
}) {
    return <div className="empty-state">
    <span className="empty-icon">
    <Inbox />
    </span>
    <h3>{title}</h3>
    <p>{description}</p>{action}</div>;
}
export function LoadingState({ message = 'Memuat data…' }: {
    message?: string;
}) {
    return <div className="loading-state" role="status">
    <LoaderCircle className="spin"/>{message}</div>;
}
export function ErrorState({ error, retry }: {
    error: Error;
    retry?: () => void;
}) {
    return <div className="notice notice-error" role="alert">
    <AlertCircle size={19}/>
    <div>
    <strong>{error.message}</strong>{retry && <div>
        <Button variant="outline" size="sm" onClick={retry}>Coba lagi</Button>
        </div>}</div>
    </div>;
}
export function Notice({ children, tone = 'info' }: {
    children: ReactNode;
    tone?: 'info' | 'warning' | 'error' | 'success';
}) {
    return <div className={`notice notice-${tone}`}>
    <CircleHelp size={18}/>
    <div>{children}</div>
    </div>;
}
export function VerificationBadge({ remnant }: {
    remnant: Remnant;
}) {
    return <div className="badges">
    <span className={`badge ${remnant.verification_status === 'VERIFIED' ? 'badge-green' : 'badge-amber'}`}>{remnant.verification_status === 'VERIFIED' ? <ShieldCheck size={12}/> : <AlertCircle size={12}/>} {remnant.verification_status === 'VERIFIED' ? 'Verified' : 'Perlu review'}</span>{remnant.stock_status !== 'AVAILABLE' && <span className={`badge ${remnant.stock_status === 'ARCHIVED' ? 'badge-gray' : 'badge-red'}`}>{remnant.stock_status === 'ARCHIVED' ? 'Diarsipkan' : 'Karantina'}</span>}</div>;
}
export function MetricCard({ label, value, unit, definition, icon, foot }: {
    label: string;
    value: string | number;
    unit?: string;
    definition: string;
    icon?: ReactNode;
    foot?: string;
}) {
    return <div className="metric-card">
    <div className="metric-label">
    <span>{label}</span>{icon ?? <span tabIndex={0} role="img" aria-label={definition} title={definition}>
        <CircleHelp size={15}/>
        </span>}</div>
    <div className="metric-value">{value}<span>{unit}</span>
    </div>{foot && <div className="metric-foot">{foot}</div>}<span className="sr-only">{definition}</span>
    </div>;
}
export function TextLink({ href, children }: {
    href: string;
    children: ReactNode;
}) {
    return <Link className="text-link" href={href}>{children}<ArrowUpRight size={15}/>
    </Link>;
}
export function FieldError({ message }: {
    message?: string;
}) { return message ? <p className="field-error" role="alert">{message}</p> : null; }
