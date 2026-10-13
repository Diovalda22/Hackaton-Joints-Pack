import { ApiError, isMock, makeHttpRequest } from './api';
import type { CutExecution, DefectInput, ExecutionOutcome, ImportPreview, ListResponse, MeasuredLeftover,
    Reconciliation, RemnantDefect, RemnantHistory, ReportSummary } from './types';

export function createRoadmapService(base: string) {
    const request = makeHttpRequest(base);
    const key = encodeURIComponent;
    return {
        listExecutions: (planId?: string) => request<ListResponse<CutExecution>>(`/cut-executions${planId ? `?plan_run_id=${key(planId)}` : ''}`),
        createExecution: (planId: string) => request<CutExecution>('/cut-executions', 'POST', { plan_run_id: planId, mode: 'SYNTHETIC_DEMO' }),
        getExecution: (id: string) => request<CutExecution>(`/cut-executions/${key(id)}`),
        transition: (id: string, action: 'approve' | 'start' | 'confirm' | 'cancel', note = '') => request<CutExecution>(`/cut-executions/${key(id)}/${action}`, 'POST', { operator_note: note }),
        patchItem: (id: string, pieceId: string, outcome: ExecutionOutcome, note: string) => request<CutExecution>(`/cut-executions/${key(id)}/items/${key(pieceId)}`, 'PATCH', { outcome, note }),
        reconcile: (id: string, sourceId: string, leftovers: MeasuredLeftover[], note: string) => request<Reconciliation>(`/cut-executions/${key(id)}/reconciliations`, 'POST', { source_remnant_id: sourceId, leftovers, note }),
        history: (id: string) => request<RemnantHistory>(`/remnants/${key(id)}/history`),
        getDefects: (id: string) => request<{ items: RemnantDefect[] }>(`/remnants/${key(id)}/defects`),
        replaceDefects: (id: string, timestamp: string, defects: DefectInput[]) => request<{ items: RemnantDefect[] }>(`/remnants/${key(id)}/defects`, 'PATCH', { expected_updated_at: timestamp, defects }),
        previewCsv: (csv: string) => request<ImportPreview>('/remnants/import-preview', 'POST', { csv_text: csv }),
        commitCsv: (token: string) => request<{ remnant_ids: string[]; replayed: boolean }>('/remnants/import-commit', 'POST', { preview_token: token }),
        bulkVerify: (items: { id: string; expected_updated_at: string }[]) => request<{ verified_ids: string[] }>('/remnants/bulk-verify', 'POST', { inspected: true, items }),
        reports: (mode: ReportSummary['mode']) => request<ReportSummary>(`/reports/summary?mode=${mode}`),
    };
}

const http = createRoadmapService(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8100');
// Extended workflows must use server validation, even when the MVP fixture adapter is active.
export const roadmapApi: ReturnType<typeof createRoadmapService> = new Proxy(http, {
    get(target, property: keyof typeof http) {
        if (isMock) return () => Promise.reject(new ApiError('FEATURE_DISABLED', 'Hubungkan backend demo untuk menggunakan fitur roadmap.', {}, 409));
        return target[property];
    },
});
