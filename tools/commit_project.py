"""Synchronize selected project sources into the Git clone and commit locally."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile


TREES = (
    "Portal_robot", "DOKS", "tools", "visu/src", "visu/public", "visu/gateway",
    "visu/tests", "visu/.storybook", "robot_simulator/robot_simulator", "robot_simulator/tests",
)
FILES = {
    ".gitignore", ".gitattributes", "README.md", "commit.cmd", "verify.cmd",
    "visu/.gitignore", "visu/README.md", "visu/index.html", "visu/alarm-catalog.json",
    "visu/package.json", "visu/package-lock.json", "visu/pnpm-workspace.yaml",
    "visu/tsconfig.json", "visu/tsconfig.app.json", "visu/tsconfig.node.json", "visu/vite.config.ts",
    "robot_simulator/.gitignore", "robot_simulator/README.md", "robot_simulator/pyproject.toml",
    "robot_simulator/requirements.txt", "robot_simulator/run_simulator.bat",
}
EXCLUDED_DIRS = {
    ".git", ".agents", ".codex", "node_modules", "dist", "artifacts", "storybook-static",
    ".venv", "venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    "logs", "temp", "tmp", ".idea", ".vscode",
}
EXCLUDED_SUFFIXES = {
    ".sqlite", ".db", ".log", ".pem", ".key", ".pfx", ".p12", ".crt", ".cer",
    ".pyc", ".pyo", ".bak", ".tmp", ".tsbuildinfo", ".precompilecache", ".compileinfo",
    ".bootinfo", ".bootinfo_guids", ".opt", ".projectarchive",
}
TEXT_SUFFIXES = {
    ".st", ".xml", ".md", ".json", ".ts", ".tsx", ".mjs", ".js", ".css", ".html",
    ".py", ".ps1", ".cmd", ".bat", ".toml", ".txt", ".yaml", ".yml", ".svg",
}
TITLE = re.compile(r"^(fix|feat|refactor|docs|test|chore)\([a-z0-9][a-z0-9_-]*\): \S[^\r\n]*$")


class CommitError(Exception):
    pass


def relative_path(value: str) -> str:
    value = value.replace("\\", "/")
    parts = PurePosixPath(value).parts
    if not parts or PurePosixPath(value).is_absolute() or any(part in (".", "..") or ":" in part for part in parts) or "\0" in value:
        raise CommitError(f"Недопустимый относительный путь: {value!r}")
    return "/".join(parts)


def inside(root: Path, name: str) -> Path:
    path = root / relative_path(name)
    if not path.resolve().is_relative_to(root.resolve()) or path.is_symlink():
        raise CommitError(f"Путь выходит за рабочую папку или является ссылкой: {name}")
    return path


def managed(name: str, include_codesys: bool = False) -> bool:
    path = PurePosixPath(name)
    lower = name.lower()
    if any(part.lower() in EXCLUDED_DIRS for part in path.parts):
        return False
    if lower.startswith("visu/gateway/data/") or path.name.lower() in {
        "agents.md", "config.json", "secrets.json", "credentials.json",
    }:
        return False
    if path.name.startswith(".env") and path.name not in {".env.example", ".env.sample", ".env.template"}:
        return False
    if path.suffix.lower() in EXCLUDED_SUFFIXES or any(marker in path.name.lower() for marker in (".sqlite-", ".db-", ".project.~", ".local.")):
        return False
    if name == "Portal_robot.project":
        return include_codesys
    if name.startswith("Portal_robot/"):
        return path.suffix.lower() == ".st" or (include_codesys and path.suffix.lower() == ".xml")
    return name in FILES or any(name.startswith(tree + "/") for tree in TREES if tree != "Portal_robot")


class Git:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.env = os.environ.copy()
        self.env["GIT_OPTIONAL_LOCKS"] = "0"
        for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_LITERAL_PATHSPECS", "GIT_GLOB_PATHSPECS", "GIT_NOGLOB_PATHSPECS", "GIT_ICASE_PATHSPECS"):
            self.env.pop(key, None)

    def run(self, *args: str, data: bytes | None = None, allowed: tuple[int, ...] = (0,)) -> bytes:
        literal_paths = ["--literal-pathspecs"] if args[0] in {"add", "diff", "diff-tree", "restore"} else []
        result = subprocess.run(
            ["git", "--no-pager", *literal_paths, "-c", "core.quotepath=false", "-c", "color.ui=false", *args],
            cwd=self.root, env=self.env, input=data, capture_output=True, check=False,
        )
        if result.returncode not in allowed:
            message = (result.stderr or result.stdout).decode("utf-8", errors="replace").strip()
            raise CommitError(f"git {args[0]}: {message or f'код ошибки {result.returncode}'}")
        return result.stdout

    def text(self, *args: str) -> str:
        return self.run(*args).decode("utf-8", errors="replace").strip()

    def status(self) -> dict[str, str]:
        records = iter(self.run("status", "--porcelain=v1", "-z", "--untracked-files=all").split(b"\0"))
        result = {}
        for record in records:
            if not record:
                continue
            code = record[:2].decode("ascii")
            result[record[3:].decode("utf-8")] = code
            if "R" in code or "C" in code:
                next(records)
        return result


def nul_paths(paths: list[str]) -> bytes:
    return b"".join(name.encode("utf-8") + b"\0" for name in paths)


def clean_index(git: Git) -> None:
    if git.run("diff", "--cached", "--name-only", "-z") or git.run("ls-files", "--unmerged", "-z"):
        raise CommitError("В Git-клоне уже есть staged-файлы или конфликт. Сначала завершите их отдельно; индекс не изменён.")


def validate(source: Path, git: Git) -> str:
    if source == git.root or source.is_relative_to(git.root) or git.root.is_relative_to(source):
        raise CommitError("Рабочая папка и Git-клон должны быть разными, невложенными каталогами.")
    if not (source / "Portal_robot").is_dir() or not (source / "visu/package.json").is_file():
        raise CommitError("В исходной папке не найдены Portal_robot и visu/package.json.")
    if Path(git.text("rev-parse", "--show-toplevel")).resolve() != git.root:
        raise CommitError("Указан не корень Git-клона.")
    origin = git.text("remote", "get-url", "origin").rstrip("/").removesuffix(".git")
    if origin not in {"https://github.com/HappyOu-cmd/PortalRobot", "git@github.com:HappyOu-cmd/PortalRobot"}:
        raise CommitError("origin не соответствует репозиторию HappyOu-cmd/PortalRobot.")
    git.text("symbolic-ref", "--quiet", "--short", "HEAD")
    for marker in ("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"):
        if Path(git.text("rev-parse", "--path-format=absolute", "--git-path", marker)).exists():
            raise CommitError("В клоне не завершены merge/rebase/cherry-pick/revert. Сначала завершите текущую операцию.")
    clean_index(git)
    return git.text("rev-parse", "HEAD")


def source_files(source: Path, include_codesys: bool) -> set[str]:
    result = {name for name in FILES | {"Portal_robot.project"} if managed(name, include_codesys) and inside(source, name).is_file()}
    for tree in TREES:
        root = inside(source, tree)
        if not root.exists():
            continue
        for folder, directories, files in os.walk(root, followlinks=False):
            directories[:] = [name for name in directories if name.lower() not in EXCLUDED_DIRS and not (Path(folder) / name).is_symlink()
                              and (Path(folder) / name).resolve().is_relative_to(source)]
            if Path(folder).relative_to(source).as_posix() == "visu/gateway":
                directories[:] = [name for name in directories if name.lower() != "data"]
            for filename in files:
                name = (Path(folder) / filename).relative_to(source).as_posix()
                if managed(name, include_codesys):
                    inside(source, name)
                    result.add(name)
    return result


def digest(data: bytes | None) -> str | None:
    return hashlib.sha256(data).hexdigest() if data is not None else None


def equivalent(name: str, first: bytes, second: bytes) -> bool:
    if first == second:
        return True
    text = PurePosixPath(name).suffix.lower() in TEXT_SUFFIXES or PurePosixPath(name).name in {".gitignore", ".gitattributes"}
    return text and first.replace(b"\r\n", b"\n") == second.replace(b"\r\n", b"\n")


@dataclass(frozen=True)
class Change:
    name: str
    action: str
    source_hash: str | None
    destination_hash: str | None


def plan(source: Path, git: Git, *, include_codesys: bool = False, prefixes: list[str] | None = None, deletions: list[str] | None = None) -> list[Change]:
    status = git.status()
    candidates = source_files(source, include_codesys)
    if prefixes:
        prefixes = [relative_path(name).rstrip("/") for name in prefixes]
        candidates = {name for name in candidates if any(name == prefix or name.startswith(prefix + "/") for prefix in prefixes)}
    if candidates:
        ignored = git.run("check-ignore", "--stdin", "-z", data=nul_paths(sorted(candidates)), allowed=(0, 1))
        candidates.difference_update(name.decode("utf-8") for name in ignored.split(b"\0") if name)
    changes = []
    for name in sorted(candidates):
        destination = inside(git.root, name)
        current = destination.read_bytes() if destination.exists() else None
        desired = inside(source, name).read_bytes()
        same = current is not None and equivalent(name, desired, current)
        if same and name not in status:
            continue
        if name in status and not same:
            raise CommitError(f"В клоне есть другая незакоммиченная правка: {name}. Файл не перезаписан.")
        changes.append(Change(name, "M" if current is not None else "A", digest(desired), digest(current)))
    tracked = {name.decode("utf-8") for name in git.run("ls-files", "-z").split(b"\0") if name}
    for value in sorted(set(deletions or [])):
        name = relative_path(value)
        if not managed(name, include_codesys) or name not in tracked or inside(source, name).exists():
            raise CommitError(f"Удаление разрешено только для отслеживаемого допустимого файла, уже отсутствующего в исходниках: {name}")
        destination = inside(git.root, name)
        if name in status and status[name] != " D":
            raise CommitError(f"Удаляемый файл имеет незакоммиченные правки: {name}")
        changes.append(Change(name, "D", None, digest(destination.read_bytes() if destination.exists() else None)))
    return sorted(changes, key=lambda change: change.name)


def select(changes: list[Change], value: str) -> list[Change]:
    if value.strip().lower() in ("", "all", "все"):
        return changes
    if value.strip().lower() in ("q", "нет", "отмена"):
        return []
    numbers = set()
    for part in value.replace(",", " ").split():
        if not re.fullmatch(r"\d+(?:-\d+)?", part):
            raise CommitError("Выберите номера через запятую, диапазон 1-3, all или q.")
        bounds = [int(number) for number in part.split("-")]
        start, end = bounds[0], bounds[-1]
        if start < 1 or end < start or end > len(changes):
            raise CommitError("Номер файла вне списка.")
        numbers.update(range(start - 1, end))
    return [changes[number] for number in sorted(numbers)]


def preview_diff(source: Path, git: Git, changes: list[Change]) -> None:
    for change in changes:
        before = str(inside(git.root, change.name)) if change.destination_hash is not None else os.devnull
        after = str(inside(source, change.name)) if change.source_hash is not None else os.devnull
        print(git.run("diff", "--no-index", "--", before, after, allowed=(0, 1)).decode("utf-8", errors="replace"), end="")


def commit(source: Path, git: Git, changes: list[Change], head: str, title: str, details: str = "", *, verbose: bool = True) -> str:
    if not TITLE.fullmatch(title):
        raise CommitError("Заголовок должен иметь вид fix(hmi): описание; типы: fix, feat, refactor, docs, test, chore.")
    clean_index(git)
    if git.text("rev-parse", "HEAD") != head:
        raise CommitError("HEAD изменился после просмотра. Запустите скрипт повторно.")
    git.text("var", "GIT_AUTHOR_IDENT")
    payloads = {}
    for change in changes:
        destination = inside(git.root, change.name)
        current = destination.read_bytes() if destination.exists() else None
        source_file = inside(source, change.name)
        desired = source_file.read_bytes() if source_file.exists() else None
        if digest(current) != change.destination_hash or digest(desired) != change.source_hash:
            raise CommitError(f"Файл изменился после просмотра: {change.name}. Ничего не скопировано.")
        payloads[change.name] = desired
    for change in changes:
        destination = inside(git.root, change.name)
        if change.action == "D":
            destination.unlink(missing_ok=True)
        elif change.source_hash != change.destination_hash:
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=".portal-commit-", delete=False) as temporary:
                temporary_path = Path(temporary.name)
                temporary.write(payloads[change.name])
            try:
                os.replace(temporary_path, destination)
            finally:
                temporary_path.unlink(missing_ok=True)
    names = [change.name for change in changes]
    git.run("add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul", data=nul_paths(names))
    staged = {name.decode("utf-8") for name in git.run("diff", "--cached", "--name-only", "--no-renames", "-z").split(b"\0") if name}
    if not staged:
        print("Git не обнаружил содержательных изменений. Коммит не нужен.")
        return head
    if not staged.issubset(names) or git.text("rev-parse", "HEAD") != head:
        raise CommitError("Во время синхронизации изменился HEAD или состав индекса. Коммит остановлен.")
    status_report = git.text("status", "--short", "--branch")
    diff_report = git.text("diff", "--cached", "--stat")
    if verbose:
        print(status_report)
        print(diff_report)
    whitespace = git.run("config", "--get", "core.whitespace", allowed=(0, 1)).decode("utf-8").strip()
    whitespace = whitespace or "blank-at-eol,blank-at-eof,space-before-tab"
    git.run("-c", f"core.whitespace={whitespace},cr-at-eol", "diff", "--cached", "--check")
    body = f"{title}\n\n{details or 'Результат: ' + title.split(': ', 1)[1]}\n\nПроверки скрипта: git diff --cached --check.\nТесты, сборки, CODESYS и оборудование скриптом не проверялись.\n"
    with tempfile.TemporaryDirectory(prefix="portal-commit-message-") as folder:
        message = Path(folder) / "message.txt"
        message.write_text(body, encoding="utf-8")
        result = git.text("commit", "--file", str(message))
        if verbose:
            print(result)
    return git.text("rev-parse", "HEAD")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Синхронизация исходников Portal Robot и локальный коммит без AI и push.")
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parent.parent, help="Рабочая папка CODESYS")
    parser.add_argument("--repo", type=Path, help="Git-клон (по умолчанию соседняя папка PortalRobot-GitHub)")
    parser.add_argument("-m", "--message", help="Заголовок type(scope): описание")
    parser.add_argument("--details", default="", help="Причина, итоговое поведение и ранее выполненные проверки для тела коммита")
    parser.add_argument("--path", action="append", help="Выбрать файл/папку; можно повторять")
    parser.add_argument("--delete", action="append", help="Явно удалить из клона отсутствующий в исходниках файл; можно повторять")
    parser.add_argument("--include-codesys", action="store_true", help="Также копировать .project и XML-экспорты побайтово")
    parser.add_argument("--dry-run", action="store_true", help="Только показать список, без копирования, staging и коммита")
    parser.add_argument("--yes", action="store_true", help="Создать коммит без вопросов; требует -m")
    args = parser.parse_args(argv)
    try:
        if not shutil.which("git"):
            raise CommitError("Git не найден в PATH.")
        if args.yes and not args.message:
            raise CommitError("Для --yes задайте заголовок через -m.")
        source = args.source.resolve(strict=True)
        git = Git((args.repo or source.parent / "PortalRobot-GitHub").resolve(strict=True))
        head = validate(source, git)
        changes = plan(source, git, include_codesys=args.include_codesys, prefixes=args.path, deletions=args.delete)
        print(f"Git-клон: {git.root}\nВетка: {git.text('symbolic-ref', '--short', 'HEAD')}; файлов: {len(changes)}")
        if args.dry_run or not args.yes:
            for number, change in enumerate(changes, 1):
                print(f"{number:3}. {change.action} {change.name}")
        if not changes:
            print("Допустимых изменений нет. Отсутствующие в исходниках файлы автоматически не удаляются.")
            return 0
        if args.dry_run:
            print(f"Предпросмотр: {len(changes)} файлов. Рабочие файлы, индекс и HEAD не изменены.")
            return 0
        if not args.yes:
            changes = select(changes, input("Файлы одной задачи: Enter = все; номера 1,3-5; q = отмена: "))
            if not changes:
                return 0
        title = args.message or input("Заголовок (например fix(hmi): сбрасывать сообщение после восстановления связи): ").strip()
        if not TITLE.fullmatch(title):
            raise CommitError("Нужен заголовок type(scope): описание, например fix(hmi): восстановить индикацию связи.")
        if not args.yes:
            while True:
                answer = input(f"Скопировать {len(changes)} файлов и создать «{title}»? y = коммит, d = diff, Enter = отмена: ").strip().lower()
                if answer == "d":
                    preview_diff(source, git, changes)
                elif answer in ("y", "yes", "д", "да"):
                    break
                else:
                    print("Отмена. Файлы и индекс не изменены.")
                    return 0
        sha = commit(source, git, changes, head, title, args.details, verbose=not args.yes)
        print(f"Локальный HEAD: {sha}\nPush не выполнялся. Версии и теги не изменялись.")
        return 0
    except (CommitError, OSError, EOFError, KeyboardInterrupt) as error:
        print(f"\nОстановлено: {error}\nЕсли ошибка возникла после копирования, проверьте status и индекс в Git-клоне; автоматического отката нет.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
