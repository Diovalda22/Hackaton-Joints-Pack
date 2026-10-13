from datetime import datetime, timezone
from app.schemas.remnant import Remnant, StockStatus, VerificationStatus
from app.schemas.order import Order, OrderLine

NOW = datetime(2026, 10, 13, 1, tzinfo=timezone.utc)


def demo_data() -> tuple[list[Remnant], list[Order]]:
    stock_specs = [
        (1200, 800, "COTTON", "BLACK", False, False),
        (800, 600, "COTTON", "BLACK", False, False),
        (500, 1400, "COTTON", "BLACK", False, False),
        (1000, 700, "DENIM", "NAVY", False, False),
        (900, 600, "COTTON", "WHITE", False, False),
        (1000, 800, "COTTON", "BLACK", True, False),
        (800, 500, "POLYESTER", "BLACK", False, True),
    ]
    remnants = [Remnant(id=f"r_demo_{i}", code=f"REM-{i:03}", lot_code="LOT-DEMO-2026",
                        material_code=material, color_code=color, width_mm=w, height_mm=h,
                        verification_status=VerificationStatus.NEEDS_REVIEW if review else VerificationStatus.VERIFIED,
                        stock_status=StockStatus.QUARANTINED if quarantine else StockStatus.AVAILABLE,
                        condition_note="Lembar contoh sintetis, bukan pengukuran lapangan.",
                        source_note="Seed demo LoopCut AI", created_at=NOW, updated_at=NOW)
                for i, (w, h, material, color, review, quarantine) in enumerate(stock_specs, 1)]

    def line(label, w, h, q=1, rot=False, material="COTTON", color="BLACK"):
        return dict(label=label, width_mm=w, height_mm=h, quantity=q, allow_rotation_90=rot,
                    material_code=material, color_code=color)

    # Names describe input, never promise a runtime or solver status.
    inputs = [
        ("normal", "Aksesori tote bag", [line("Panel depan", 600, 400, 2), line("Saku dalam", 300, 200, 3, True)]),
        ("rotation", "Panel panjang — rotasi", [line("Panel panjang", 1300, 400, 1, True)]),
        ("mismatch", "Pesanan polyester navy", [line("Panel polyester", 400, 300, 2, False, "POLYESTER", "NAVY")]),
        ("oversize", "Panel ukuran besar", [line("Panel besar", 5000, 5000)]),
        ("partial", "Tiga panel besar", [line("Panel utama", 900, 700, 3)]),
        ("competing", "Panel lebar dan tambahan", [line("Panel lebar", 700, 500), line("Panel tambahan", 600, 300)]),
        ("squares", "Empat panel persegi", [line("Panel persegi", 300, 300, 4)]),
    ]
    orders = [Order(id=f"o_demo_{identity}", name=name, created_at=NOW, updated_at=NOW,
                    lines=[OrderLine(**values, id=f"ol_{identity}_{i}") for i, values in enumerate(lines)])
              for identity, name, lines in inputs]
    return remnants, orders
