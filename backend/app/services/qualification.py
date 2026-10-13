from app.schemas.remnant import Remnant, StockStatus, VerificationStatus
from app.schemas.plan import ExcludedRemnant


def is_eligible(remnant: Remnant) -> bool:
    return (remnant.verification_status == VerificationStatus.VERIFIED
            and remnant.stock_status == StockStatus.AVAILABLE
            and 1 <= remnant.width_mm <= 10000 and 1 <= remnant.height_mm <= 10000
            and bool(remnant.material_code) and bool(remnant.color_code))


def qualify(remnants: list[Remnant]) -> tuple[list[Remnant], list[ExcludedRemnant]]:
    eligible, excluded = [], []
    for r in remnants:
        if is_eligible(r):
            eligible.append(r)
        else:
            reason = ("NEEDS_REVIEW" if r.verification_status != VerificationStatus.VERIFIED
                      else str(r.stock_status) if r.stock_status != StockStatus.AVAILABLE
                      else "INVALID_MATERIAL_DATA")
            excluded.append(ExcludedRemnant(remnant_id=r.id, reason_code=reason))
    return eligible, excluded
