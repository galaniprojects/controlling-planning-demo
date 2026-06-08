from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from config import DATABASE_URL

# ``check_same_thread`` is a SQLite-only connect arg; PostgreSQL (psycopg)
# rejects unknown args, so only pass it for sqlite URLs.
_connect_args = (
    {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations() -> None:
    """Bring the database schema to head via Alembic.

    Idempotent and safe for both fresh and pre-existing databases:
      - empty DB -> the baseline migration creates the full schema;
      - a DB that already has the schema but no ``alembic_version`` (e.g. a dev
        SQLite file created by an earlier ``create_all``) is *stamped* at head,
        adopting it without re-running ``CREATE TABLE``;
      - otherwise any pending revisions are applied.

    The Docker entrypoint also runs ``alembic upgrade head`` before the app
    starts; calling this on startup keeps the no-Docker local run
    (``python main.py``) working without a manual migration step.
    """
    import os

    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect

    backend_dir = os.path.dirname(os.path.abspath(__file__))
    cfg = Config(os.path.join(backend_dir, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))

    insp = inspect(engine)
    has_version = insp.has_table("alembic_version")
    # `projects` is the sentinel for "schema already exists" (a central, stable
    # core table). If it is ever renamed, update this probe accordingly.
    has_schema = insp.has_table("projects")

    if has_schema and not has_version:
        command.stamp(cfg, "head")
    else:
        command.upgrade(cfg, "head")
