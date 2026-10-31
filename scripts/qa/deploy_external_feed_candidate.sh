#!/usr/bin/env bash
set -euo pipefail

: "${SERVER_HOST:?}" "${SERVER_USER:?}" "${SERVER_PASS:?}" "${SERVER_SSH_KNOWN_HOSTS:?}" "${QA2_API_URL:?}" "${QA_SOURCE_SHA:?}" "${GITHUB_RUN_ID:?}"
test "$QA2_API_URL" = "https://qa2.urtruck.kz"
[[ "$QA_SOURCE_SHA" =~ ^[0-9a-f]{40}$ && "$GITHUB_RUN_ID" =~ ^[0-9]+$ ]]
run_attempt="${GITHUB_RUN_ATTEMPT:-1}"
[[ "$run_attempt" =~ ^[0-9]+$ ]]

bundle_dir="$(mktemp -d)"
trap 'rm -rf "$bundle_dir"' EXIT
paths=(
  backend/scheduler/jobs.py
  backend/services/external_freight_classifier.py
  backend/services/external_freight_import_adapter.py
  backend/services/external_freight_queue_bridge.py
)
for path in "${paths[@]}"; do install -D -m 0644 "$path" "$bundle_dir/$path"; done
(
  cd "$bundle_dir"
  shasum -a 256 "${paths[@]}" > SHA256SUMS
  printf '%s\n' "$QA_SOURCE_SHA" > SOURCE_SHA
  tar -czf "$bundle_dir/feed-candidate.tar.gz" "${paths[@]}" SHA256SUMS SOURCE_SHA
)
bundle_sha="$(shasum -a 256 "$bundle_dir/feed-candidate.tar.gz" | awk '{print $1}')"
known_hosts="$bundle_dir/known_hosts"
printf '%s\n' "$SERVER_SSH_KNOWN_HOSTS" > "$known_hosts"
chmod 600 "$known_hosts"
export SSHPASS="$SERVER_PASS"
ssh_opts=(-o BatchMode=no -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$known_hosts" -o ServerAliveInterval=30 -o ServerAliveCountMax=10)
remote_tar="/tmp/urtruck-feed-candidate-${GITHUB_RUN_ID}-${run_attempt}.tar.gz"
sshpass -e scp "${ssh_opts[@]}" "$bundle_dir/feed-candidate.tar.gz" "$SERVER_USER@$SERVER_HOST:$remote_tar"
sshpass -e ssh "${ssh_opts[@]}" "$SERVER_USER@$SERVER_HOST" bash -s -- "$GITHUB_RUN_ID" "$run_attempt" "$QA_SOURCE_SHA" "$bundle_sha" "$remote_tar" <<'REMOTE'
set -euo pipefail
run_id="$1"; run_attempt="$2"; source_sha="$3"; bundle_sha="$4"; archive="$5"
qa=/home/ubuntu/urtruck-qa2
source_db=/home/ubuntu/urtruck-telegram-feed/state/feed.sqlite3
deploy_id="$run_id-$run_attempt"
stage="$qa/.feed-candidate-$deploy_id"
backup="$qa/backups/feed-candidate-$deploy_id"
lock="$qa/.feed-candidate-deploy.lock"
[[ "$run_id" =~ ^[0-9]+$ && "$run_attempt" =~ ^[0-9]+$ && "$source_sha" =~ ^[0-9a-f]{40}$ && "$bundle_sha" =~ ^[0-9a-f]{64}$ ]]
test "$archive" = "/tmp/urtruck-feed-candidate-$deploy_id.tar.gz"
test -d "$qa/backend" && test -f "$source_db"
test -f "$qa/external-feed-bridge.env" && test -f "$qa/external-feed-owned.env"
test -f "$qa/external-feed/adapter.sqlite3" && test -f "$qa/external-feed-owned/adapter.sqlite3"
test "$(sha256sum "$archive" | awk '{print $1}')" = "$bundle_sha"
mkdir -m 0700 "$stage" "$backup"
tar -xzf "$archive" -C "$stage"
rm -f -- "$archive"
cd "$stage"
sha256sum -c SHA256SUMS
test "$(cat SOURCE_SHA)" = "$source_sha"
python3 - "$qa/external-feed-bridge.env" "$qa/external-feed-owned.env" <<'PY'
from pathlib import Path
import sys
expected = (
    ('/home/ubuntu/urtruck-qa2/external-feed/adapter.sqlite3', 'incoming'),
    ('/home/ubuntu/urtruck-qa2/external-feed-owned/adapter.sqlite3', 'owned'),
)
for name, (adapter_db, mode) in zip(sys.argv[1:], expected):
    values = {}
    for line in Path(name).read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    if values.get('EXTERNAL_FREIGHT_API_URL') != 'https://qa2.urtruck.kz':
        raise SystemExit('feed_target_not_qa2')
    if values.get('EXTERNAL_FREIGHT_DEPLOYMENT_TARGET', 'qa2') != 'qa2':
        raise SystemExit('deployment_target_not_qa2')
    if values.get('EXTERNAL_FREIGHT_ADAPTER_DB') != adapter_db:
        raise SystemExit('unexpected_adapter_database')
    if values.get('EXTERNAL_FREIGHT_SOURCE_DB') != '/home/ubuntu/urtruck-telegram-feed/state/feed.sqlite3':
        raise SystemExit('unexpected_source_database')
    if values.get('EXTERNAL_FREIGHT_SOURCE_MODE', mode) != mode:
        raise SystemExit('unexpected_source_mode')
PY
units=(urtruck-qa2.service urtruck-qa2-feed-bridge.service urtruck-qa2-owned-feed-bridge.service)
for unit in "${units[@]}"; do systemctl cat "$unit" >/dev/null; done
sudo -n true
exec 9>"$lock"
flock -n 9

# Code backup and consistent online snapshots; database snapshots are never restored over newer live state.
for path in backend/scheduler/jobs.py backend/services/external_freight_classifier.py \
  backend/services/external_freight_import_adapter.py backend/services/external_freight_queue_bridge.py; do
  install -D -m 0600 "$qa/$path" "$backup/$path"
done
python3 - "$qa" "$source_db" "$backup" <<'PY'
import sqlite3, sys
from pathlib import Path
qa, source_db, backup = map(Path, sys.argv[1:])
for label, source in (
    ('incoming-adapter.sqlite3', qa/'external-feed/adapter.sqlite3'),
    ('owned-adapter.sqlite3', qa/'external-feed-owned/adapter.sqlite3'),
    ('source-feed.sqlite3', source_db),
):
    with sqlite3.connect(source.resolve().as_uri()+'?mode=ro', uri=True, timeout=10) as src:
        with sqlite3.connect(backup/label) as dst:
            src.backup(dst)
            if dst.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise SystemExit('sqlite_backup_integrity_failed')
    (backup/label).chmod(0o600)
PY
rollback() {
  set +e
  for path in backend/scheduler/jobs.py backend/services/external_freight_classifier.py \
    backend/services/external_freight_import_adapter.py backend/services/external_freight_queue_bridge.py; do
    install -D -m 0644 "$backup/$path" "$qa/$path"
  done
  sudo -n systemctl restart "${units[@]}"
}
trap 'code=$?; if test "$code" -ne 0; then rollback; fi; exit "$code"' EXIT
for path in backend/scheduler/jobs.py backend/services/external_freight_classifier.py \
  backend/services/external_freight_import_adapter.py backend/services/external_freight_queue_bridge.py; do
  install -D -m 0644 "$stage/$path" "$qa/$path"
done
python3 -m py_compile "$qa/backend/scheduler/jobs.py" "$qa/backend/services/external_freight_classifier.py" \
  "$qa/backend/services/external_freight_import_adapter.py" "$qa/backend/services/external_freight_queue_bridge.py"
sudo -n systemctl restart "${units[@]}"
for unit in "${units[@]}"; do systemctl is-active --quiet "$unit"; done
curl -fsS --max-time 20 http://127.0.0.1:8002/health >/dev/null
for entry in \
  "backend/scheduler/jobs.py:$qa/backend/scheduler/jobs.py" \
  "backend/services/external_freight_classifier.py:$qa/backend/services/external_freight_classifier.py" \
  "backend/services/external_freight_import_adapter.py:$qa/backend/services/external_freight_import_adapter.py" \
  "backend/services/external_freight_queue_bridge.py:$qa/backend/services/external_freight_queue_bridge.py"; do
  relative="${entry%%:*}"; installed="${entry#*:}"
  expected="$(awk -v f="$relative" '$2==f {print $1}' "$stage/SHA256SUMS")"
  test -n "$expected" && test "$(sha256sum "$installed" | awk '{print $1}')" = "$expected"
done
{
  printf 'source_sha=%s\ninstalled_at_utc=%s\n' "$source_sha" "$(date -u +%FT%TZ)"
  cat "$stage/SHA256SUMS"
} > "$qa/external-feed-component-manifest.tmp"
chmod 0600 "$qa/external-feed-component-manifest.tmp"
mv "$qa/external-feed-component-manifest.tmp" "$qa/external-feed-component-manifest"
echo "QA2_FEED_SOURCE_SHA=$source_sha"
echo "QA2_FEED_BACKUP=$backup"
echo "QA2_FEED_DEPLOY=verified"
REMOTE

echo "QA2_FEED_SOURCE_SHA=$QA_SOURCE_SHA"
