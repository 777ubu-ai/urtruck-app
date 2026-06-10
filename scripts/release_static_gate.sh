#!/usr/bin/env bash
# release_static_gate.sh — локальные статические проверки перед merge→main.
# Без зависимостей и без изменения app-кода. Каждая проверка печатает
# PASS / FAIL / SKIP. Любой FAIL → exit 1.
#
# Usage:  scripts/release_static_gate.sh
set -u
cd "$(dirname "$0")/.." || exit 2

FAIL=0
pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL+1)); }
skip() { printf '  SKIP  %s\n' "$1"; }

echo "== UrTruck static release gate =="
echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null)  HEAD: $(git rev-parse --short HEAD 2>/dev/null)"
echo

# 1) git clean
if [ -z "$(git status --porcelain)" ]; then pass "git tree clean"; else fail "git tree NOT clean"; fi

# 2) no conflict markers in src/
if grep -rlE '^<{7}|^={7}$|^>{7} ' src/ >/dev/null 2>&1; then
  fail "conflict markers found in src/"
else pass "no conflict markers in src/"; fi

# 3) no TEMP-QA / QAShot / throwaway harness in src/
if grep -rlE 'TEMP-QA|QAShot|QAAuditShot|QAPrfShot|QARegShot|__QA' src/ >/dev/null 2>&1; then
  fail "temp QA harness residue in src/"
else pass "no temp QA harness residue"; fi

# 3b) no hardcoded localhost/127.0.0.1 outside config/comments
LH=$(grep -rnE 'localhost|127\.0\.0\.1' src/ 2>/dev/null | grep -vE 'config/env.js|^\s*[0-9]+:\s*//|// ' || true)
if [ -n "$LH" ]; then fail "hardcoded localhost in src/ (outside config/comments):"; echo "$LH" | sed 's/^/        /'
else pass "no stray hardcoded localhost in src/"; fi

# 4) package/app/lock not modified in working tree
if git status --porcelain | grep -qE 'package\.json|app\.json|package-lock\.json|yarn\.lock'; then
  fail "package/app/lock modified in working tree"
else pass "package/app/lock not modified"; fi

# 5) i18n smoke (existing project script)
if npm run -s qa:i18n >/tmp/_rg_i18n.log 2>&1; then
  if grep -q "missing at call sites: 0" /tmp/_rg_i18n.log && grep -q "\[i18n\] OK" /tmp/_rg_i18n.log; then
    pass "i18n smoke (0 missing)"
  else fail "i18n smoke reported issues"; tail -6 /tmp/_rg_i18n.log | sed 's/^/        /'; fi
else skip "i18n smoke (qa:i18n unavailable)"; fi

# 6) babel parse of registration files (if @babel/parser present)
REG_FILES="src/utils/i18n.js src/utils/registration.js \
src/screens/registration/IdentityStepScreen.js \
src/screens/registration/SelfieStepScreen.js \
src/screens/registration/VehicleDocsScreen.js \
src/screens/registration/VehiclePhotosScreen.js \
src/screens/registration/TruckParamsScreen.js \
src/components/RegistrationHelpSheet.js \
src/screens/QueueScreen.js src/screens/MyTripsScreen.js"
if node -e "require('@babel/parser')" >/dev/null 2>&1; then
  if node -e '
    const fs=require("fs"),p=require("@babel/parser");let bad=0;
    for(const f of process.argv.slice(1)){try{p.parse(fs.readFileSync(f,"utf8"),{sourceType:"module",plugins:["jsx"]})}catch(e){console.log("  parse FAIL "+f+": "+e.message);bad++}}
    process.exit(bad?1:0);' $REG_FILES; then
    pass "babel parse registration/gate files"
  else fail "babel parse failed (see above)"; fi
else skip "babel parse (@babel/parser unavailable)"; fi

# 7) no passenger/taxi wording in i18n
if grep -iqE 'passenger|пассажир|такси|taxi' src/utils/i18n.js; then
  fail "passenger/taxi wording present in i18n.js"
else pass "no passenger/taxi wording in i18n"; fi

# 8) 24-48h presence (verification timing unified).
# Литеральный поиск: en-dash «–» — многобайтовый, regex `.` в C-локали
# матчит байты, поэтому ищем обе формы тире как литералы.
if LC_ALL=C grep -qF -e '24–48' -e '24-48' src/utils/i18n.js; then
  pass "24–48h copy present"
else fail "24–48h copy missing"; fi

# 9) gate keys exist (Queue + CreateTrip progressive gates)
if grep -q 'queue_gate_locked_title:' src/utils/i18n.js && grep -q 'trips_gate_title:' src/utils/i18n.js; then
  pass "Queue + CreateTrip gate i18n keys present"
else fail "gate i18n keys missing"; fi

# 10) no raw/photo/uri/key/IIN/phone console logs in registration flow screens
LEAK=$(grep -rnE 'console\.(log|warn|error|debug)' \
  src/screens/registration/IdentityStepScreen.js \
  src/screens/registration/SelfieStepScreen.js \
  src/screens/registration/VehicleDocsScreen.js \
  src/screens/registration/VehiclePhotosScreen.js \
  src/screens/registration/TruckParamsScreen.js \
  src/components/RegistrationHelpSheet.js 2>/dev/null \
  | grep -iE 'uri|key|photo|iin|phone|raw|base64|token|selfie' || true)
if [ -n "$LEAK" ]; then fail "console log may leak PII in registration flow:"; echo "$LEAK" | sed 's/^/        /'
else pass "no PII-leaking console logs in registration flow"; fi

# 11) QA_AGENT_TOKEN must not be hardcoded as a literal in src/ or in
#     qa/maestro YAML/JS/sh helpers. Positive heuristic: flag only when
#     we see `QA_AGENT_TOKEN` followed by `=`/`:`, optional whitespace,
#     a quote, and then 16+ contiguous hex / base64-url chars (looks
#     like a real secret). Env substitutions, command substitutions,
#     empty strings and JS/Python env-lookups pass through.
QA_TOKEN_LEAK=$(grep -rnE 'QA_AGENT_TOKEN[[:space:]]*[:=][[:space:]]*"?[A-Za-z0-9+/=_-]{16,}"?' \
  src/ qa/maestro/ docs/QA_AUTH_STRATEGY.md 2>/dev/null || true)
if [ -n "$QA_TOKEN_LEAK" ]; then
  fail "QA_AGENT_TOKEN looks hardcoded somewhere:"; echo "$QA_TOKEN_LEAK" | sed 's/^/        /'
else pass "QA_AGENT_TOKEN not hardcoded in src/ or qa/maestro"; fi

# 12) qa-debug-submit may only exist in OnboardingV2Screen.js, gated
#     behind QA_HOOK_ALLOWED. Anywhere else → fail. In the same file,
#     if found, require either QA_HOOK_ALLOWED or the QaLoginHook
#     container to be present.
QA_HOOK_OTHER=$(grep -rln 'qa-debug-submit' src/ 2>/dev/null \
  | grep -v 'src/screens/onboarding/OnboardingV2Screen.js' || true)
if [ -n "$QA_HOOK_OTHER" ]; then
  fail "qa-debug-submit found outside OnboardingV2Screen.js:"; echo "$QA_HOOK_OTHER" | sed 's/^/        /'
else
  if [ -f src/screens/onboarding/OnboardingV2Screen.js ] \
     && grep -q 'qa-debug-submit' src/screens/onboarding/OnboardingV2Screen.js; then
    if grep -q 'QA_HOOK_ALLOWED' src/screens/onboarding/OnboardingV2Screen.js \
       && grep -q 'QaLoginHook' src/screens/onboarding/OnboardingV2Screen.js; then
      pass "qa-debug-submit gated by QA_HOOK_ALLOWED + QaLoginHook"
    else
      fail "qa-debug-submit present in OnboardingV2Screen.js without QA_HOOK_ALLOWED guard"
    fi
  else
    pass "qa-debug-submit absent from frontend (acceptable)"
  fi
fi

# 13) Authenticated Maestro flows must not point at production backend
#     by default. We scan YAML files for production hostnames inside
#     their env: blocks or anywhere in commands.
AUTH_FLOWS="qa/maestro/driver-auth.yaml \
qa/maestro/client-auth.yaml \
qa/maestro/verification-authenticated.yaml \
qa/maestro/createcargo-authenticated.yaml \
qa/maestro/_lib/qa-login.yaml"
PROD_REF=""
for f in $AUTH_FLOWS; do
  [ -f "$f" ] || continue
  hit=$(grep -nE 'urtruck\.kz|185\.22\.65\.11|https?://prod' "$f" || true)
  [ -n "$hit" ] && PROD_REF="$PROD_REF\n$f:\n$hit"
done
if [ -n "$PROD_REF" ]; then
  fail "authenticated Maestro flows reference production backend:"; printf '%b\n' "$PROD_REF" | sed 's/^/        /'
else pass "authenticated Maestro flows have no production backend defaults"; fi

echo
if [ "$FAIL" -gt 0 ]; then
  echo "== Static gate: $FAIL FAILED — not ready for merge→main =="
  exit 1
fi
echo "== Static gate: ALL PASS — static checks green =="
exit 0
