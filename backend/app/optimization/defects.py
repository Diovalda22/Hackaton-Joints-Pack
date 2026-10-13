from app.optimization.compatibility import orientations


def has_clear_position(piece, remnant, zones):
    """Exact feasibility for ONE rectangle among fixed obstacles, independent of other pieces."""
    for _, w, h in orientations(piece, remnant):
        xs = {0, remnant.width_mm - w, *(d.x_mm + d.width_mm for d in zones), *(d.x_mm - w for d in zones)}
        ys = {0, remnant.height_mm - h, *(d.y_mm + d.height_mm for d in zones), *(d.y_mm - h for d in zones)}
        for y in ys:
            for x in xs:
                if x < 0 or y < 0 or x + w > remnant.width_mm or y + h > remnant.height_mm:
                    continue
                if not any(x < d.x_mm + d.width_mm and d.x_mm < x + w
                           and y < d.y_mm + d.height_mm and d.y_mm < y + h for d in zones):
                    return True
    return False
