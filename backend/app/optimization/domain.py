from dataclasses import dataclass
from app.schemas.order import Order


@dataclass(frozen=True, slots=True)
class Piece:
    id: str
    order_line_id: str
    material_code: str
    color_code: str
    width_mm: int
    height_mm: int
    allow_rotation_90: bool

    @property
    def area(self) -> int:
        return self.width_mm * self.height_mm


def expand_order(order: Order) -> list[Piece]:
    return [
        Piece(f"{line.id}#{unit}", line.id, line.material_code, line.color_code,
              line.width_mm, line.height_mm, line.allow_rotation_90)
        for line in order.lines for unit in range(1, line.quantity + 1)
    ]
