from app.optimization.compatibility import orientations
from app.optimization.domain import Piece
from app.schemas.plan import Placement
from app.schemas.remnant import Remnant


def greedy(pieces: list[Piece], remnants: list[Remnant], defects: dict | None = None) -> list[Placement]:
    defects = defects or {}
    grouped: dict[str, list[Placement]] = {r.id: [] for r in remnants}
    output: list[Placement] = []
    for piece in sorted(pieces, key=lambda p: (-p.area, p.id)):
        placed = False
        for remnant in sorted(remnants, key=lambda r: (r.width_mm * r.height_mm, r.id)):
            current = grouped[remnant.id]
            zones = defects.get(remnant.id, [])
            xs = sorted({0, *(p.x_mm + p.placed_width_mm for p in current), *(d.x_mm + d.width_mm for d in zones)})
            ys = sorted({0, *(p.y_mm + p.placed_height_mm for p in current), *(d.y_mm + d.height_mm for d in zones)})
            for rotated, w, h in orientations(piece, remnant):
                for y in ys:
                    for x in xs:
                        if x + w > remnant.width_mm or y + h > remnant.height_mm:
                            continue
                        if any(x < p.x_mm + p.placed_width_mm and p.x_mm < x + w
                               and y < p.y_mm + p.placed_height_mm and p.y_mm < y + h for p in current):
                            continue
                        if any(x < d.x_mm + d.width_mm and d.x_mm < x + w
                               and y < d.y_mm + d.height_mm and d.y_mm < y + h for d in zones):
                            continue
                        placement = Placement(piece_instance_id=piece.id, order_line_id=piece.order_line_id,
                                              remnant_id=remnant.id, x_mm=x, y_mm=y,
                                              placed_width_mm=w, placed_height_mm=h, rotated=rotated)
                        output.append(placement)
                        current.append(placement)
                        placed = True
                        break
                    if placed:
                        break
                if placed:
                    break
            if placed:
                break
    return output
