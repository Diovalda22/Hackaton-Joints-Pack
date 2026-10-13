import csv
import io
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from sqlalchemy import delete, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pydantic import ValidationError
from app.core.errors import ApiError
from app.db.repository import record_dict
from app.db.transactions import write_session
from app.models.remnant import RemnantRecord
from app.models.roadmap import (SchemaVersion, ExecutionRecord, ExecutionItemRecord, StockClaimRecord,
                               ReconciliationRecord, ReconciliationChildRecord, DefectRecord, ImportPreviewRecord)
from app.optimization.domain import expand_order
from app.optimization.validator import validate_layout, InvalidLayout
from app.schemas.remnant import Remnant, RemnantCreate
from app.schemas.roadmap import Defect


def now():
    return datetime.now(timezone.utc).isoformat()


def identity(prefix):
    return f"{prefix}_{uuid4().hex}"


def conflict(message):
    raise ApiError("CONFLICT", message, 409)


def roadmap_available(repository):
    engine = getattr(repository, "engine", None)
    if engine is None or not inspect(engine).has_table("schema_version"):
        return False
    with Session(engine) as session:
        version = session.get(SchemaVersion, 1)
        return bool(version and version.version == 1 and version.purpose == "SYNTHETIC_DEMO")


def capabilities(repository, settings):
    enabled = roadmap_available(repository)
    return {"executions": enabled and settings.enable_executions,
            "defects": enabled and settings.enable_defects,
            "csv_import": enabled and settings.enable_csv_import,
            "execution_mode": "SYNTHETIC_DEMO" if enabled else None}


def load_defects(engine, remnant_id=None, session=None):
    if not inspect(session.connection() if session is not None else engine).has_table("remnant_defects"):
        return {}
    def read(s):
        query = select(DefectRecord).order_by(DefectRecord.remnant_id, DefectRecord.id)
        if remnant_id:
            query = query.where(DefectRecord.remnant_id == remnant_id)
        output = {}
        for record in s.scalars(query):
            output.setdefault(record.remnant_id, []).append(Defect.model_validate(record_dict(record)))
        return output
    if session is not None:
        return read(session)
    with Session(engine) as s:
        return read(s)


class RoadmapService:
    def __init__(self, repository, settings):
        self.repository, self.settings = repository, settings
        self.engine = getattr(repository, "engine", None)

    def require(self, feature):
        if not capabilities(self.repository, self.settings).get(feature):
            raise ApiError("FEATURE_DISABLED", "Fitur membutuhkan database demo yang sudah dimigrasikan dan flag aktif.", 409)

    @staticmethod
    def _record(session, model, key):
        record = session.get(model, key)
        if record is None:
            raise ApiError("NOT_FOUND", "Data tidak ditemukan.", 404)
        return record

    @staticmethod
    def _execution(session, record):
        values = record_dict(record)
        values.pop("approved_sources_json")
        values["items"] = [record_dict(item) for item in session.scalars(select(ExecutionItemRecord)
                          .where(ExecutionItemRecord.execution_id == record.id).order_by(ExecutionItemRecord.piece_instance_id))]
        values["confirmed_reuse_area_m2"] = record.confirmed_reuse_area_mm2 / 1_000_000
        values["planned_reuse_area_m2"] = record.planned_reuse_area_mm2 / 1_000_000
        return values

    def list_executions(self, plan_run_id=None):
        self.require("executions")
        with Session(self.engine) as session:
            query = select(ExecutionRecord).order_by(ExecutionRecord.created_at.desc())
            if plan_run_id:
                query = query.where(ExecutionRecord.plan_run_id == plan_run_id)
            items = [self._execution(session, r) for r in session.scalars(query)]
            return {"items": items, "total": len(items)}

    def get_execution(self, key):
        self.require("executions")
        with Session(self.engine) as session:
            return self._execution(session, self._record(session, ExecutionRecord, key))

    def create_execution(self, input):
        self.require("executions")
        plan = self.repository.get_plan(input.plan_run_id)
        if not plan.selected.placements:
            raise ApiError("VALIDATION_ERROR", "Rencana tidak memiliki potongan untuk dieksekusi.")
        pieces = expand_order(plan.input_snapshot.order)
        try:
            validate_layout(plan.selected.placements, pieces, plan.input_snapshot.remnants,
                            plan.selected.unallocated, plan.input_snapshot.remnant_defects or {})
        except InvalidLayout as exc:
            conflict(f"Snapshot tidak valid untuk eksekusi: {exc}")
        piece_map = {p.id: p for p in pieces}
        with write_session(self.engine) as session:
            record = ExecutionRecord(id=identity("ex"), plan_run_id=plan.id, status="DRAFT", mode=input.mode,
                                     planned_reuse_area_mm2=sum(piece_map[p.piece_instance_id].area for p in plan.selected.placements),
                                     created_at=now(), updated_at=now(), approved_sources_json="{}")
            session.add(record)
            session.flush()
            session.add_all([ExecutionItemRecord(execution_id=record.id, piece_instance_id=p.piece_instance_id,
                             remnant_id=p.remnant_id, area_mm2=piece_map[p.piece_instance_id].area) for p in plan.selected.placements])
            session.flush()
            return self._execution(session, record)

    def _check_sources(self, session, record, plan):
        ids = {p.remnant_id for p in plan.selected.placements}
        snapshot = {r.id: r for r in plan.input_snapshot.remnants}
        approved = json.loads(record.approved_sources_json)
        defects = load_defects(self.engine, session=session)
        current = []
        captured = {}
        for key in ids:
            source = self._record(session, RemnantRecord, key)
            if session.get(StockClaimRecord, key):
                conflict("Kain sudah digunakan oleh eksekusi lain.")
            if source.verification_status != "VERIFIED" or source.stock_status != "AVAILABLE":
                conflict("Kain tidak lagi terverifikasi dan tersedia.")
            for field in ("material_code", "color_code", "width_mm", "height_mm", "condition_note"):
                if getattr(source, field) != getattr(snapshot[key], field):
                    conflict("Kondisi kain berbeda dari snapshot. Buat rencana baru.")
            def geometry(items):
                return sorted((d.x_mm, d.y_mm, d.width_mm, d.height_mm, d.defect_type, d.note) for d in items)
            if geometry(defects.get(key, [])) != geometry((plan.input_snapshot.remnant_defects or {}).get(key, [])):
                conflict("Zona cacat berbeda dari snapshot. Buat rencana baru.")
            if approved and approved.get(key) != source.updated_at:
                conflict("Stok berubah setelah persetujuan. Ajukan eksekusi dari rencana yang ditinjau ulang.")
            captured[key] = source.updated_at
            current.append(Remnant.model_validate(record_dict(source)))
        try:
            validate_layout(plan.selected.placements, expand_order(plan.input_snapshot.order), current,
                            plan.selected.unallocated, defects)
        except InvalidLayout as exc:
            conflict(f"Snapshot tidak layak dieksekusi: {exc}")
        return captured

    def transition(self, key, action, input=None):
        self.require("executions")
        # Plans are immutable. Reading outside the write lock does not permit stock races.
        execution = self.get_execution(key)
        plan = self.repository.get_plan(execution["plan_run_id"])
        with write_session(self.engine) as session:
            record = self._record(session, ExecutionRecord, key)
            if action == "confirm" and record.status == "CONFIRMED":
                return self._execution(session, record)
            expected = {"approve": "DRAFT", "start": "APPROVED", "confirm": "IN_PROGRESS"}
            items = list(session.scalars(select(ExecutionItemRecord).where(ExecutionItemRecord.execution_id == key)))
            if action == "cancel":
                if record.status == "CANCELLED":
                    return self._execution(session, record)
                if record.status == "CONFIRMED" or any(i.outcome in ("COMPLETED", "FAILED") for i in items):
                    conflict("Eksekusi dengan pemotongan tercatat harus dikonfirmasi dan direkonsiliasi.")
                record.status = "CANCELLED"
            else:
                if record.status != expected[action]:
                    conflict("Transisi status eksekusi tidak diizinkan.")
                captured = self._check_sources(session, record, plan)
                if action == "approve":
                    record.approved_sources_json = json.dumps(captured)
                    record.status, record.approved_at = "APPROVED", now()
                elif action == "start":
                    record.status, record.started_at = "IN_PROGRESS", now()
                else:
                    if any(i.outcome is None for i in items):
                        conflict("Tentukan outcome seluruh potongan sebelum konfirmasi.")
                    touched = {i.remnant_id for i in items if i.outcome in ("COMPLETED", "FAILED")}
                    if not touched:
                        conflict("Tidak ada pemotongan tercatat. Batalkan eksekusi ini.")
                    record.confirmed_reuse_area_mm2 = sum(i.area_mm2 for i in items if i.outcome == "COMPLETED")
                    if record.confirmed_reuse_area_mm2 > record.planned_reuse_area_mm2:
                        conflict("Luas realisasi melebihi rencana.")
                    for source_id in touched:
                        session.add(StockClaimRecord(remnant_id=source_id, execution_id=key))
                        source = self._record(session, RemnantRecord, source_id)
                        source.stock_status, source.updated_at = "QUARANTINED", now()
                    record.status, record.confirmed_at = "CONFIRMED", now()
            if input:
                record.operator_note = input.operator_note
            record.updated_at = now()
            session.flush()
            return self._execution(session, record)

    def patch_item(self, key, piece_id, input):
        self.require("executions")
        with write_session(self.engine) as session:
            execution = self._record(session, ExecutionRecord, key)
            if execution.status != "IN_PROGRESS":
                conflict("Outcome hanya dapat diedit saat eksekusi berlangsung.")
            item = self._record(session, ExecutionItemRecord, (key, piece_id))
            item.outcome, item.note = input.outcome, input.note
            execution.updated_at = now()
            session.flush()
            return self._execution(session, execution)

    def reconcile(self, key, input):
        self.require("executions")
        payload = input.model_dump_json()
        try:
            with write_session(self.engine) as session:
                execution = self._record(session, ExecutionRecord, key)
                if execution.status != "CONFIRMED":
                    conflict("Rekonsiliasi membutuhkan eksekusi terkonfirmasi.")
                claim = self._record(session, StockClaimRecord, input.source_remnant_id)
                if claim.execution_id != key:
                    conflict("Kain bukan sumber yang terpakai dalam eksekusi ini.")
                existing = session.scalar(select(ReconciliationRecord).where(
                    ReconciliationRecord.source_remnant_id == input.source_remnant_id))
                if existing:
                    if existing.input_json != payload:
                        conflict("Sumber sudah direkonsiliasi dengan hasil berbeda.")
                    return self._reconciliation(session, existing)
                source = self._record(session, RemnantRecord, input.source_remnant_id)
                completed_area = sum(i.area_mm2 for i in session.scalars(select(ExecutionItemRecord).where(
                    ExecutionItemRecord.execution_id == key, ExecutionItemRecord.remnant_id == source.id,
                    ExecutionItemRecord.outcome == "COMPLETED")))
                if sum(r.width_mm * r.height_mm for r in input.leftovers) > source.width_mm * source.height_mm - completed_area:
                    raise ApiError("VALIDATION_ERROR", "Total luas sisa terukur melebihi batas luas sumber setelah potongan selesai.")
                if any(r.width_mm > source.width_mm or r.height_mm > source.height_mm for r in input.leftovers):
                    raise ApiError("VALIDATION_ERROR", "Dimensi sisa tidak boleh melebihi dimensi sumber.")
                record = ReconciliationRecord(id=identity("rc"), execution_id=key, source_remnant_id=source.id,
                                              input_json=payload, note=input.note, created_at=now())
                session.add(record)
                session.flush()
                for measured in input.leftovers:
                    child = RemnantRecord(id=identity("r"), code=measured.code, lot_code=source.lot_code,
                        material_code=source.material_code, color_code=source.color_code, width_mm=measured.width_mm,
                        height_mm=measured.height_mm, condition_note=measured.condition_note,
                        source_note=f"Sisa terukur dari {source.code}; rekonsiliasi {record.id}; demo sintetis.",
                        verification_status="NEEDS_REVIEW", stock_status="AVAILABLE", created_at=now(), updated_at=now())
                    session.add(child)
                    session.flush()
                    session.add(ReconciliationChildRecord(remnant_id=child.id, reconciliation_id=record.id))
                source.stock_status, source.updated_at = "ARCHIVED", now()
                session.flush()
                return self._reconciliation(session, record)
        except IntegrityError as exc:
            raise ApiError("DUPLICATE_REMNANT_CODE", "Kode sisa sudah digunakan; seluruh rekonsiliasi dibatalkan.", 409) from exc

    @staticmethod
    def _reconciliation(session, record):
        children = list(session.scalars(select(ReconciliationChildRecord.remnant_id).where(
            ReconciliationChildRecord.reconciliation_id == record.id)))
        return {k: v for k, v in record_dict(record).items() if k != "input_json"} | {"new_remnant_ids": children}

    def history(self, key):
        self.require("executions")
        with Session(self.engine) as session:
            self._record(session, RemnantRecord, key)
            claim = session.get(StockClaimRecord, key)
            parent = session.get(ReconciliationChildRecord, key)
            reconciliation = session.scalar(select(ReconciliationRecord).where(ReconciliationRecord.source_remnant_id == key))
            return {"execution_id": claim.execution_id if claim else None,
                    "parent": self._reconciliation(session, session.get(ReconciliationRecord, parent.reconciliation_id)) if parent else None,
                    "reconciliation": self._reconciliation(session, reconciliation) if reconciliation else None}

    def reports(self, mode):
        self.require("executions")
        if mode not in ("SYNTHETIC_DEMO", "OPERATOR_REPORTED"):
            raise ApiError("VALIDATION_ERROR", "Mode laporan tidak dikenal.")
        with Session(self.engine) as session:
            records = list(session.scalars(select(ExecutionRecord).where(ExecutionRecord.mode == mode)))
            confirmed = [r for r in records if r.status == "CONFIRMED"]
            reconciled = set(session.scalars(select(ReconciliationRecord.source_remnant_id)))
            claims = list(session.scalars(select(StockClaimRecord).join(ExecutionRecord)
                                          .where(ExecutionRecord.mode == mode)))
            # Planned totals use confirmed sessions as the comparison cohort; drafts/cancellations never inflate impact.
            planned = sum(r.planned_reuse_area_mm2 for r in confirmed)
            actual = sum(r.confirmed_reuse_area_mm2 for r in confirmed)
            completed = list(session.scalars(select(ExecutionItemRecord).join(ExecutionRecord)
                .where(ExecutionRecord.mode == mode, ExecutionRecord.status == "CONFIRMED", ExecutionItemRecord.outcome == "COMPLETED")))
            durations = [(datetime.fromisoformat(r.confirmed_at) - datetime.fromisoformat(r.started_at)).total_seconds() for r in confirmed]
            return {"mode": mode, "planned_reuse_area_m2": planned / 1e6, "confirmed_reuse_area_m2": actual / 1e6,
                    "difference_area_m2": (planned - actual) / 1e6, "completed_piece_count": len(completed),
                    "execution_count": len(records), "confirmed_execution_count": len(confirmed),
                    "confirmation_rate_pct": 100 * len(confirmed) / len([r for r in records if r.status != "CANCELLED"]) if any(r.status != "CANCELLED" for r in records) else 0,
                    "mean_confirmation_duration_sec": sum(durations) / len(durations) if durations else None,
                    "pending_reconciliation_count": sum(c.remnant_id not in reconciled for c in claims),
                    "evidence_label": "Simulasi sintetis" if mode == "SYNTHETIC_DEMO" else "Konfirmasi operator; belum audit independen"}

    def get_defects(self, key):
        self.require("defects")
        self.repository.get_remnant(key)
        return {"items": load_defects(self.engine, key).get(key, [])}

    def replace_defects(self, key, input):
        self.require("defects")
        with write_session(self.engine) as session:
            source = self._record(session, RemnantRecord, key)
            if session.get(StockClaimRecord, key):
                conflict("Zona pada kain yang telah terpakai tidak dapat diedit.")
            if input.expected_updated_at != datetime.fromisoformat(source.updated_at):
                conflict("Data kain berubah; muat ulang sebelum menyimpan defect.")
            for i, d in enumerate(input.defects):
                if d.x_mm + d.width_mm > source.width_mm or d.y_mm + d.height_mm > source.height_mm:
                    raise ApiError("VALIDATION_ERROR", "Zona cacat berada di luar kain.")
                for other in input.defects[:i]:
                    if (d.x_mm < other.x_mm + other.width_mm and other.x_mm < d.x_mm + d.width_mm
                            and d.y_mm < other.y_mm + other.height_mm and other.y_mm < d.y_mm + d.height_mm):
                        raise ApiError("VALIDATION_ERROR", "Zona cacat tidak boleh saling overlap. Tepi bersinggungan diperbolehkan.")
            session.execute(delete(DefectRecord).where(DefectRecord.remnant_id == key))
            session.add_all([DefectRecord(id=identity("df"), remnant_id=key, **d.model_dump()) for d in input.defects])
            source.verification_status, source.updated_at = "NEEDS_REVIEW", now()
            session.flush()
        return self.get_defects(key)

    def preview_csv(self, input):
        self.require("csv_import")
        if len(input.csv_text.encode("utf-8")) > 262144:
            raise ApiError("VALIDATION_ERROR", "CSV maksimal 256 KB.")
        required = ["code", "lot_code", "material_code", "color_code", "width_mm", "height_mm", "quantity", "condition_note"]
        errors, expanded, rows = [], [], 0
        seen = {r.code for r in self.repository.list_remnants()}
        reader = csv.DictReader(io.StringIO(input.csv_text.lstrip("\ufeff")), strict=True)
        if reader.fieldnames != required:
            raise ApiError("VALIDATION_ERROR", "Header CSV harus sama dengan template.", details={"columns": required})
        try:
            for row_number, row in enumerate(reader, 2):
                rows += 1
                if rows > 1000:
                    raise ApiError("VALIDATION_ERROR", "Maksimal 1.000 baris CSV.")
                try:
                    if None in row or any(v is None for v in row.values()):
                        raise ValueError("Jumlah kolom tidak sesuai template.")
                    qty = int(row["quantity"])
                    if not 1 <= qty <= 1000:
                        raise ValueError("Quantity harus 1–1.000.")
                    base = row["code"].strip()
                    records = [RemnantCreate(code=base if qty == 1 else f"{base}-{unit:03}",
                        lot_code=row["lot_code"], material_code=row["material_code"], color_code=row["color_code"],
                        width_mm=int(row["width_mm"]), height_mm=int(row["height_mm"]), condition_note=row["condition_note"])
                        for unit in range(1, qty + 1)]
                    if any(r.code in seen for r in records):
                        raise ValueError("Kode hasil ekspansi sudah digunakan atau duplikat dalam CSV.")
                    if len(expanded) + len(records) > 1000:
                        raise ApiError("VALIDATION_ERROR", "Maksimal 1.000 lembar hasil ekspansi.")
                    seen.update(r.code for r in records)
                    expanded.extend({"row": row_number, **r.model_dump()} for r in records)
                except (ValueError, ValidationError) as exc:
                    errors.append({"row": row_number, "message": str(exc)})
        except csv.Error as exc:
            raise ApiError("VALIDATION_ERROR", "CSV tidak dapat dibaca.") from exc
        if rows == 0:
            errors.append({"row": 1, "message": "CSV tidak memiliki baris data."})
        token, expires = identity("imp"), (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
        with write_session(self.engine) as session:
            session.add(ImportPreviewRecord(id=token, payload_json=json.dumps({"items": expanded, "errors": errors}), expires_at=expires))
        return {"preview_token": token, "expires_at": expires, "row_count": rows, "sheet_count": len(expanded),
                "items": expanded, "errors": errors, "can_commit": bool(expanded) and not errors}

    def commit_csv(self, input):
        self.require("csv_import")
        try:
            with write_session(self.engine) as session:
                preview = self._record(session, ImportPreviewRecord, input.preview_token)
                if preview.committed_ids_json is not None:
                    return {"remnant_ids": json.loads(preview.committed_ids_json), "replayed": True}
                if datetime.fromisoformat(preview.expires_at) <= datetime.now(timezone.utc):
                    conflict("Preview kedaluwarsa. Buat preview baru.")
                data = json.loads(preview.payload_json)
                if data["errors"] or not data["items"]:
                    conflict("Perbaiki seluruh kesalahan sebelum impor.")
                ids = []
                for item in data["items"]:
                    values = RemnantCreate.model_validate({k: v for k, v in item.items() if k != "row"}).model_dump()
                    key = identity("r")
                    session.add(RemnantRecord(id=key, **values, verification_status="NEEDS_REVIEW", stock_status="AVAILABLE",
                                             created_at=now(), updated_at=now()))
                    ids.append(key)
                preview.committed_ids_json = json.dumps(ids)
                session.flush()
                return {"remnant_ids": ids, "replayed": False}
        except IntegrityError as exc:
            raise ApiError("DUPLICATE_REMNANT_CODE", "Kode bentrok setelah preview; seluruh impor dibatalkan.", 409) from exc

    def bulk_verify(self, input):
        self.require("csv_import")
        if len({i.id for i in input.items}) != len(input.items):
            raise ApiError("VALIDATION_ERROR", "ID verifikasi tidak boleh duplikat.")
        with write_session(self.engine) as session:
            for item in input.items:
                source = self._record(session, RemnantRecord, item.id)
                if item.expected_updated_at != datetime.fromisoformat(source.updated_at):
                    conflict("Data berubah setelah review; seluruh verifikasi dibatalkan.")
                if source.stock_status != "AVAILABLE" or session.get(StockClaimRecord, source.id):
                    conflict("Hanya kain tersedia yang belum digunakan dapat diverifikasi massal.")
                source.verification_status, source.updated_at = "VERIFIED", now()
                for defect in session.scalars(select(DefectRecord).where(DefectRecord.remnant_id == source.id)):
                    defect.verified_by_operator_at = source.updated_at
            return {"verified_ids": [i.id for i in input.items]}
