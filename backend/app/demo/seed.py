import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from app.core.config import Settings
from app.demo.data import demo_data


def main():
    parser = argparse.ArgumentParser(description="Seed input sintetis; tidak menyimpan layout/status solver palsu.")
    parser.add_argument("--reset", action="store_true", help="Mengganti data database setelah konfirmasi; backup dibuat dahulu.")
    args = parser.parse_args()
    settings = Settings.from_env()
    if not settings.demo_mode:
        parser.error("Seed hanya tersedia ketika DEMO_MODE=true.")
    from app.db.repository import SqlAlchemyRepository
    repository = SqlAlchemyRepository(settings.database_url)
    try:
        if repository.has_data():
            if not args.reset:
                parser.error("Database tidak kosong. Data tidak diubah; gunakan --reset jika ingin menggantinya.")
            if input("Semua data workspace akan diganti. Ketik RESET untuk mengonfirmasi: ") != "RESET":
                print("Dibatalkan. Data tidak diubah.")
                return
            # Copy the real SQLite database, including committed WAL transactions, before deleting anything.
            import sqlite3
            path = repository.engine.url.database
            if not path or path == ":memory:":
                parser.error("Reset CLI memerlukan database file agar backup dapat dibuat.")
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup = Path(path).with_name(f"{Path(path).stem}.backup-{stamp}.db")
            with sqlite3.connect(path) as source, sqlite3.connect(backup) as destination:
                source.backup(destination)
            print(f"Backup dibuat: {backup}")
        remnants, orders = demo_data()
        repository.seed(remnants, orders, reset=args.reset)
        print(json.dumps({"synthetic": True, "remnants": len(remnants), "orders": len(orders),
                          "plan_runs": 0, "message": "Input disimpan. Jalankan plan untuk menghitung hasil nyata."}, ensure_ascii=False))
    finally:
        repository.close()


if __name__ == "__main__":
    main()
