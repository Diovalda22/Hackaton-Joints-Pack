"""Required verification gate: missing dependencies must fail, not become a green skipped suite."""
import argparse
import importlib
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description="Verifikasi backend/database/CP-SAT dan benchmark penuh.")
    parser.add_argument("--time-limit", type=int, choices=range(1, 9), default=8)
    parser.add_argument("--output", default="benchmarks/full")
    parser.add_argument("--include-defects", action="store_true")
    args = parser.parse_args()
    missing = []
    for module in ("sqlalchemy", "ortools.sat.python.cp_model", "httpx", "pytest"):
        try:
            importlib.import_module(module)
        except ImportError:
            missing.append(module)
    if missing:
        parser.error(f"Dependency belum siap: {', '.join(missing)}. Jalankan python -m pip install -r requirements-dev.txt.")
    commands = [
        [sys.executable, "-m", "pytest", "-q"],
        [sys.executable, "-m", "app.demo.benchmark", "--time-limit", str(args.time_limit), "--output", args.output],
    ]
    if args.include_defects:
        commands[1].append("--include-defects")
    for command in commands:
        result = subprocess.run(command, check=False)
        if result.returncode:
            raise SystemExit(result.returncode)
    print("Verifikasi backend dan benchmark CP-SAT penuh lulus. Browser HTTP perlu diuji terpisah.")


if __name__ == "__main__":
    main()
