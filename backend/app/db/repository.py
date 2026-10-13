import json
from datetime import datetime
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.errors import ApiError
from app.db.session import initialize_database, make_engine
from app.models.remnant import RemnantRecord
from app.models.order import OrderRecord, OrderLineRecord
from app.models.plan_run import PlanRunRecord
from app.schemas.remnant import Remnant
from app.schemas.order import Order, OrderLine
from app.schemas.plan import PlanRun
from app.db.transactions import write_session
from sqlalchemy import inspect


def record_dict(record) -> dict:
    return {column.name: getattr(record, column.name) for column in record.__table__.columns}


class SqlAlchemyRepository:
    def __init__(self, database_url: str):
        self.engine = make_engine(database_url)
        initialize_database(self.engine)

    def close(self):
        self.engine.dispose()

    def list_remnants(self) -> list[Remnant]:
        with Session(self.engine) as session:
            return [Remnant.model_validate(record_dict(r)) for r in session.scalars(
                select(RemnantRecord).order_by(RemnantRecord.created_at, RemnantRecord.id))]

    def get_remnant(self, identity: str) -> Remnant:
        with Session(self.engine) as session:
            record = session.get(RemnantRecord, identity)
            if record is None:
                raise ApiError("NOT_FOUND", "Kain tidak ditemukan.", 404)
            return Remnant.model_validate(record_dict(record))

    def create_remnant(self, remnant: Remnant) -> Remnant:
        with Session(self.engine) as session:
            try:
                session.add(RemnantRecord(**remnant.model_dump(mode="json")))
                session.commit()
            except IntegrityError as exc:
                session.rollback()
                if session.scalar(select(RemnantRecord.id).where(RemnantRecord.code == remnant.code)):
                    raise ApiError("DUPLICATE_REMNANT_CODE", "Kode kain sudah digunakan.", 409, {"field": "code"}) from exc
                raise
        return remnant.model_copy(deep=True)

    def update_remnant_if_current(self, remnant: Remnant, expected_updated_at) -> Remnant:
        return self.update_remnant(remnant, expected_updated_at)

    def update_remnant(self, remnant: Remnant, expected_updated_at=None) -> Remnant:
        with write_session(self.engine) as session:
            record = session.get(RemnantRecord, remnant.id)
            if record is None:
                raise ApiError("NOT_FOUND", "Kain tidak ditemukan.", 404)
            if expected_updated_at is not None and datetime.fromisoformat(record.updated_at) != expected_updated_at:
                raise ApiError("CONFLICT", "Kain berubah saat disimpan. Muat ulang dan tinjau kembali.", 409)
            if inspect(session.connection()).has_table("execution_stock_claims"):
                from app.models.roadmap import StockClaimRecord, DefectRecord
                if session.get(StockClaimRecord, remnant.id):
                    if remnant.stock_status != record.stock_status or any(getattr(remnant, key) != getattr(record, key)
                        for key in ("material_code", "color_code", "width_mm", "height_mm", "condition_note")):
                        raise ApiError("CONFLICT", "Kain sudah dipakai; perubahan stok/geometri harus melalui rekonsiliasi.", 409)
                for defect in session.scalars(select(DefectRecord).where(DefectRecord.remnant_id == remnant.id)):
                    if defect.x_mm + defect.width_mm > remnant.width_mm or defect.y_mm + defect.height_mm > remnant.height_mm:
                        raise ApiError("VALIDATION_ERROR", "Ukuran baru membuat zona cacat keluar batas. Ubah zona terlebih dahulu.")
                    if remnant.verification_status == "VERIFIED" and (record.verification_status != "VERIFIED" or any(
                            getattr(record, key) != getattr(remnant, key) for key in
                            ("material_code", "color_code", "width_mm", "height_mm", "condition_note"))):
                        defect.verified_by_operator_at = remnant.updated_at.isoformat()
            for field, value in remnant.model_dump(mode="json").items():
                setattr(record, field, value)
            try:
                session.flush()
            except IntegrityError as exc:
                session.rollback()
                if session.scalar(select(RemnantRecord.id).where(RemnantRecord.code == remnant.code,
                                                                  RemnantRecord.id != remnant.id)):
                    raise ApiError("DUPLICATE_REMNANT_CODE", "Kode kain sudah digunakan.", 409, {"field": "code"}) from exc
                raise
        return remnant.model_copy(deep=True)

    def get_planning_inputs(self, ids):
        from app.services.roadmap import load_defects
        with Session(self.engine) as session:
            session.connection().exec_driver_sql("BEGIN")
            records = {r.id: Remnant.model_validate(record_dict(r)) for r in session.scalars(select(RemnantRecord))}
            if any(key not in records for key in ids):
                raise ApiError("NOT_FOUND", "Kain tidak ditemukan.", 404)
            defects = load_defects(self.engine, session=session)
            return [records[key] for key in ids], {key: defects[key] for key in ids if key in defects}

    @staticmethod
    def _read_order(session: Session, record: OrderRecord) -> Order:
        lines = session.scalars(select(OrderLineRecord).where(OrderLineRecord.order_id == record.id)
                                .order_by(OrderLineRecord.position)).all()
        return Order(**record_dict(record), lines=[OrderLine.model_validate(
            {k: v for k, v in record_dict(line).items() if k not in ("order_id", "position")}) for line in lines])

    def list_orders(self) -> list[Order]:
        with Session(self.engine) as session:
            return [self._read_order(session, o) for o in session.scalars(
                select(OrderRecord).order_by(OrderRecord.created_at, OrderRecord.id))]

    def get_order(self, identity: str) -> Order:
        with Session(self.engine) as session:
            record = session.get(OrderRecord, identity)
            if record is None:
                raise ApiError("NOT_FOUND", "Pesanan tidak ditemukan.", 404)
            return self._read_order(session, record)

    @staticmethod
    def _insert_order(session: Session, order: Order):
        values = order.model_dump(mode="json", exclude={"lines"})
        session.add(OrderRecord(**values))
        session.flush()
        session.add_all([OrderLineRecord(**line.model_dump(mode="json"), order_id=order.id, position=i)
                         for i, line in enumerate(order.lines)])

    def create_order(self, order: Order) -> Order:
        with Session(self.engine) as session, session.begin():
            self._insert_order(session, order)
        return order.model_copy(deep=True)

    def save_plan(self, plan: PlanRun) -> PlanRun:
        data = plan.model_dump(mode="json")
        values = {key: data[key] for key in ("id", "order_id", "created_at", "solver_status", "selected_strategy")}
        for response_key, db_key in (("input_snapshot", "input_snapshot_json"), ("baseline", "baseline_result_json"),
                                     ("selected", "selected_result_json"), ("solver_metadata", "solver_metadata_json"),
                                     ("comparison", "comparison_json"), ("excluded_remnants", "excluded_remnants_json"),
                                     ("warnings", "warnings_json")):
            values[db_key] = json.dumps(data[response_key], ensure_ascii=False, separators=(",", ":"))
        with Session(self.engine) as session, session.begin():
            session.add(PlanRunRecord(**values))
        return plan.model_copy(deep=True)

    def get_plan(self, identity: str) -> PlanRun:
        with Session(self.engine) as session:
            record = session.get(PlanRunRecord, identity)
            if record is None:
                raise ApiError("NOT_FOUND", "Rencana tidak ditemukan.", 404)
            data = {key: getattr(record, key) for key in ("id", "order_id", "created_at", "solver_status", "selected_strategy")}
            for key, db_key in (("input_snapshot", "input_snapshot_json"), ("baseline", "baseline_result_json"),
                                ("selected", "selected_result_json"), ("solver_metadata", "solver_metadata_json"),
                                ("comparison", "comparison_json"), ("excluded_remnants", "excluded_remnants_json"),
                                ("warnings", "warnings_json")):
                data[key] = json.loads(getattr(record, db_key))
            return PlanRun.model_validate(data)

    def has_data(self) -> bool:
        with Session(self.engine) as session:
            return any(session.scalar(select(model.id).limit(1)) is not None
                       for model in (RemnantRecord, OrderRecord, PlanRunRecord))

    def seed(self, remnants: list[Remnant], orders: list[Order], reset: bool = False):
        if self.has_data() and not reset:
            raise ApiError("WORKSPACE_NOT_EMPTY", "Database berisi data. Seed tidak menimpa data tanpa reset eksplisit.", 409)
        with Session(self.engine) as session, session.begin():
            if reset:
                for model in (PlanRunRecord, OrderLineRecord, OrderRecord, RemnantRecord):
                    session.execute(delete(model))
            session.add_all([RemnantRecord(**r.model_dump(mode="json")) for r in remnants])
            session.flush()
            for order in orders:
                self._insert_order(session, order)
