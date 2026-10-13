import { ExecutionDetails, RoadmapGate } from '@/components/roadmap';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <RoadmapGate feature="executions"><ExecutionDetails id={id} /></RoadmapGate>;
}
