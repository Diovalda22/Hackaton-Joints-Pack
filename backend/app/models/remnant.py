from sqlalchemy import CheckConstraint, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class RemnantRecord(Base):
    __tablename__ = "remnants"
    __table_args__ = (
        CheckConstraint("width_mm BETWEEN 1 AND 10000 AND height_mm BETWEEN 1 AND 10000"),
        CheckConstraint("verification_status IN ('NEEDS_REVIEW','VERIFIED')"),
        CheckConstraint("stock_status IN ('AVAILABLE','QUARANTINED','ARCHIVED')"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    lot_code: Mapped[str] = mapped_column(String(128), default="")
    material_code: Mapped[str] = mapped_column(String(64), nullable=False)
    color_code: Mapped[str] = mapped_column(String(64), nullable=False)
    width_mm: Mapped[int] = mapped_column(Integer, nullable=False)
    height_mm: Mapped[int] = mapped_column(Integer, nullable=False)
    verification_status: Mapped[str] = mapped_column(String, nullable=False)
    stock_status: Mapped[str] = mapped_column(String, nullable=False)
    condition_note: Mapped[str] = mapped_column(Text, default="")
    source_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)
