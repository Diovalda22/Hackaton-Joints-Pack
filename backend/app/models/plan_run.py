from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class PlanRunRecord(Base):
    __tablename__ = "plan_runs"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), nullable=False, index=True)
    input_snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)
    baseline_result_json: Mapped[str] = mapped_column(Text, nullable=False)
    selected_result_json: Mapped[str] = mapped_column(Text, nullable=False)
    solver_status: Mapped[str] = mapped_column(String, nullable=False)
    selected_strategy: Mapped[str] = mapped_column(String, nullable=False)
    solver_metadata_json: Mapped[str] = mapped_column(Text, nullable=False)
    comparison_json: Mapped[str] = mapped_column(Text, nullable=False)
    excluded_remnants_json: Mapped[str] = mapped_column(Text, nullable=False)
    warnings_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
