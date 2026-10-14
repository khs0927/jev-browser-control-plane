"""Always materialize a bounded failure result before artifact upload and callback.

This script runs in GitHub Actions even when browser dependency setup or task execution fails.
"""
import json
import os
from pathlib import Path

out = Path("mobile-work-results")
out.mkdir(exist_ok=True)
result_path = out / "result.json"
if not result_path.exists():
    task_type = os.environ.get("MWG_TASK_TYPE", "environment_check")
    if task_type not in {"environment_check", "gateway_tests", "browser_check"}:
        raise SystemExit("Unsupported fixture task type")
    result = {
        "schema_version": 1,
        "task_type": task_type,
        "python_version": ".".join(map(str, __import__("sys").version_info[:3])),
        "test_passed": False,
        "commit_sha": os.environ["GITHUB_SHA"],
        "run_id": os.environ["GITHUB_RUN_ID"],
        "run_attempt": int(os.environ.get("GITHUB_RUN_ATTEMPT", "1")),
        "summary": "Task setup or execution failed before producing result.json.",
        "findings": [{"code": "task_failed_before_result"}],
        "evidence": ["result.json", "report.md"],
    }
    result_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    (out / "report.md").write_text(
        f"# {task_type}\n\nTask did not produce a result; see GitHub Actions job logs.\n",
        encoding="utf-8",
    )
print("Result artifact ready")
