import { PlanResults } from '@/components/plan-results';
export default async function Page({ params }: {
    params: Promise<{
        id: string;
    }>;
}) { const { id } = await params; return <PlanResults id={id}/>; }
