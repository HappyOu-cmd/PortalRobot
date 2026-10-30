"""Verify the umbrella's failure semantics without launching real test layers."""
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import verify_project as script


class VerifyProjectTests(unittest.TestCase):
    def run_fixture(self, codes=(0, 0, 0, 0), missing=None):
        with tempfile.TemporaryDirectory(prefix="portal-verify-test-") as directory:
            root = Path(directory)
            plc = root / "Portal_robot/Device/application"
            plc.mkdir(parents=True)
            (plc / "owner.st").write_text("FUNCTION_BLOCK OWNER\nEND_FUNCTION_BLOCK", encoding="utf-8")
            for folder in ("visu/gateway", "visu/tests", "robot_simulator/tests"):
                target = root / folder / "nested"
                target.mkdir(parents=True)
                (target / "case.test.mjs").write_text("", encoding="utf-8")
            report_dir = root / "reports"
            results = iter(codes)
            calls = []

            def execute(command, **kwargs):
                calls.append(command)
                kwargs["stdout"].write("fixture layer output\n")
                return SimpleNamespace(returncode=next(results))

            def find(name):
                return None if name == missing else name

            with patch.object(script, "ROOT", root), patch.object(script.shutil, "which", side_effect=find), \
                    patch.object(script.subprocess, "run", side_effect=execute), \
                    patch.object(sys, "argv", ["verify_project.py", "--report-dir", str(report_dir)]), \
                    redirect_stdout(io.StringIO()):
                code = script.main()
            report = json.loads((report_dir / "summary.json").read_text(encoding="utf-8"))
            logs = [(report_dir / (name + ".log")).read_text(encoding="utf-8")
                    for name in ("python", "node", "tools", "build")]
            return code, report, calls, logs

    def test_every_layer_and_nested_node_file_is_included_in_a_successful_report(self):
        code, report, calls, logs = self.run_fixture()
        self.assertEqual(code, 0)
        self.assertTrue(report["passed"])
        self.assertEqual([r["name"] for r in report["results"]], ["python", "node", "tools", "build"])
        self.assertEqual(len([p for p in calls[1] if p.endswith(".test.mjs")]), 3)
        self.assertEqual(len(report["stSha256"]), 1)
        self.assertTrue(all(logs))

    def test_any_failed_layer_keeps_a_nonzero_verdict_and_does_not_hide_other_layers(self):
        for failed in range(4):
            codes = [0] * 4
            codes[failed] = 7
            with self.subTest(failed=failed):
                code, report, calls, _ = self.run_fixture(codes)
                self.assertEqual(code, 1)
                self.assertFalse(report["passed"])
                self.assertEqual(report["results"][failed]["exitCode"], 7)
                self.assertEqual(len(calls), 4)

    def test_an_unavailable_node_executable_is_an_error_with_a_log(self):
        code, report, calls, logs = self.run_fixture(missing="node")
        self.assertEqual(code, 1)
        self.assertFalse(report["passed"])
        self.assertEqual(report["results"][1]["exitCode"], 2)
        self.assertEqual(len(calls), 3)
        self.assertIn("executable is missing", logs[1])
