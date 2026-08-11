#!/usr/bin/env bash
# Прогон всей client button-hunt сюиты с clean-state перед каждым флоу
# (обход сломанного dev-логаута: см. дефект reset→OnboardingV2).
set -u
cd "$(dirname "$0")/screenshots"

# This is the privileged key for the local QA actor endpoint. It must be
# injected by the CI secret store or the operator's shell; keeping it here
# previously exposed a reusable credential in Git history.
: "${MAESTRO_QA_AGENT_TOKEN:?MAESTRO_QA_AGENT_TOKEN must be supplied from a secret store; do not hardcode it}"
export MAESTRO_QA_AGENT_TOKEN
export MAESTRO_BACKEND_BASE="http://127.0.0.1:8001/api/v1"
export MAESTRO_ACTOR=boris

FLOWS=(
  client-tabhunt
  client-feedhunt
  client-cargodetail
  client-tripdetail
  client-myworkhunt
  client-createcargo
  client-profilehunt
  client-stress
)

RESULTS=/tmp/clienthunt_results.txt
: > "$RESULTS"
for f in "${FLOWS[@]}"; do
  echo "================ $f ================"
  bash ../_lib/clean-state.sh >/dev/null 2>&1
  sleep 1
  OUT=$(maestro test "../$f.yaml" 2>&1 | grep -vE "WARNING:|picocli|final field|Mutating")
  echo "$OUT" | tail -50
  if echo "$OUT" | grep -qE "Flow Passed|✅"; then
    # maestro prints summary; detect failure lines
    if echo "$OUT" | grep -qiE "FAILED|Element not found|Assertion is false"; then
      echo "$f: FAIL" >> "$RESULTS"
    else
      echo "$f: PASS" >> "$RESULTS"
    fi
  elif echo "$OUT" | grep -qiE "FAILED|Element not found|Assertion is false"; then
    echo "$f: FAIL" >> "$RESULTS"
  else
    echo "$f: PASS" >> "$RESULTS"
  fi
done
echo "======== ИТОГ ========"
cat "$RESULTS"
echo "DONE_CLIENTHUNT"
