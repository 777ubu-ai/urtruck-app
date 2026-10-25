#!/usr/bin/env bash
# Свежий JSON по QA2; удалённые файлы и рабочие сервисы не меняются.
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ssh -T -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes \
  -o IdentitiesOnly=yes -i "${URTRUCK_SSH_KEY:-$HOME/.ssh/urtruck}" \
  "${URTRUCK_SSH_USER:-ubuntu}@${URTRUCK_SSH_HOST:-185.22.65.11}" \
  'python3 -' < "$script_dir/external_feed_status.py"
