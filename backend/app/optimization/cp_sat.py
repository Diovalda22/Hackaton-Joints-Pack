from dataclasses import dataclass, field
from time import perf_counter
from app.optimization.compatibility import orientations
from app.optimization.domain import Piece
from app.schemas.plan import Placement
from app.schemas.remnant import Remnant


@dataclass
class SolverOutcome:
    raw_status: str
    placements: list[Placement] = field(default_factory=list)
    wall_time_sec: float = 0
    engine_version: str = "unavailable"
    warning: str | None = None


def solve_cp_sat(pieces: list[Piece], remnants: list[Remnant], time_limit_sec: int,
                 random_seed: int, defects: dict | None = None) -> SolverOutcome:
    # A missing dependency never becomes an invented optimizer result.
    try:
        import ortools
        from ortools.sat.python import cp_model
    except ImportError:
        return SolverOutcome("ERROR", warning="OR-Tools belum tersedia; menampilkan baseline valid. Install requirements backend.")

    start = perf_counter()
    model = cp_model.CpModel()
    assignments: dict[str, list] = {p.id: [] for p in pieces}
    pairs = []
    used_vars = []
    for ri, remnant in enumerate(remnants):
        x_intervals, y_intervals, stock_assignments = [], [], []
        for di, defect in enumerate((defects or {}).get(remnant.id, [])):
            x_intervals.append(model.new_fixed_size_interval_var(defect.x_mm, defect.width_mm, f"dx{ri}_{di}"))
            y_intervals.append(model.new_fixed_size_interval_var(defect.y_mm, defect.height_mm, f"dy{ri}_{di}"))
        for pi, piece in enumerate(pieces):
            options = orientations(piece, remnant)
            if not options:
                continue
            tag = f"p{pi}_r{ri}"
            assigned = model.new_bool_var(f"a_{tag}")
            if piece.allow_rotation_90 and piece.width_mm != piece.height_mm:
                rotated = model.new_bool_var(f"rot_{tag}")
                model.add(rotated <= assigned)
                w = piece.width_mm + (piece.height_mm - piece.width_mm) * rotated
                h = piece.height_mm + (piece.width_mm - piece.height_mm) * rotated
                if len(options) == 1:
                    model.add(rotated == int(options[0][0])).only_enforce_if(assigned)
            else:
                rotated, w, h = 0, piece.width_mm, piece.height_mm
            x = model.new_int_var(0, remnant.width_mm, f"x_{tag}")
            y = model.new_int_var(0, remnant.height_mm, f"y_{tag}")
            end_x = model.new_int_var(0, remnant.width_mm, f"end_x_{tag}")
            end_y = model.new_int_var(0, remnant.height_mm, f"end_y_{tag}")
            # Same assignment controls both axes; interval equations enforce boundaries when present.
            x_intervals.append(model.new_optional_interval_var(x, w, end_x, assigned, f"ix_{tag}"))
            y_intervals.append(model.new_optional_interval_var(y, h, end_y, assigned, f"iy_{tag}"))
            assignments[piece.id].append(assigned)
            stock_assignments.append(assigned)
            pairs.append((piece, remnant, assigned, rotated, x, y))
        if stock_assignments:
            model.add_no_overlap_2d(x_intervals, y_intervals)
            used = model.new_bool_var(f"used_r{ri}")
            for assigned in stock_assignments:
                model.add(assigned <= used)
            model.add(used <= sum(stock_assignments))
            used_vars.append(used)
    for variables in assignments.values():
        if variables:
            model.add(sum(variables) <= 1)
    n, m = len(pieces), len(remnants)
    area = sum(piece.area * assigned for piece, _, assigned, _, _, _ in pairs)
    count = sum(assigned for _, _, assigned, _, _, _ in pairs)
    model.maximize(area * (n + 1) * (m + 1) + count * (m + 1) - sum(used_vars))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit_sec)
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = random_seed
    status = solver.solve(model)
    raw = solver.status_name(status)
    placements = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for piece, remnant, assigned, rotated, x, y in pairs:
            if not solver.value(assigned):
                continue
            rot = bool(solver.value(rotated)) if not isinstance(rotated, int) else False
            placements.append(Placement(piece_instance_id=piece.id, order_line_id=piece.order_line_id,
                                        remnant_id=remnant.id, x_mm=int(solver.value(x)), y_mm=int(solver.value(y)),
                                        placed_width_mm=piece.height_mm if rot else piece.width_mm,
                                        placed_height_mm=piece.width_mm if rot else piece.height_mm, rotated=rot))
    return SolverOutcome(raw, placements, perf_counter() - start, ortools.__version__)
