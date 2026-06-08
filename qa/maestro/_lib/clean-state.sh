#!/usr/bin/env bash
#
# clean-state.sh — wipe the UrTruck AsyncStorage on the booted simulator
# so the next Maestro flow boots into onboarding.
#
# Safe to run repeatedly. Does NOT touch Expo Go's "Recently opened"
# list (that lives in @exponent/home, which we explicitly skip).
#
# Usage:
#   qa/maestro/_lib/clean-state.sh
#
# Side effects:
#   - terminates host.exp.Exponent
#   - removes UrTruck-specific session keys from
#     ExponentExperienceData/@urtruck/urtruck/RCTAsyncLocalStorage
#
# Use between flows when switching QA actors (e.g. driver-auth → client-auth).
# Without this, the second flow inherits the first actor's session.

set -euo pipefail

DEVICE_ID="$(xcrun simctl list devices booted | grep -oE '\([0-9A-F-]{36}\)' | tr -d '()' | head -n1)"
if [[ -z "${DEVICE_ID}" ]]; then
  echo "clean-state: no booted simulator" >&2
  exit 2
fi

xcrun simctl terminate booted host.exp.Exponent >/dev/null 2>&1 || true

APP_ROOT="$HOME/Library/Developer/CoreSimulator/Devices/${DEVICE_ID}/data/Containers/Data/Application"

# Find every Expo Go container that hosts the UrTruck experience.
FOUND=0
while IFS= read -r MANIFEST; do
  [ -z "$MANIFEST" ] && continue
  FOUND=$((FOUND+1))
  # Rewrite manifest with our keys stripped. Keep ur_lang so language
  # preference doesn't get reset (it's harmless to QA flows).
  python3 - "$MANIFEST" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)
for k in ('ur_reg_token', 'ur_session', 'ur_verification_level',
          'ur_driver_vehicle', 'ur_client_company'):
    data.pop(k, None)
with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)
PY
  echo "clean-state: cleared ${MANIFEST}" >&2
done < <(find "${APP_ROOT}" -path '*ExponentExperienceData/@urtruck/urtruck/RCTAsyncLocalStorage/manifest.json' 2>/dev/null)

if [[ "${FOUND}" -eq 0 ]]; then
  echo "clean-state: no UrTruck AsyncStorage found (app may not have launched yet)" >&2
fi
