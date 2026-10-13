import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { Shell } from '@/components/shell';
import './globals.css';
export const metadata: Metadata = { title: { default: 'LoopCut AI — Material Planning Studio', template: '%s | LoopCut AI' }, description: 'Verifikasi kain sisa, susun pesanan, dan periksa rencana pemotongan. Demo sintetis LoopCut AI.' };
export default function RootLayout({ children }: {
    children: React.ReactNode;
}) {
    return <html lang="id">
    <body>
    <Providers>
    <Shell>{children}</Shell>
    </Providers>
    </body>
    </html>;
}
