from app.optimization.domain import Piece
from app.schemas.plan import Placement, Unallocated
from app.schemas.remnant import Remnant
from app.services.qualification import is_eligible


class InvalidLayout(ValueError):
    pass


def overlaps(a: Placement, b: Placement) -> bool:
    return (a.x_mm < b.x_mm + b.placed_width_mm
            and b.x_mm < a.x_mm + a.placed_width_mm
            and a.y_mm < b.y_mm + b.placed_height_mm
            and b.y_mm < a.y_mm + a.placed_height_mm)


def validate_layout(placements: list[Placement], pieces: list[Piece], remnants: list[Remnant],
                    unallocated: list[Unallocated] | None = None, defects: dict | None = None) -> None:
    # Independent checks: do not call compatibility preprocessing or the CP model.
    piece_map = {p.id: p for p in pieces}
    stock_map = {r.id: r for r in remnants}
    defects = defects or {}
    for key, zones in defects.items():
        if key not in stock_map:
            continue
        r = stock_map[key]
        for i, d in enumerate(zones):
            if (any(type(v) is not int for v in (d.x_mm, d.y_mm, d.width_mm, d.height_mm))
                    or min(d.x_mm, d.y_mm) < 0 or min(d.width_mm, d.height_mm) <= 0
                    or d.x_mm + d.width_mm > r.width_mm or d.y_mm + d.height_mm > r.height_mm):
                raise InvalidLayout("Invalid defect geometry")
            for other in zones[:i]:
                if (d.x_mm < other.x_mm + other.width_mm and other.x_mm < d.x_mm + d.width_mm
                        and d.y_mm < other.y_mm + other.height_mm and other.y_mm < d.y_mm + d.height_mm):
                    raise InvalidLayout("Overlapping defect zones")
    if len(piece_map) != len(pieces) or len(stock_map) != len(remnants):
        raise InvalidLayout("Duplicate input identities")
    seen: set[str] = set()
    grouped: dict[str, list[Placement]] = {}
    for p in placements:
        piece, r = piece_map.get(p.piece_instance_id), stock_map.get(p.remnant_id)
        if not piece or not r or p.piece_instance_id in seen or p.order_line_id != piece.order_line_id:
            raise InvalidLayout("Unknown or duplicate assignment")
        seen.add(p.piece_instance_id)
        if not is_eligible(r) or piece.material_code != r.material_code or piece.color_code != r.color_code:
            raise InvalidLayout("Material qualification mismatch")
        if p.rotated and not piece.allow_rotation_90:
            raise InvalidLayout("Rotation forbidden")
        expected = (piece.height_mm, piece.width_mm) if p.rotated else (piece.width_mm, piece.height_mm)
        if (p.placed_width_mm, p.placed_height_mm) != expected:
            raise InvalidLayout("Inconsistent orientation")
        values = (p.x_mm, p.y_mm, p.placed_width_mm, p.placed_height_mm)
        if any(type(v) is not int for v in values) or p.x_mm < 0 or p.y_mm < 0 or min(values[2:]) <= 0:
            raise InvalidLayout("Coordinates must be integer mm")
        if p.x_mm + p.placed_width_mm > r.width_mm or p.y_mm + p.placed_height_mm > r.height_mm:
            raise InvalidLayout("Placement outside remnant")
        if any(p.x_mm < d.x_mm + d.width_mm and d.x_mm < p.x_mm + p.placed_width_mm
               and p.y_mm < d.y_mm + d.height_mm and d.y_mm < p.y_mm + p.placed_height_mm
               for d in defects.get(r.id, [])):
            raise InvalidLayout("Placement overlaps defect")
        grouped.setdefault(r.id, []).append(p)
    for group in grouped.values():
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                if overlaps(a, b):
                    raise InvalidLayout("Positive-area overlap")
    if unallocated is not None:
        ids = [p.piece_instance_id for p in unallocated]
        if len(set(ids)) != len(ids) or seen.intersection(ids) or seen.union(ids) != set(piece_map):
            raise InvalidLayout("Placed/unallocated must partition all requested units")
