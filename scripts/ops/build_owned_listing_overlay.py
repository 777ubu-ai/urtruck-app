"""Пакет четырёх файлов, привязанный к полному проверенному дереву Git."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

from owned_listing_production_overlay import release_manifests
from runtime_release_manifest import runtime_inventory


def build(root, target, source_sha):
    manifest = json.loads((root / 'ops/owned-listing-production/manifest.json').read_text())
    expected = {**manifest['baseline_files'], **manifest['files']}
    actual = {name: hashlib.sha256((root / 'backend' / name).read_bytes()).hexdigest()
              for name in runtime_inventory(root / 'backend')}
    if actual != expected:
        raise ValueError('owned_checkout_runtime_drift')
    for name, checksum in expected.items():
        value = subprocess.check_output(['git', 'show', source_sha + ':backend/' + name], cwd=root)
        if hashlib.sha256(value).hexdigest() != checksum:
            raise ValueError('owned_source_commit_mismatch')
    manifest['candidate_manifest'] = {'schema': 1, 'environment': 'production',
                                      'source_sha': source_sha, 'files': expected}
    release_manifests(manifest, source_sha)
    with tarfile.open(target, 'w:gz') as archive:
        for name in sorted(manifest['files']):
            archive.add(root / 'backend' / name, arcname=name, recursive=False)
        content = json.dumps(manifest, ensure_ascii=False, indent=2).encode()
        member = tarfile.TarInfo('manifest.json')
        member.size = len(content)
        member.mode = 0o600
        archive.addfile(member, io.BytesIO(content))
    return hashlib.sha256(target.read_bytes()).hexdigest()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--source-sha', required=True)
    arguments = parser.parse_args()
    print(build(arguments.root.resolve(), arguments.output, arguments.source_sha))
