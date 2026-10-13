from contextlib import contextmanager
from sqlalchemy.orm import Session


@contextmanager
def write_session(engine):
    """Serialize SQLite read-check-write transactions, including MVP inventory edits."""
    with Session(engine) as session:
        session.connection().exec_driver_sql("BEGIN IMMEDIATE")
        try:
            yield session
            session.commit()
        except BaseException:
            session.rollback()
            raise
