"""Integration checks use only isolated temporary Git repositories."""

from contextlib import redirect_stderr, redirect_stdout
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import commit_project as script


class CommitProjectTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="portal-commit-test-")
        self.root = Path(self.temporary.name).resolve()
        self.source = self.root / "Portal robot"
        self.repo = self.root / "PortalRobot-GitHub"
        self.source.mkdir()
        self.repo.mkdir()
        self.env_patch = patch.dict(os.environ, {"GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"})
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        self.addCleanup(self.cleanup_directory)
        self.command("init", "-b", "main")
        for key, value in {"user.name": "Commit Script Test", "user.email": "test@example.invalid", "commit.gpgsign": "false", "core.autocrlf": "false"}.items():
            self.command("config", key, value)
        self.command("remote", "add", "origin", "https://github.com/HappyOu-cmd/PortalRobot")
        self.baseline = {
            "visu/package.json": b'{"name":"fixture"}\n',
            "visu/src/App.tsx": b"export const state = 'old';\n",
            "Portal_robot/Device/application/PLC_PRG.st": b"PROGRAM PLC_PRG\nEND_PROGRAM\n",
            "Portal_robot/Device/application/Symbols.xml": b"<symbols />\n",
            "Portal_robot.project": b"original\0project\r\n",
            "DOKS/guide.md": b"Original guide\n",
            ".gitignore": b"visu/src/ignored.ts\n",
            "AGENTS.md": b"Original rules\n",
        }
        for name, data in self.baseline.items():
            self.write(self.source, name, data)
            self.write(self.repo, name, data)
        self.write(self.repo, "README.md", b"Clone-only README\n")
        self.command("add", "--", *self.baseline, "README.md")
        self.command("commit", "-m", "chore(test): initial fixture")
        self.git = script.Git(self.repo)
        self.head = script.validate(self.source, self.git)

    def cleanup_directory(self):
        # Never recursively delete anything outside this test's unique temp root.
        self.assertEqual(self.root.parent, Path(tempfile.gettempdir()).resolve())
        self.assertTrue(self.root.name.startswith("portal-commit-test-"))
        self.temporary.cleanup()

    def command(self, *args):
        result = subprocess.run(["git", *args], cwd=self.repo, capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", errors="replace"))
        return result.stdout

    @staticmethod
    def write(root, name, data):
        path = script.inside(root, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def changed(self):
        return set(self.command("diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "-z", "HEAD").decode("utf-8").strip("\0").split("\0"))

    def do_commit(self, changes, title="fix(hmi): test local commit"):
        with redirect_stdout(io.StringIO()):
            return script.commit(self.source, self.git, changes, self.head, title)

    def test_selected_commit_preserves_other_tasks_rules_and_clone_only_files(self):
        self.write(self.source, "visu/src/App.tsx", b"export const state = 'new';\n")
        self.write(self.source, "DOKS/guide.md", b"Another task\n")
        self.write(self.repo, "AGENTS.md", b"User's independent rules\n")
        changes = script.plan(self.source, self.git)
        selected = [change for change in changes if change.name.startswith("visu/")]
        sha = self.do_commit(selected)
        self.assertNotEqual(sha, self.head)
        self.assertEqual(self.changed(), {"visu/src/App.tsx"})
        self.assertEqual((self.repo / "DOKS/guide.md").read_bytes(), b"Original guide\n")
        self.assertEqual((self.repo / "AGENTS.md").read_bytes(), b"User's independent rules\n")
        self.assertEqual((self.repo / "README.md").read_bytes(), b"Clone-only README\n")
        self.assertEqual(self.command("diff", "--cached", "--name-only"), b"")
        self.assertEqual(self.command("tag"), b"")
        self.assertEqual(self.command("for-each-ref", "refs/remotes"), b"")
        self.assertIn("скриптом не проверялись", self.command("log", "-1", "--format=%B").decode("utf-8"))

    def test_dry_run_does_not_change_files_index_or_head(self):
        self.write(self.source, "visu/src/App.tsx", b"New code\n")
        self.write(self.repo, "AGENTS.md", b"Independent rules\n")
        before = self.command("status", "--porcelain=v1", "-z")
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            result = script.main(["--source", str(self.source), "--repo", str(self.repo), "--dry-run"])
        self.assertEqual(result, 0)
        self.assertEqual(self.command("status", "--porcelain=v1", "-z"), before)
        self.assertEqual(self.git.text("rev-parse", "HEAD"), self.head)
        self.assertEqual((self.repo / "visu/src/App.tsx").read_bytes(), self.baseline["visu/src/App.tsx"])

    def test_noninteractive_message_commits_without_requesting_input(self):
        self.write(self.source, "visu/src/App.tsx", b"New code\n")
        title = 'fix(hmi): восстановить "$value" & связь'
        with redirect_stdout(io.StringIO()) as output, patch("builtins.input", side_effect=AssertionError("Unexpected prompt")):
            result = script.main(["--source", str(self.source), "--repo", str(self.repo), "--yes", "-m", title])
        self.assertEqual(result, 0)
        self.assertEqual(self.git.text("log", "-1", "--format=%s"), title)
        self.assertLess(len(output.getvalue().splitlines()), 8)
        self.assertEqual(self.changed(), {"visu/src/App.tsx"})

    def test_verification_launcher_and_readme_assets_are_published_with_explicit_paths(self):
        self.write(self.source, "verify.cmd", b"@echo off\r\npython tools\\verify_project.py %*\r\n")
        asset = "DOKS/assets/readme/cover.png"
        image = b"\x89PNG\r\n\x1a\nfixture"
        self.write(self.source, asset, image)
        changes = script.plan(self.source, self.git, prefixes=["verify.cmd", "DOKS/assets/readme"])
        self.do_commit(changes, "chore(tools): publish verification launcher and documentation assets")
        self.assertEqual(self.changed(), {"verify.cmd", asset})
        self.assertEqual((self.repo / asset).read_bytes(), image)
        self.assertEqual((self.repo / "verify.cmd").read_bytes(), (self.source / "verify.cmd").read_bytes())

    def test_runtime_data_rules_credentials_and_build_outputs_are_excluded(self):
        excluded = [
            "visu/gateway/data/cell-events.sqlite", "visu/gateway/data/config.json", "visu/gateway/.env",
            "visu/gateway/server.pem", "visu/gateway/events.sqlite-wal", "visu/gateway/run.log",
            "visu/src/AGENTS.md", "visu/src/local.local.json", "visu/src/artifacts/debug.txt",
            "visu/node_modules/package/index.js", "visu/dist/index.js", "robot_simulator/config.json",
            "tools/__pycache__/commit_project.pyc", "DOKS/temp/draft.md",
        ]
        for name in excluded:
            self.write(self.source, name, b"Do not commit\n")
        self.write(self.source, "AGENTS.md", b"Changed rules\n")
        self.write(self.source, "VERSION", b"9.9.9\n")
        self.write(self.source, "CHANGELOG.md", b"Release\n")
        self.write(self.source, "visu/gateway/.env.example", b"EXAMPLE=value\n")
        self.write(self.source, "visu/src/assets/new.png", b"\x89PNG\0fixture")
        self.assertEqual({change.name for change in script.plan(self.source, self.git)}, {
            "visu/gateway/.env.example", "visu/src/assets/new.png",
        })

    def test_different_uncommitted_clone_edit_is_not_overwritten(self):
        self.write(self.source, "visu/src/App.tsx", b"Source task\n")
        self.write(self.repo, "visu/src/App.tsx", b"Clone task\n")
        with self.assertRaises(script.CommitError):
            script.plan(self.source, self.git)
        self.assertEqual((self.repo / "visu/src/App.tsx").read_bytes(), b"Clone task\n")
        self.assertEqual(self.git.text("rev-parse", "HEAD"), self.head)

    def test_staged_files_and_in_progress_merge_are_rejected(self):
        self.write(self.repo, "AGENTS.md", b"Already staged\n")
        self.command("add", "--", "AGENTS.md")
        before = self.command("diff", "--cached")
        with self.assertRaises(script.CommitError):
            script.validate(self.source, self.git)
        self.assertEqual(self.command("diff", "--cached"), before)
        self.command("restore", "--staged", "--", "AGENTS.md")
        self.write(self.repo, ".git/MERGE_HEAD", self.head.encode("ascii") + b"\n")
        with self.assertRaises(script.CommitError):
            script.validate(self.source, self.git)

    def test_source_or_clone_changes_after_preview_stop_before_any_copy(self):
        self.write(self.source, "visu/src/App.tsx", b"First code\n")
        self.write(self.source, "DOKS/guide.md", b"First guide\n")
        changes = script.plan(self.source, self.git)
        self.write(self.source, "visu/src/App.tsx", b"Concurrent agent update\n")
        with self.assertRaises(script.CommitError):
            self.do_commit(changes)
        self.assertEqual((self.repo / "DOKS/guide.md").read_bytes(), self.baseline["DOKS/guide.md"])
        changes = script.plan(self.source, self.git)
        self.write(self.repo, "visu/src/App.tsx", b"Concurrent clone update\n")
        with self.assertRaises(script.CommitError):
            self.do_commit(changes)
        self.assertEqual((self.repo / "DOKS/guide.md").read_bytes(), self.baseline["DOKS/guide.md"])
        self.assertEqual(self.command("diff", "--cached", "--name-only"), b"")

    def test_native_project_and_xml_are_opt_in_and_copied_byte_for_byte(self):
        project = b"saved\0native\xffproject\r\n"
        xml = b'<symbols name="export" />\r\n'
        self.write(self.source, "Portal_robot.project", project)
        self.write(self.source, "Portal_robot/Device/application/Symbols.xml", xml)
        self.assertEqual(script.plan(self.source, self.git), [])
        changes = script.plan(self.source, self.git, include_codesys=True)
        self.do_commit(changes, "chore(plc): save native snapshots")
        self.assertEqual((self.repo / "Portal_robot.project").read_bytes(), project)
        self.assertEqual((self.repo / "Portal_robot/Device/application/Symbols.xml").read_bytes(), xml)

    def test_missing_files_are_preserved_until_deletion_is_explicit(self):
        script.inside(self.source, "DOKS/guide.md").unlink()
        self.assertEqual(script.plan(self.source, self.git), [])
        with self.assertRaises(script.CommitError):
            script.plan(self.source, self.git, deletions=["AGENTS.md"])
        changes = script.plan(self.source, self.git, deletions=["DOKS/guide.md"])
        self.do_commit(changes, "docs(cell): remove obsolete guide")
        self.assertEqual(self.changed(), {"DOKS/guide.md"})
        self.assertFalse((self.repo / "DOKS/guide.md").exists())
        self.assertTrue((self.repo / "README.md").exists())

    def test_path_selection_and_invalid_title_cannot_commit_other_files(self):
        self.write(self.source, "visu/src/App.tsx", b"New code\n")
        self.write(self.source, "DOKS/guide.md", b"New guide\n")
        changes = script.plan(self.source, self.git)
        self.assertEqual([change.name for change in script.select(changes, "2")], ["visu/src/App.tsx"])
        self.assertEqual(script.select(changes, "1-2"), changes)
        self.assertEqual(script.select(changes, "q"), [])
        self.assertEqual([change.name for change in script.plan(self.source, self.git, prefixes=["visu"])], ["visu/src/App.tsx"])
        for value in ("0", "3", "2-1", "all else"):
            with self.assertRaises(script.CommitError):
                script.select(changes, value)
        with self.assertRaises(script.CommitError):
            self.do_commit(changes, "Unstructured title")
        self.assertEqual(self.git.text("rev-parse", "HEAD"), self.head)
        self.assertEqual((self.repo / "DOKS/guide.md").read_bytes(), self.baseline["DOKS/guide.md"])

    def test_ignored_files_and_line_ending_only_changes_do_not_pollute_plan(self):
        self.write(self.source, "visu/src/ignored.ts", b"Ignored code\n")
        self.write(self.source, "visu/src/App.tsx", self.baseline["visu/src/App.tsx"].replace(b"\n", b"\r\n"))
        self.assertEqual(script.plan(self.source, self.git), [])

    def test_commit_hook_failure_keeps_head_and_preserves_the_selected_source(self):
        self.write(self.source, "visu/src/App.tsx", b"New code\n")
        changes = script.plan(self.source, self.git)
        self.write(self.repo, ".git/hooks/pre-commit", b"#!/bin/sh\nexit 1\n")
        (self.repo / ".git/hooks/pre-commit").chmod(0o755)
        with self.assertRaises(script.CommitError):
            self.do_commit(changes)
        self.assertEqual(self.git.text("rev-parse", "HEAD"), self.head)
        self.assertEqual((self.source / "visu/src/App.tsx").read_bytes(), b"New code\n")
        self.assertIn(b"visu/src/App.tsx", self.command("diff", "--cached", "--name-only"))

    def test_whitespace_failure_prevents_commit_while_crlf_is_supported(self):
        self.write(self.source, "visu/src/App.tsx", b"export const value = 1;  \r\n")
        changes = script.plan(self.source, self.git)
        with self.assertRaises(script.CommitError):
            self.do_commit(changes)
        self.assertEqual(self.git.text("rev-parse", "HEAD"), self.head)
        self.assertEqual((self.source / "visu/src/App.tsx").read_bytes(), b"export const value = 1;  \r\n")

    def test_head_change_after_preview_prevents_copying(self):
        self.write(self.source, "visu/src/App.tsx", b"New task\n")
        changes = script.plan(self.source, self.git)
        self.command("commit", "--allow-empty", "-m", "chore(test): concurrent commit")
        new_head = self.git.text("rev-parse", "HEAD")
        with self.assertRaises(script.CommitError):
            self.do_commit(changes)
        self.assertEqual(self.git.text("rev-parse", "HEAD"), new_head)
        self.assertEqual((self.repo / "visu/src/App.tsx").read_bytes(), self.baseline["visu/src/App.tsx"])

    def test_spaces_and_brackets_in_selected_paths_are_literal(self):
        name = "visu/src/a b[1].ts"
        self.write(self.source, name, b"export const selected = true;\n")
        self.write(self.source, "visu/src/a b1.ts", b"export const otherTask = true;\n")
        changes = script.plan(self.source, self.git, prefixes=[name])
        self.do_commit(changes)
        self.assertEqual(self.changed(), {name})
        self.assertFalse((self.repo / "visu/src/a b1.ts").exists())

    def test_path_escapes_and_source_links_are_rejected(self):
        for name in ("../outside.txt", "visu/../../outside.txt", "C:/outside.txt", "/outside.txt"):
            with self.assertRaises(script.CommitError):
                script.inside(self.repo, name)
        outside = self.root / "outside.txt"
        outside.write_bytes(b"Outside source root\n")
        link = self.source / "visu/src/link.ts"
        try:
            link.symlink_to(outside)
        except OSError:
            return  # Windows may not grant symlink creation to the current account.
        with self.assertRaises(script.CommitError):
            script.plan(self.source, self.git)


if __name__ == "__main__":
    unittest.main()
