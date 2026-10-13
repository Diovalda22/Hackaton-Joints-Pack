from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./loopcut.db"
    cors_origins: tuple[str, ...] = ("http://localhost:3000", "http://127.0.0.1:3000")
    solver_time_limit_sec: int = 8
    solver_random_seed: int = 2026
    enable_optimizer: bool = True
    demo_mode: bool = True
    max_payload_bytes: int = 262144
    log_level: str = "INFO"
    enable_executions: bool = False
    enable_defects: bool = False
    enable_csv_import: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)
        origins = tuple(x.strip() for x in os.getenv("CORS_ORIGINS", ",".join(cls.cors_origins)).split(",") if x.strip())
        if "*" in origins:
            raise ValueError("CORS_ORIGINS harus berisi origin eksplisit, bukan wildcard.")
        limit = int(os.getenv("SOLVER_TIME_LIMIT_SEC", "8"))
        if not 1 <= limit <= 8:
            raise ValueError("SOLVER_TIME_LIMIT_SEC harus 1–8.")
        payload = int(os.getenv("MAX_PAYLOAD_BYTES", "262144"))
        if payload <= 0:
            raise ValueError("MAX_PAYLOAD_BYTES harus positif.")
        return cls(
            database_url=os.getenv("DATABASE_URL", cls.database_url),
            cors_origins=origins,
            solver_time_limit_sec=limit,
            solver_random_seed=int(os.getenv("SOLVER_RANDOM_SEED", "2026")),
            enable_optimizer=os.getenv("ENABLE_OPTIMIZER", "true").lower() == "true",
            demo_mode=os.getenv("DEMO_MODE", "true").lower() == "true",
            max_payload_bytes=payload,
            log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
            enable_executions=os.getenv("ENABLE_EXECUTIONS", "false").lower() == "true",
            enable_defects=os.getenv("ENABLE_DEFECTS", "false").lower() == "true",
            enable_csv_import=os.getenv("ENABLE_CSV_IMPORT", "false").lower() == "true",
        )
