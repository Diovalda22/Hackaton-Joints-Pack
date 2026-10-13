import { RemnantDetail } from '@/components/remnant-detail';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <RemnantDetail id={id} />;
}
