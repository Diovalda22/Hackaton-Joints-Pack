'use client';
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
export function Modal({ open, onOpenChange, title, description, children, wide = false }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    children: ReactNode;
    wide?: boolean;
}) {
    return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
    <Dialog.Backdrop className="dialog-backdrop"/>
    <Dialog.Popup className={`dialog ${wide ? 'dialog-wide' : ''}`}>
    <div className="dialog-header">
    <div>
    <Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description>{description}</Dialog.Description>}</div>
    <Dialog.Close className="button button-ghost button-icon" aria-label="Tutup dialog">
    <X size={18}/>
    </Dialog.Close>
    </div>{children}</Dialog.Popup>
    </Dialog.Portal>
    </Dialog.Root>;
}
