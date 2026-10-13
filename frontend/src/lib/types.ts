export type VerificationStatus = 'NEEDS_REVIEW' | 'VERIFIED';
export type StockStatus = 'AVAILABLE' | 'QUARANTINED' | 'ARCHIVED';
export type SolverStatus = 'OPTIMAL' | 'FEASIBLE_TIMEOUT' | 'BASELINE_FALLBACK' | 'NO_ASSIGNABLE_PIECES';
export type ReasonCode = 'NO_VERIFIED_MATERIAL_MATCH' | 'DOES_NOT_FIT_ANY_COMPATIBLE_REMNANT' | 'UNALLOCATED_AFTER_SEARCH' | 'BLOCKED_BY_DEFECT';
export interface RemnantInput {
    code: string;
    lot_code?: string;
    material_code: string;
    color_code: string;
    width_mm: number;
    height_mm: number;
    condition_note?: string;
    source_note?: string;
}
export interface Remnant extends RemnantInput {
    id: string;
    verification_status: VerificationStatus;
    stock_status: StockStatus;
    created_at: string;
    updated_at: string;
}
export interface OrderLineInput {
    label: string;
    material_code: string;
    color_code: string;
    width_mm: number;
    height_mm: number;
    quantity: number;
    allow_rotation_90: boolean;
}
export interface OrderLine extends OrderLineInput {
    id: string;
}
export interface OrderInput {
    name: string;
    lines: OrderLineInput[];
}
export interface Order extends OrderInput {
    id: string;
    lines: OrderLine[];
    created_at: string;
    updated_at?: string;
}
export interface Placement {
    piece_instance_id: string;
    order_line_id: string;
    remnant_id: string;
    x_mm: number;
    y_mm: number;
    placed_width_mm: number;
    placed_height_mm: number;
    rotated: boolean;
}
export interface Unallocated {
    piece_instance_id: string;
    reason_code: ReasonCode;
}
export interface Metrics {
    reuse_area_mm2: number;
    reuse_area_m2: number;
    unallocated_area_mm2: number;
    unallocated_area_m2: number;
    area_coverage_pct: number;
    count_coverage_pct: number;
    placed_count: number;
    requested_count: number;
    used_remnant_count: number;
}
export interface PlanResult {
    placements: Placement[];
    unallocated: Unallocated[];
    metrics: Metrics;
}
export interface PlanRequest {
    order_id: string;
    remnant_ids?: string[] | null;
    solver_time_limit_sec?: number;
}
export interface PlanRun {
    id: string;
    order_id: string;
    created_at: string;
    solver_status: SolverStatus;
    selected_strategy: 'OPTIMIZER' | 'GREEDY';
    solver_metadata: {
        engine: string;
        engine_version: string;
        random_seed: number;
        time_limit_sec: number;
        wall_time_sec: number;
        raw_solver_status: string;
    };
    input_snapshot: {
        order: Order;
        remnants: Remnant[];
        solver_time_limit_sec: number;
        remnant_defects?: Record<string, RemnantDefect[]>;
    };
    baseline: PlanResult;
    selected: PlanResult;
    comparison: {
        gain_vs_greedy_mm2: number;
        gain_vs_greedy_m2: number;
        gain_vs_greedy_count: number;
    };
    excluded_remnants: {
        remnant_id: string;
        reason_code: string;
    }[];
    warnings: string[];
}
export interface ListResponse<T> {
    items: T[];
    total: number;
}
export interface Workspace {
    version: 1;
    remnants: Remnant[];
    orders: Order[];
    plans: PlanRun[];
}
export interface ApiErrorBody {
    error: {
        code: string;
        message: string;
        details: Record<string, unknown>;
    };
}

export interface Capabilities {
    executions?: boolean;
    defects?: boolean;
    csv_import?: boolean;
    execution_mode?: 'SYNTHETIC_DEMO' | null;
}
export interface DefectInput {
    x_mm: number;
    y_mm: number;
    width_mm: number;
    height_mm: number;
    defect_type: string;
    note: string;
}
export interface RemnantDefect extends DefectInput {
    id: string;
    remnant_id: string;
    verified_by_operator_at?: string | null;
}
export type ExecutionOutcome = 'COMPLETED' | 'FAILED' | 'NOT_ATTEMPTED';
export interface ExecutionItem {
    piece_instance_id: string;
    remnant_id: string;
    area_mm2: number;
    outcome: ExecutionOutcome | null;
    note: string;
}
export interface CutExecution {
    id: string;
    plan_run_id: string;
    mode: 'SYNTHETIC_DEMO';
    status: 'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'CONFIRMED' | 'CANCELLED';
    operator_note: string;
    planned_reuse_area_m2: number;
    confirmed_reuse_area_m2: number;
    items: ExecutionItem[];
    created_at: string;
}
export interface MeasuredLeftover {
    code: string;
    width_mm: number;
    height_mm: number;
    condition_note: string;
}
export interface Reconciliation {
    id: string;
    execution_id: string;
    source_remnant_id: string;
    new_remnant_ids: string[];
    note: string;
}
export interface RemnantHistory {
    execution_id: string | null;
    parent: Reconciliation | null;
    reconciliation: Reconciliation | null;
}
export interface ImportPreview {
    preview_token: string;
    expires_at: string;
    row_count: number;
    sheet_count: number;
    items: (RemnantInput & { row: number })[];
    errors: { row: number; message: string }[];
    can_commit: boolean;
}
export interface ReportSummary {
    mode: 'SYNTHETIC_DEMO' | 'OPERATOR_REPORTED';
    planned_reuse_area_m2: number;
    confirmed_reuse_area_m2: number;
    difference_area_m2: number;
    completed_piece_count: number;
    confirmed_execution_count: number;
    execution_count: number;
    confirmation_rate_pct: number;
    mean_confirmation_duration_sec: number | null;
    pending_reconciliation_count: number;
    evidence_label: string;
}
