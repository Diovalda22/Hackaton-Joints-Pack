import argparse
import csv
import importlib.util
import json
import platform
from pathlib import Path
from app.core.config import Settings
from app.demo.scenarios import scenarios
from app.optimization.domain import expand_order
from app.optimization.validator import validate_layout
from app.services.planning import plan_order
from app.services.qualification import qualify


def main():
    parser = argparse.ArgumentParser(description="Benchmark 30 input sintetis; tidak memalsukan hasil optimizer.")
    parser.add_argument("--output", type=Path, default=Path("benchmarks/full"))
    parser.add_argument("--time-limit", type=int, choices=range(1, 9), default=8)
    parser.add_argument("--baseline-only", action="store_true", help="Uji greedy saja; bukan benchmark CP-SAT lengkap.")
    parser.add_argument("--include-defects", action="store_true", help="Tambahkan 10 skenario zona cacat; total 40 input seeded.")
    args = parser.parse_args()
    if not args.baseline_only and importlib.util.find_spec("ortools") is None:
        parser.error("OR-Tools belum tersedia. Install requirements; atau --baseline-only untuk pengujian greedy yang diberi label.")
    settings = Settings(enable_optimizer=not args.baseline_only, solver_time_limit_sec=args.time_limit)
    args.output.mkdir(parents=True, exist_ok=True)
    inputs, runs, rows = [], [], []
    outcomes = {"WIN": 0, "TIE": 0, "LOSS": 0, "NO_CANDIDATE": 0, "SKIPPED": 0}
    for scenario in scenarios(include_defects=args.include_defects):
        run_settings = Settings(enable_optimizer=settings.enable_optimizer, solver_time_limit_sec=args.time_limit,
                                solver_random_seed=scenario.seed)
        plan = plan_order(scenario.order, scenario.remnants, run_settings, defects=scenario.defects)
        eligible, _ = qualify(scenario.remnants)
        pieces = expand_order(scenario.order)
        for result in (plan.baseline, plan.selected):
            validate_layout(result.placements, pieces, eligible, result.unallocated, scenario.defects)
        metadata = plan.solver_metadata
        candidate_score = metadata.optimizer_objective
        raw_comparison = ("SKIPPED" if metadata.raw_solver_status == "SKIPPED" else "NO_CANDIDATE" if candidate_score is None
                          else "WIN" if candidate_score > metadata.baseline_objective else "LOSS" if candidate_score < metadata.baseline_objective else "TIE")
        outcomes[raw_comparison] += 1
        inputs.append(scenario.as_dict())
        runs.append({"scenario_id": scenario.id, "run": plan.model_dump(mode="json")})
        rows.append(dict(scenario_id=scenario.id, group=scenario.group, seed=scenario.seed, remnants_count=len(scenario.remnants),
                         pieces_count=len(pieces), eligible_count=len(eligible),
                         baseline_area_mm2=plan.baseline.metrics.reuse_area_mm2,
                         selected_area_mm2=plan.selected.metrics.reuse_area_mm2,
                         gain_mm2=plan.comparison.gain_vs_greedy_mm2,
                         baseline_piece_count=plan.baseline.metrics.placed_count,
                         selected_piece_count=plan.selected.metrics.placed_count,
                         solver_status=str(plan.solver_status), selected_strategy=plan.selected_strategy,
                         solver_wall_time_sec=metadata.wall_time_sec, geometry_valid=True,
                         raw_solver_status=metadata.raw_solver_status, optimizer_vs_baseline=raw_comparison,
                         optimizer_objective=candidate_score, baseline_objective=metadata.baseline_objective,
                         selected_objective=metadata.selected_objective, engine_version=metadata.engine_version,
                         baseline_only=args.baseline_only))
    report = {"synthetic": True, "baseline_only": args.baseline_only, "scenarios": len(rows),
              "defect_scenarios": sum(row["group"] == "defect" for row in rows),
              "time_limit_sec": args.time_limit, "num_search_workers": 1, "python": platform.python_version(),
              "platform": platform.platform(), "processor": platform.processor(), "optimizer_vs_baseline": outcomes,
              "valid_layouts": sum(row["geometry_valid"] for row in rows),
              "engine_errors": sum(row["raw_solver_status"] in ("ERROR", "MODEL_INVALID", "INFEASIBLE") for row in rows),
              "complete": not args.baseline_only and not any(row["raw_solver_status"] in ("ERROR", "MODEL_INVALID", "INFEASIBLE") for row in rows),
              "solver_status_counts": {status: sum(r["solver_status"] == status for r in rows)
                                       for status in sorted({r["solver_status"] for r in rows})}}
    for filename, value in (("scenarios.json", inputs), ("runs.json", runs), ("summary.json", report)):
        (args.output / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    with (args.output / "results.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["engine_errors"]:
        raise SystemExit("Benchmark menyimpan laporan error, tetapi tidak lulus: periksa engine_errors.")


if __name__ == "__main__":
    main()
