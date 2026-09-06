"""AC1B: cross-domain SQL write guard.

Import boundaries (test_module_boundaries.py) do not catch the highest-value
violation class found by the 2026-09-05/06 independent architecture audits:
a file in one domain issuing raw SQL writes directly against another
domain's tables (e.g. api/chat.py writing `UPDATE deals ...`). A full SQL
parser is disproportionate for this codebase's query style (hand-written
strings passed to sqlite3 `.execute()`), so this guard does targeted AST
extraction: find `<conn>.execute(...)` / `.executemany(...)` calls whose
first argument is a literal string (or an f-string whose leading literal
segment is static — the common `f"UPDATE {table} SET ..."` shape is *not*
flagged here because the table name itself is dynamic, not because the verb
is), and check the SQL verb's target table against a forbidden set per file.

Only WRITES are checked (INSERT INTO / UPDATE / DELETE FROM). SELECTs are
explicitly not architecture violations — reading across a domain boundary
is a normal, already-accepted pattern in this codebase (e.g. Chat reads
`deals` to render room context) and is out of scope for this guard.

Escape hatch: `# ARCH-ALLOW: <reason>` on the same source line, mirroring
test_module_boundaries.py. Every allowlisted line here is enumerated in
docs/architecture/urtruck-v2/LEGACY-ADAPTERS-20260907.md (AC5).
"""
import ast
import re
from pathlib import Path

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[2]
ALLOW_MARKER = "ARCH-ALLOW:"

WRITE_RE = re.compile(
    r"(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([A-Za-z_][A-Za-z0-9_]*)",
    re.IGNORECASE,
)

# file (relative to backend/) -> set of tables it must never write directly.
# Built from the explicit ownership rules in the AC1B mission spec, applied
# to where each domain's mutation code ACTUALLY lives today (legacy files
# included — the point of this guard is to stop legacy/foreign domains from
# reaching into another domain's tables, not just to police modules/).
FORBIDDEN_WRITES = {
    "api/chat.py": {"deals", "bids", "deal_tracking", "deal_locations"},
    "api/notifications.py": {"deals", "bids", "deal_tracking", "deal_locations"},
    "services/push_gateway.py": {"deals", "bids", "chat_rooms", "chat_messages"},
    "services/push_sender.py": {"deals", "bids", "chat_rooms", "chat_messages"},
    "infrastructure/outbox/deals_handlers.py": {"chat_rooms", "chat_messages"},
    "infrastructure/outbox/worker.py": {"deals", "bids", "chat_rooms", "chat_messages"},
}

# Any file under these module roots, once populated, must never write `bids`
# (Tracking must not write Bids) or `deals`/`chat_rooms`/`chat_messages`
# (Chat/Push rules extended to their module homes, not just their legacy
# files) — checked by prefix rather than an exact path list so future files
# added under these roots are covered automatically.
FORBIDDEN_WRITES_BY_PREFIX = [
    ("modules/tracking/", {"bids"}),
    ("modules/chat/", {"deals", "bids", "deal_tracking", "deal_locations"}),
    ("modules/notifications/", {"deals", "bids", "deal_tracking", "deal_locations"}),
]


def _forbidden_for(rel_path: str) -> set:
    forbidden = set(FORBIDDEN_WRITES.get(rel_path, set()))
    for prefix, tables in FORBIDDEN_WRITES_BY_PREFIX:
        if rel_path.startswith(prefix):
            forbidden |= tables
    return forbidden


def _leading_literal(node: ast.AST) -> str | None:
    """Extract the leading static text of a string literal or an f-string's
    first constant segment (enough to see `INSERT INTO deals` even if later
    parts of the query are parameterized)."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr) and node.values:
        first = node.values[0]
        if isinstance(first, ast.Constant) and isinstance(first.value, str):
            return first.value
    return None


def _is_execute_call(node: ast.Call) -> bool:
    if not isinstance(node.func, ast.Attribute):
        return False
    return node.func.attr in ("execute", "executemany")


def check_execute_call(node: ast.Call) -> str | None:
    """Return the forbidden-write's table name if this .execute() call is a
    literal INSERT/UPDATE/DELETE, else None. Pure function, unit-tested
    directly below."""
    if not _is_execute_call(node) or not node.args:
        return None
    literal = _leading_literal(node.args[0])
    if literal is None:
        return None
    match = WRITE_RE.search(literal)
    if not match:
        return None
    return match.group(1).lower()


def _iter_target_files():
    for rel_path in list(FORBIDDEN_WRITES):
        p = BACKEND_ROOT / rel_path
        if p.is_file():
            yield rel_path, p
    for prefix, _tables in FORBIDDEN_WRITES_BY_PREFIX:
        root = BACKEND_ROOT / prefix
        if not root.is_dir():
            continue
        for p in root.glob("**/*.py"):
            if "/tests/" in str(p):
                continue
            rel = str(p.relative_to(BACKEND_ROOT))
            yield rel, p


def _allow_marker_reason(source_lines: list, lineno: int, lookback: int = 6) -> str | None:
    """The marker may sit on the .execute(...) line itself, or on a comment
    line directly above a multi-line call — both are idiomatic in this
    codebase. Search a small backward window, not just the exact line."""
    for idx in range(lineno - 1, max(-1, lineno - 1 - lookback), -1):
        if 0 <= idx < len(source_lines) and ALLOW_MARKER in source_lines[idx]:
            return source_lines[idx].split(ALLOW_MARKER, 1)[1].strip()
    return None


def test_no_undocumented_cross_domain_writes():
    violations: list = []
    allow_lines_without_reason: list = []
    seen_files = set()
    for rel_path, path in _iter_target_files():
        if rel_path in seen_files:
            continue
        seen_files.add(rel_path)
        forbidden = _forbidden_for(rel_path)
        if not forbidden:
            continue
        text = path.read_text()
        lines = text.splitlines()
        try:
            tree = ast.parse(text, filename=str(path))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            table = check_execute_call(node)
            if table is None or table not in forbidden:
                continue
            lineno = getattr(node, "lineno", 0)
            reason = _allow_marker_reason(lines, lineno)
            if reason is not None:
                if not reason:
                    allow_lines_without_reason.append(f"{rel_path}:{lineno}")
                continue
            violations.append(f"{rel_path}:{lineno}: writes `{table}` (forbidden for this file)")
    assert not allow_lines_without_reason, (
        "ARCH-ALLOW markers must carry a non-empty reason:\n"
        + "\n".join(allow_lines_without_reason)
    )
    assert not violations, "Undocumented cross-domain writes:\n" + "\n".join(violations)


# ─── pure-function fixtures ───

@pytest.mark.parametrize(
    "source, expected_table",
    [
        ('c.execute("UPDATE deals SET chat_room_id = ? WHERE id = ?", (a, b))', "deals"),
        ('c.execute("INSERT INTO bids(id, amount) VALUES (?,?)", (a, b))', "bids"),
        ('conn.execute("DELETE FROM deal_locations WHERE deal_id = ?", (x,))', "deal_locations"),
        ('c.execute(f"UPDATE deal_tracking SET status=? WHERE deal_id=?", (s, d))', "deal_tracking"),
    ],
)
def test_execute_write_is_detected(source, expected_table):
    node = ast.parse(source).body[0].value
    assert check_execute_call(node) == expected_table


@pytest.mark.parametrize(
    "source",
    [
        'c.execute("SELECT * FROM deals WHERE id = ?", (a,))',  # read, not a violation class
        'c.execute("UPDATE chat_rooms SET last_message = ? WHERE id = ?", (a, b))',  # own table
        'requests.execute(payload)',  # not a DB call at all
        'c.execute(dynamic_sql, params)',  # non-literal, cannot be statically checked — not flagged
    ],
)
def test_non_forbidden_calls_are_not_flagged(source):
    node = ast.parse(source).body[0].value
    table = check_execute_call(node)
    assert table in (None, "chat_rooms")  # chat_rooms write is allowed for a Chat file
