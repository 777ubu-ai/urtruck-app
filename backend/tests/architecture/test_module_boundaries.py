"""Architecture guard: domain modules expose contracts, not internals."""
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2] / "modules"
FORBIDDEN = re.compile(r"backend\.modules\.(\w+)\.(domain|infrastructure)")


def test_cross_module_internal_imports_are_forbidden():
    violations: list[str] = []
    for source in ROOT.glob("**/*.py"):
        owner = source.relative_to(ROOT).parts[0]
        for line_no, line in enumerate(source.read_text().splitlines(), 1):
            match = FORBIDDEN.search(line)
            if match and match.group(1) != owner:
                violations.append(f"{source}:{line_no}: {line.strip()}")
    assert not violations, "Forbidden cross-module internal imports:\n" + "\n".join(violations)


def test_all_domains_have_public_contract():
    expected = {"auth", "users", "cargo", "trips", "bids", "deals", "chat", "translation", "notifications", "tracking", "documents", "borders"}
    actual = {path.parent.parent.name for path in ROOT.glob("*/application/public_contract.py")}
    assert actual == expected
