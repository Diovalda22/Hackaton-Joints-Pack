from datetime import datetime, timezone
from uuid import uuid4
from app.core.config import Settings
from app.core.errors import ApiError
from app.db.contracts import Repository
from app.schemas.remnant import Remnant, RemnantCreate, RemnantPatch, VerificationStatus
from app.schemas.order import Order, OrderCreate, OrderLine
from app.schemas.plan import PlanRequest, PlanRun
from app.services.qualification import is_eligible
from app.services.planning import Solver, plan_order


CORE_FIELDS = ("material_code", "color_code", "width_mm", "height_mm", "condition_note")


class WorkspaceService:
    def __init__(self, repository: Repository, settings: Settings, solver: Solver | None = None):
        self.repository, self.settings, self.solver = repository, settings, solver

    def create_remnant(self, input: RemnantCreate) -> Remnant:
        now = datetime.now(timezone.utc)
        return self.repository.create_remnant(Remnant(**input.model_dump(), id=f"r_{uuid4().hex}",
                                                     created_at=now, updated_at=now))

    def update_remnant(self, identity: str, input: RemnantPatch) -> Remnant:
        before = self.repository.get_remnant(identity)
        patch = input.model_dump(exclude_unset=True)
        for key, value in list(patch.items()):
            if value is None:
                if key in ("lot_code", "condition_note", "source_note"):
                    patch[key] = ""
                else:
                    raise ApiError("VALIDATION_ERROR", "Field wajib tidak boleh null.", details={"field": key})
        changed = any(key in patch and patch[key] != getattr(before, key) for key in CORE_FIELDS)
        if changed and patch.get("verification_status") != VerificationStatus.VERIFIED:
            patch["verification_status"] = VerificationStatus.NEEDS_REVIEW
        values = before.model_dump() | patch | {"updated_at": datetime.now(timezone.utc)}
        updated = Remnant.model_validate(values)
        if hasattr(self.repository, "update_remnant_if_current"):
            return self.repository.update_remnant_if_current(updated, before.updated_at)
        return self.repository.update_remnant(updated)

    def create_order(self, input: OrderCreate) -> Order:
        if sum(line.quantity for line in input.lines) > 30:
            raise ApiError("TOO_MANY_PIECES", "Maksimum 30 komponen per perhitungan untuk versi demo.", details={"field": "lines"})
        now = datetime.now(timezone.utc)
        values = input.model_dump(exclude={"lines"})
        lines = [OrderLine(**line.model_dump(), id=f"ol_{uuid4().hex}") for line in input.lines]
        return self.repository.create_order(Order(**values, id=f"o_{uuid4().hex}", lines=lines,
                                                 created_at=now, updated_at=now))

    def run_plan(self, input: PlanRequest) -> PlanRun:
        order = self.repository.get_order(input.order_id)
        if input.remnant_ids is None:
            remnants = [r for r in self.repository.list_remnants() if is_eligible(r)]
            if len(remnants) > 15:
                raise ApiError("REMNANT_SELECTION_REQUIRED", "Pilih maksimal 15 lembar kain secara eksplisit.")
        else:
            if len(set(input.remnant_ids)) != len(input.remnant_ids):
                raise ApiError("VALIDATION_ERROR", "Pilihan kain tidak boleh memiliki ID duplikat.", details={"field": "remnant_ids"})
            remnants = [self.repository.get_remnant(key) for key in input.remnant_ids]
        defects = None
        if hasattr(self.repository, "get_planning_inputs"):
            remnants, defects = self.repository.get_planning_inputs([r.id for r in remnants])
        plan = plan_order(order, remnants, self.settings, input.solver_time_limit_sec, self.solver, defects)
        return self.repository.save_plan(plan)
