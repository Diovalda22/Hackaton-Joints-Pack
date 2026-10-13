"""Explicitly migrated tables; deliberately separate from the MVP create_all metadata."""
from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from app.models.remnant import RemnantRecord
from app.models.plan_run import PlanRunRecord


class RoadmapBase(DeclarativeBase):
    pass


class SchemaVersion(RoadmapBase):
    __tablename__ = "schema_version"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    purpose: Mapped[str] = mapped_column(String, nullable=False)


class ExecutionRecord(RoadmapBase):
    __tablename__ = "cut_executions"
    __table_args__ = (CheckConstraint("status IN ('DRAFT','APPROVED','IN_PROGRESS','CONFIRMED','CANCELLED')"),
                      CheckConstraint("mode = 'SYNTHETIC_DEMO'"))
    id: Mapped[str] = mapped_column(String, primary_key=True)
    plan_run_id: Mapped[str] = mapped_column(ForeignKey(PlanRunRecord.id), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    mode: Mapped[str] = mapped_column(String, nullable=False)
    operator_note: Mapped[str] = mapped_column(Text, default="")
    planned_reuse_area_mm2: Mapped[int] = mapped_column(Integer, nullable=False)
    confirmed_reuse_area_mm2: Mapped[int] = mapped_column(Integer, default=0)
    approved_sources_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)
    approved_at: Mapped[str | None] = mapped_column(String, nullable=True)
    started_at: Mapped[str | None] = mapped_column(String, nullable=True)
    confirmed_at: Mapped[str | None] = mapped_column(String, nullable=True)


class ExecutionItemRecord(RoadmapBase):
    __tablename__ = "cut_execution_items"
    __table_args__ = (CheckConstraint("outcome IS NULL OR outcome IN ('COMPLETED','FAILED','NOT_ATTEMPTED')"),)
    execution_id: Mapped[str] = mapped_column(ForeignKey("cut_executions.id"), primary_key=True)
    piece_instance_id: Mapped[str] = mapped_column(String, primary_key=True)
    remnant_id: Mapped[str] = mapped_column(ForeignKey(RemnantRecord.id), nullable=False)
    area_mm2: Mapped[int] = mapped_column(Integer, nullable=False)
    outcome: Mapped[str | None] = mapped_column(String, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")


class StockClaimRecord(RoadmapBase):
    __tablename__ = "execution_stock_claims"
    remnant_id: Mapped[str] = mapped_column(ForeignKey(RemnantRecord.id), primary_key=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("cut_executions.id"), nullable=False)


class ReconciliationRecord(RoadmapBase):
    __tablename__ = "remnant_reconciliations"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_remnant_id: Mapped[str] = mapped_column(ForeignKey(RemnantRecord.id), unique=True, nullable=False)
    execution_id: Mapped[str] = mapped_column(ForeignKey("cut_executions.id"), nullable=False)
    input_json: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False)


class ReconciliationChildRecord(RoadmapBase):
    __tablename__ = "reconciliation_children"
    remnant_id: Mapped[str] = mapped_column(ForeignKey(RemnantRecord.id), primary_key=True)
    reconciliation_id: Mapped[str] = mapped_column(ForeignKey("remnant_reconciliations.id"), nullable=False)


class DefectRecord(RoadmapBase):
    __tablename__ = "remnant_defects"
    __table_args__ = (CheckConstraint("x_mm >= 0 AND y_mm >= 0 AND width_mm > 0 AND height_mm > 0"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    remnant_id: Mapped[str] = mapped_column(ForeignKey(RemnantRecord.id), index=True, nullable=False)
    x_mm: Mapped[int] = mapped_column(Integer, nullable=False)
    y_mm: Mapped[int] = mapped_column(Integer, nullable=False)
    width_mm: Mapped[int] = mapped_column(Integer, nullable=False)
    height_mm: Mapped[int] = mapped_column(Integer, nullable=False)
    defect_type: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[str] = mapped_column(Text, default="")
    verified_by_operator_at: Mapped[str | None] = mapped_column(String, nullable=True)


class ImportPreviewRecord(RoadmapBase):
    __tablename__ = "inventory_import_previews"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[str] = mapped_column(String, nullable=False)
    committed_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
