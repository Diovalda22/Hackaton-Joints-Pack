from dataclasses import dataclass, field
import random
from app.demo.data import NOW
from app.schemas.order import Order, OrderLine
from app.schemas.remnant import Remnant, VerificationStatus, StockStatus
from app.schemas.roadmap import Defect


@dataclass
class Scenario:
    id: str
    group: str
    seed: int
    order: Order
    remnants: list[Remnant]
    defects: dict[str, list[Defect]] = field(default_factory=dict)

    def as_dict(self):
        output = {"scenario_id": self.id, "group": self.group, "seed": self.seed, "synthetic": True,
                "order": self.order.model_dump(mode="json"),
                "remnants": [r.model_dump(mode="json") for r in self.remnants]}
        if self.defects:
            output["remnant_defects"] = {key: [d.model_dump(mode="json") for d in zones] for key, zones in self.defects.items()}
        return output


def scenarios(include_defects=False) -> list[Scenario]:
    results = []
    for group in ("easy", "competing", "material", "qualification", "rotation", "dense"):
        for variant in range(5):
            seed = 202600 + len(results)
            rng = random.Random(seed)
            unit = 50 + variant * 10
            def stock(index, w, h, material="COTTON", color="BLACK", review=False, status=StockStatus.AVAILABLE):
                return Remnant(id=f"r_{group}_{variant}_{index}", code=f"B-{group}-{variant}-{index}",
                               material_code=material, color_code=color, width_mm=w, height_mm=h,
                               verification_status=VerificationStatus.NEEDS_REVIEW if review else VerificationStatus.VERIFIED,
                               stock_status=status, source_note="Benchmark sintetis berseed", created_at=NOW, updated_at=NOW)
            def line(index, w, h, q=1, rot=False, material="COTTON", color="BLACK"):
                return OrderLine(id=f"ol_{group}_{variant}_{index}", label=f"Komponen {index}", material_code=material,
                                 color_code=color, width_mm=w, height_mm=h, quantity=q, allow_rotation_90=rot)
            if group == "easy":
                remnants = [stock(0, 10 * unit, 8 * unit)]
                lines = [line(0, 3 * unit, 2 * unit, 4), line(1, unit, unit, 4)]
            elif group == "competing":
                # Greedy fills the small sheet first; a valid one-sheet plan is possible on the large sheet.
                remnants = [stock(0, 8 * unit, 6 * unit), stock(1, 12 * unit, 8 * unit)]
                lines = [line(0, 7 * unit, 5 * unit), line(1, 6 * unit, 3 * unit)]
            elif group == "material":
                remnants = [stock(0, 10 * unit, 10 * unit, "DENIM", "BLACK"),
                            stock(1, 10 * unit, 10 * unit, "COTTON", "WHITE")]
                if variant % 2:
                    remnants.append(stock(2, 5 * unit, 4 * unit))
                lines = [line(0, 4 * unit, 3 * unit, 2)]
            elif group == "qualification":
                remnants = [stock(0, 10 * unit, 10 * unit, review=True),
                            stock(1, 10 * unit, 10 * unit, status=StockStatus.QUARANTINED),
                            stock(2, 10 * unit, 10 * unit, status=StockStatus.ARCHIVED)]
                if variant % 2:
                    remnants.append(stock(3, 4 * unit, 3 * unit))
                lines = [line(0, 4 * unit, 3 * unit, 2)]
            elif group == "rotation":
                remnants = [stock(0, 4 * unit, 7 * unit)]
                lines = [line(0, 7 * unit, 4 * unit, 1, variant % 2 == 0)]
            else:
                remnants = [stock(i, rng.randint(7, 14) * unit, rng.randint(7, 14) * unit) for i in range(5)]
                lines = [line(i, rng.randint(2, 7) * unit, rng.randint(2, 7) * unit, 2, i % 2 == 0) for i in range(15)]
            order = Order(id=f"o_{group}_{variant}", name=f"Sintetis {group} {variant}", lines=lines, created_at=NOW, updated_at=NOW)
            results.append(Scenario(f"{group}_{variant}", group, seed, order, remnants))
    return results + defect_scenarios() if include_defects else results


def defect_scenarios() -> list[Scenario]:
    results = []
    for case in range(10):
        w, h = (400, 1000) if case == 9 else (700 + case * 20, 600 + case * 30)
        stock = Remnant(id=f"r_defect_{case}", code=f"DEFECT-{case}", material_code="COTTON", color_code="BLACK",
                        width_mm=w, height_mm=h, verification_status="VERIFIED", stock_status="AVAILABLE",
                        source_note="Benchmark sintetis defect", created_at=NOW, updated_at=NOW)
        line = OrderLine(id=f"ol_defect_{case}", label="Panel", material_code="COTTON", color_code="BLACK",
                         width_mm=800 if case == 9 else 300 + case * 5, height_mm=300 if case == 9 else 200,
                         quantity=1 if case == 9 else 2, allow_rotation_90=bool(case % 2))
        order = Order(id=f"o_defect_{case}", name=f"Sintetis defect {case}", lines=[line], created_at=NOW, updated_at=NOW)
        if case == 8:
            specs = [(0, 0, w, h)]
        elif case == 9:
            specs = [(300, 0, 100, 1000)]
        else:
            specs = [(0, 0, 150, 300), (400, 300, 100, 200)]
        zones = [Defect(id=f"d_{case}_{i}", remnant_id=stock.id, x_mm=x, y_mm=y, width_mm=dw, height_mm=dh,
                        defect_type="HOLE", note="Pemetaan sintetis") for i, (x, y, dw, dh) in enumerate(specs)]
        results.append(Scenario(f"defect_{case}", "defect", 20261013 + case, order, [stock], {stock.id: zones}))
    return results
