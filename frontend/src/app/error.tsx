'use client';
import { ErrorState } from '@/components/common';
export default function ErrorPage({ reset }: {
    error: Error;
    reset: () => void;
}) { return <ErrorState error={new Error('Halaman gagal dimuat. Coba muat ulang halaman.')} retry={reset}/>; }
