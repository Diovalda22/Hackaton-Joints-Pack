from app.optimization.domain import Piece
from app.schemas.remnant import Remnant
from app.schemas.plan import ReasonCode
from app.services.qualification import is_eligible


def material_matches(piece: Piece, remnant: Remnant) -> bool:
    return is_eligible(remnant) and piece.material_code == remnant.material_code and piece.color_code == remnant.color_code


def orientations(piece: Piece, remnant: Remnant) -> list[tuple[bool, int, int]]:
    if not material_matches(piece, remnant):
        return []
    options = [(False, piece.width_mm, piece.height_mm)]
    if piece.allow_rotation_90 and piece.width_mm != piece.height_mm:
        options.append((True, piece.height_mm, piece.width_mm))
    return [(rot, w, h) for rot, w, h in options if w <= remnant.width_mm and h <= remnant.height_mm]


def unallocated_reason(piece: Piece, remnants: list[Remnant]) -> ReasonCode:
    if not any(material_matches(piece, r) for r in remnants):
        return ReasonCode.NO_VERIFIED_MATERIAL_MATCH
    if not any(orientations(piece, r) for r in remnants):
        return ReasonCode.DOES_NOT_FIT_ANY_COMPATIBLE_REMNANT
    return ReasonCode.UNALLOCATED_AFTER_SEARCH
