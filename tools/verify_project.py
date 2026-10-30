"""Run every local test layer and the HMI build without contacting a PLC."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report-dir", type=Path, help="Directory for JSON summary and per-layer logs")
    args = parser.parse_args()
    directory = (args.report_dir or Path(tempfile.gettempdir()) / "PortalRobot-checks" /
                 datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    node = shutil.which("node")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    node_tests = sorted(path for folder in (ROOT / "visu/gateway", ROOT / "visu/tests", ROOT / "robot_simulator/tests")
                        for path in folder.rglob("*") if path.is_file() and path.name.endswith((".test.mjs", ".test.ts")))
    steps = [
        ("python", ROOT / "robot_simulator", [sys.executable, "-m", "pytest", "-ra"]),
        ("node", ROOT / "visu", [node, "--test", "--test-concurrency=4", "--test-reporter=spec", *map(str, node_tests)]),
        ("tools", ROOT, [sys.executable, "-m", "pytest", "-q", "tools/tests"]),
        ("build", ROOT / "visu", [npm, "run", "build"]),
    ]
    environment = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    results = []
    print(f"Local checks only. Logs: {directory}", flush=True)
    for name, cwd, command in steps:
        log = directory / (name + ".log")
        started = time.monotonic()
        print(f"RUN {name}", flush=True)
        try:
            if not command[0]:
                raise FileNotFoundError(f"{name}: required executable is missing")
            with log.open("w", encoding="utf-8") as output:
                process = subprocess.run(command, cwd=cwd, env=environment, stdout=output,
                                         stderr=subprocess.STDOUT, check=False)
            result = {"name": name, "exitCode": process.returncode, "log": str(log)}
        except OSError as error:
            log.write_text(str(error), encoding="utf-8")
            result = {"name": name, "exitCode": 2, "log": str(log), "error": str(error)}
        result["durationSeconds"] = round(time.monotonic() - started, 2)
        results.append(result)
        print(f"{'PASS' if result['exitCode'] == 0 else 'FAIL'} {name} ({result['durationSeconds']}s)", flush=True)
    report = {"scope": "local source tests, bounded ST execution and HMI build; no PLC/hardware validation",
              "passed": all(r["exitCode"] == 0 for r in results), "results": results,
              "stSha256": {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                           for p in sorted((ROOT / "Portal_robot/Device/application").rglob("*.st"))}}
    path = directory / "summary.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{'PASS' if report['passed'] else 'FAIL'} overall. Report: {path}", flush=True)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
