"""Read-only подготовка точечного production patch границ чтения.

Не пишет в runtime и не перезапускает API. По умолчанию выводит только hashes.
--output-dir сохраняет приватный review-кандидат вне исходного root.
Применение требует отдельного разрешения по ночному ТЗ, разделы 2 и 14.
"""
import argparse
import ast
import difflib
import hashlib
import json
from pathlib import Path

EXPECTED = {
    "api/chat.py": "80619b090b46559587ceb6d3722c1cd308cbd44345d24e4748f7e1fe6ecef080",
    "api/notifications.py": "235871e8dc7ba05d4f43b7e5deb9b52f96bc13ce7797edaa8a37050f6f7ee084",
}

def _function(source, name):
    return next(node for node in ast.parse(source).body
                if isinstance(node, ast.FunctionDef) and node.name == name)

def _replace_statement(source, node, replacement):
    lines = source.splitlines(keepends=True)
    indent = " " * node.col_offset
    lines[node.lineno-1:node.end_lineno] = [
        indent + line + "\n" if line else "\n" for line in replacement.splitlines()
    ]
    return "".join(lines)

def _patch_chat(source):
    fn = _function(source, "get_messages")
    updates = [node for node in ast.walk(fn) if isinstance(node, ast.Expr)
               and isinstance(node.value, ast.Call) and node.value.args
               and isinstance(node.value.args[0], ast.Constant)
               and node.value.args[0].value == "UPDATE chat_messages SET is_read = 1 WHERE room_id = ? AND sender_id != ? AND is_read = 0"]
    if len(updates) != 1:
        raise ValueError("Не найдена единственная ожидаемая read-marking SQL")
    source = _replace_statement(source, updates[0], '''message_read_through = max((int(row["id"]) for row in rows), default=0)
if message_read_through:
    c.execute(
        "UPDATE chat_messages SET is_read = 1 WHERE room_id = ? AND sender_id != ? "
        "AND is_read = 0 AND id <= ?",
        (room_id, uid, message_read_through),
    )''')
    fn = _function(source, "get_messages")
    row_assigns = [node for node in ast.walk(fn) if isinstance(node, ast.Assign)
                   and any(isinstance(target, ast.Name) and target.id == "rows" for target in node.targets)]
    if len(row_assigns) != 1:
        raise ValueError("Не найдена единственная страница истории")
    node = row_assigns[0]
    lines = source.splitlines(keepends=True)
    indent = " " * node.col_offset
    insert = '''notification_read_through = c.execute(
    "SELECT COALESCE(MAX(id), 0) AS id FROM notifications WHERE user_id = ?",
    (uid,),
).fetchone()["id"]'''
    lines[node.lineno-1:node.lineno-1] = [indent + line + "\n" for line in insert.splitlines()]
    source = "".join(lines)
    fn = _function(source, "get_messages")
    marks = [node for node in ast.walk(fn) if isinstance(node, ast.Expr)
             and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name)
             and node.value.func.id == "mark_notifications_read_by_urls"]
    if len(marks) != 1:
        raise ValueError("Не найден единственный Bell read-marking")
    original_call = ast.get_source_segment(source, marks[0].value)
    if not original_call or marks[0].value.keywords:
        raise ValueError("Неожиданный контракт Bell read-marking")
    return _replace_statement(source, marks[0], '''if message_read_through:
    mark_notifications_read_by_urls(
        uid, [f"/chats/{room_id}"],
        read_through_id=notification_read_through,
        chat_message_read_through=message_read_through,
    )''')

def build_plan(root, notification_function):
    old = {}
    for name, expected in EXPECTED.items():
        raw = (root / name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError("Source guard mismatch: " + name)
        old[name] = raw.decode("utf-8")
    new = {"api/chat.py": _patch_chat(old["api/chat.py"])}
    name = "api/notifications.py"
    node = _function(old[name], "mark_notifications_read_by_urls")
    # Зависим от двух стабильных функций; tuple не требует нового global в
    # legacy runtime, где имя константы chat types может отличаться.
    replacement = notification_function.replace("in _CHAT_NOTIFICATION_TYPES", 'in ("chat_message", "chat_attachment")')
    new[name] = _replace_statement(old[name], node, replacement)
    for name, source in new.items():
        compile(source, name, "exec")
        changed = "get_messages" if name == "api/chat.py" else "mark_notifications_read_by_urls"
        before = {n.name: ast.dump(n, include_attributes=False) for n in ast.parse(old[name]).body
                  if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name != changed}
        after = {n.name: ast.dump(n, include_attributes=False) for n in ast.parse(source).body
                 if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name != changed}
        if before != after:
            raise ValueError("Protected functions changed: " + name)
    return old, new

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    source_root = args.root.resolve()
    # Шаблон helper — проверенный код этой ветки, не загружаемый executable.
    repo_backend = Path(__file__).resolve().parents[2] / "backend"
    template = _function((repo_backend / "api/notifications.py").read_text(), "mark_notifications_read_by_urls")
    template_source = ast.get_source_segment((repo_backend / "api/notifications.py").read_text(), template)
    old, new = build_plan(source_root, template_source)
    plan = {"mode": "read-only", "restart_performed": False, "production_written": False,
            "files": {name: {"before": EXPECTED[name], "after": hashlib.sha256(source.encode()).hexdigest()}
                      for name, source in new.items()}}
    if args.output_dir:
        destination = args.output_dir.resolve()
        if destination == source_root or source_root in destination.parents:
            raise ValueError("Кандидат нельзя сохранять внутри source runtime")
        # Не следовать symlink из review-папки в исходники или наружу.
        for name in [*new, "read-boundaries.diff", "manifest.json"]:
            resolved = (destination / name).resolve()
            if destination not in resolved.parents or source_root in resolved.parents:
                raise ValueError("Review output path выходит из приватной папки")
        destination.mkdir(mode=0o700, parents=True, exist_ok=True)
        destination.chmod(0o700)
        for name, source in new.items():
            target = destination / name
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            target.write_text(source); target.chmod(0o600)
        diff = destination / "read-boundaries.diff"
        diff.write_text("".join("".join(difflib.unified_diff(old[name].splitlines(True), new[name].splitlines(True),
            fromfile=name, tofile=name)) for name in new))
        diff.chmod(0o600)
        manifest = destination / "manifest.json"
        manifest.write_text(json.dumps(plan, indent=2) + "\n"); manifest.chmod(0o600)
    print(json.dumps(plan, indent=2))

if __name__ == "__main__":
    main()
