from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class OrderRecord(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class OrderLineRecord(Base):
    __tablename__ = "order_lines"
    __table_args__ = (
        CheckConstraint("width_mm BETWEEN 1 AND 10000 AND height_mm BETWEEN 1 AND 10000"),
        CheckConstraint("quantity BETWEEN 1 AND 30"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    material_code: Mapped[str] = mapped_column(String(64), nullable=False)
    color_code: Mapped[str] = mapped_column(String(64), nullable=False)
    width_mm: Mapped[int] = mapped_column(Integer, nullable=False)
    height_mm: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    allow_rotation_90: Mapped[bool] = mapped_column(Boolean, nullable=False)
