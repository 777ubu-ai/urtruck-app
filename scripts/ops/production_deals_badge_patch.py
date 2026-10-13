"""Подготовить два точечных production SQL-патча; не развёртывает и не меняет БД."""
from __future__ import annotations
import argparse
import ast
import hashlib
import json
from pathlib import Path

EXPECTED_SHA256 = {
    "api/notifications.py": "235871e8dc7ba05d4f43b7e5deb9b52f96bc13ce7797edaa8a37050f6f7ee084",
    "services/push_sender.py": "3c54b90793e5f8fde0616e51e838b82f3383c516a43a80b650a2b5c16ffb084d",
}
OLD_FILTER = "AND type NOT IN ('chat_message', 'chat_attachment')"

def notification_types(source: str) -> tuple[str, ...]:
    tree = ast.parse(source)
    assignments = [n for n in tree.body if isinstance(n, ast.Assign)
                   and any(isinstance(t, ast.Name) and t.id == "DEAL_NOTIFICATION_TYPES" for t in n.targets)]
    if len(assignments) != 1:
        raise ValueError("Ambiguous canonical notification types")
    value = ast.literal_eval(assignments[0].value)
    if not isinstance(value, set) or not value or not all(isinstance(v, str) and v.isidentifier() for v in value):
        raise ValueError("Unsafe notification types")
    return tuple(sorted(value))

def transform(source: str, types: tuple[str, ...]) -> str:
    if not types or not all(t.isidentifier() for t in types):
        raise ValueError("Unsafe SQL notification types")
    if source.count(OLD_FILTER) != 1:
        raise ValueError("Unexpected count-query shape")
    replacement = "AND type IN (" + ", ".join("'" + t + "'" for t in types) + ")"
    result = source.replace(OLD_FILTER, replacement)
    ast.parse(result)
    return result

def prepare(source_dir: Path, output_dir: Path) -> dict:
    if source_dir.resolve() == output_dir.resolve() or output_dir.exists():
        raise ValueError("A new isolated output directory is required")
    originals = {name: (source_dir / name).read_bytes() for name in EXPECTED_SHA256}
    for name, data in originals.items():
        if hashlib.sha256(data).hexdigest() != EXPECTED_SHA256[name]:
            raise ValueError("Production baseline changed: " + name)
    types = notification_types(originals["api/notifications.py"].decode())
    results = {name: transform(data.decode(), types).encode() for name, data in originals.items()}
    # Validate the whole pair before creating any output.
    output_dir.mkdir(parents=True)
    for name, data in results.items():
        target = output_dir / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    manifest = {"before": EXPECTED_SHA256, "after": {n: hashlib.sha256(d).hexdigest() for n, d in results.items()},
                "allowed_types": types, "scope": "Two SQL filters only; no DB, environment, dependency or provider changes"}
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare(args.source_dir, args.output_dir)))
