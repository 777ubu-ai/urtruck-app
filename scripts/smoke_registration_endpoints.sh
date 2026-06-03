#!/usr/bin/env bash
# smoke_registration_endpoints.sh — проверяет, что нужные эндпоинты
# регистрации водителя присутствуют на заданном backend (route exists),
# до live-device smoke и после deploy.
#
# Usage:
#   scripts/smoke_registration_endpoints.sh http://localhost:8001/api/v1
#   scripts/smoke_registration_endpoints.sh https://urtruck.kz/security/api/v1
#
# Логика: для апоад/submit-роутов важно НЕ 404. Без auth они вернут
# 401/422 (валидация/токен) или 405 (метод) — это значит роут существует.
# 404 = роут отсутствует (старый backend) → FAIL. Секреты/токены/PII не
# используются: шлём пустые запросы без тела и без Authorization.
set -u

BASE="${1:-}"
if [ -z "$BASE" ]; then
  echo "Usage: $0 <api-base-url>"
  echo "  e.g. $0 http://localhost:8001/api/v1"
  echo "       $0 https://urtruck.kz/security/api/v1"
  exit 2
fi
BASE="${BASE%/}"  # strip trailing slash

CURL="curl -s -m 10 -o /dev/null -w %{http_code}"
PASS=0
FAIL=0

# Acceptable = route exists (not missing). 000 = connection failure.
acceptable() {
  case "$1" in
    200|401|403|405|422) return 0 ;;
    *) return 1 ;;
  esac
}

check() {
  # $1 = method, $2 = path, $3 = label
  local code
  code=$($CURL -X "$1" "$BASE$2" 2>/dev/null)
  if [ "$code" = "404" ]; then
    printf '  FAIL  %-34s %s (route MISSING)\n' "$2" "$code"; FAIL=$((FAIL+1))
  elif [ "$code" = "000" ]; then
    printf '  FAIL  %-34s %s (connection/empty)\n' "$2" "$code"; FAIL=$((FAIL+1))
  elif acceptable "$code"; then
    printf '  PASS  %-34s %s\n' "$2" "$code"; PASS=$((PASS+1))
  else
    printf '  WARN  %-34s %s (unexpected, treat as exists)\n' "$2" "$code"; PASS=$((PASS+1))
  fi
}

echo "== Registration endpoints smoke =="
echo "base: $BASE"
echo

# 1) system/info must be a real 200 with JSON
SI_CODE=$($CURL "$BASE/system/info" 2>/dev/null)
if [ "$SI_CODE" = "200" ]; then
  printf '  PASS  %-34s %s\n' "GET /system/info" "$SI_CODE"; PASS=$((PASS+1))
else
  printf '  FAIL  %-34s %s (expected 200)\n' "GET /system/info" "$SI_CODE"; FAIL=$((FAIL+1))
fi

# 2) required upload/draft/submit routes must NOT be 404
check POST  "/register/photo"                 "personal photo"
check POST  "/register/selfie"                "selfie"
check POST  "/register/license-selfie"        "license selfie"
check POST  "/register/vehicle-photo"         "vehicle photo"
check POST  "/register/cabin-photo"           "cabin photo"
check PATCH "/driver/registration/draft"      "driver draft"
check POST  "/driver/registration/submit"     "driver submit"

# 3) status route (GET); POST may be 405 which is acceptable (exists)
check GET   "/register/status"                "registration status"

echo
echo "== Result: $PASS passed, $FAIL failed =="
if [ "$FAIL" -gt 0 ]; then
  echo "FAIL — backend is missing required registration endpoints (deployment gap)."
  exit 1
fi
echo "PASS — all required registration endpoints present."
exit 0
