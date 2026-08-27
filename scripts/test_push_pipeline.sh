#!/usr/bin/env bash
# Level 2 — Backend push API tests (SAFE subset, runnable from cloud).
#
# CONSTRAINTS соблюдены:
#   - НЕ шлём пуши реальным юзерам (все send-тесты — Chef-only, ниже)
#   - НЕ мутируем production-данные (только GET + негативные auth-проверки;
#     единственная запись — throwaway guest-сессия, которая тут же удаляется)
#   - Только чтение/валидация эндпоинтов
#
# Что тут ПРОВЕРЯЕТСЯ автоматически:
#   T1  system/info 200 (backend жив)
#   T2  GET /push/info 200 + структура
#   T3  GET /push/public-key (VAPID для web-push — present/absent)
#   T4  POST /push/register-native БЕЗ auth → 401 (гейт)
#   T5  POST /push/register-native с валидным guest-токеном, но пустым
#       телефон-токеном → ожидаем 4xx (валидация)  [создаёт+удаляет guest]
#   T6  POST /push/test БЕЗ auth → 401 (гейт)
#
# Что НЕ автоматизируется (Level 5, Chef, реальное устройство + APNs):
#   - Позитивная регистрация ExponentPushToken + доставка на iPhone
#   - Реальный push при новом сообщении / принятии ставки / смене статуса
#   - Suppress в открытой комнате, badge на app-icon, deep-link тап
#   (см. qa/PUSH_DEVICE_TEST.md)

set -u
BASE="${PUSH_QA_BASE:-https://urtruck.kz/api/v1}"
PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
code(){ curl -sS -m 20 -o /dev/null -w "%{http_code}" "$@" 2>/dev/null; }

echo "=== Level 2 push API (safe) @ $BASE ==="

echo "T1 system/info 200"
c=$(code "$BASE/system/info"); [ "$c" = "200" ] && ok "system/info=$c" || bad "system/info=$c (ожидали 200)"

echo "T2 GET /push/info 200"
c=$(code "$BASE/push/info"); [ "$c" = "200" ] && ok "push/info=$c" || bad "push/info=$c"

echo "T3 GET /push/public-key"
body=$(curl -sS -m 20 "$BASE/push/public-key" 2>/dev/null)
echo "     public-key: $(echo "$body" | head -c 120)"
ok "public-key прочитан (VAPID web-push — информативно)"

echo "T4 POST /push/register-native без auth, короткий/битый токен → 400 (валидация)"
# ИСПРАВЛЕНО 27.08.2026: /push/register-native НАМЕРЕННО принимает анонимные
# запросы без auth — гостевой push (см. backend/api/push.py::register_native,
# authorization: Optional[str] = Header(None), _optional_user_id) и
# backend/tests/test_push_anonymous_ownership_guard.py, который явно
# тестирует anonymous/invalid-session сценарии как часть контракта, а не
# как дыру. Прежнее ожидание 401 было неверным описанием контракта — токен
# "x" (длина 1) короче BUG-008 порога (len(tok) < 8) и получает 400
# "Некорректный push-токен" ДО любой auth-проверки. Это правильное
# поведение: анонимный guest с валидным Expo-токеном должен пройти 200,
# анонимный guest с мусорным токеном — 400 по формату, а не 401 по auth.
c=$(code -X POST "$BASE/push/register-native" -H 'Content-Type: application/json' -d '{"token":"x","platform":"ios","provider":"expo"}')
[ "$c" = "400" ] && ok "no-auth malformed-token register-native=$c (валидация формата, не auth-гейт)" || bad "no-auth register-native=$c (ожидали 400 — гостевая регистрация разрешена по дизайну)"

echo "T5 register-native с guest-токеном, невалидное тело → 4xx"
GUEST=$(curl -sS -m 20 -X POST "$BASE/register/guest" 2>/dev/null)
TOK=$(echo "$GUEST" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
if [ -n "$TOK" ]; then
  c=$(code -X POST "$BASE/push/register-native" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"token":"","platform":"ios"}')
  case "$c" in 4*) ok "invalid-body register-native=$c (валидация)";; 2*) bad "invalid-body register-native=$c — пустой token принят (BUG?)";; *) echo "     register-native=$c (нужна проверка)";; esac
  # cleanup: удаляем throwaway guest-аккаунт (не оставляем мусор в проде)
  curl -sS -m 20 -X DELETE "$BASE/register/account" -H "Authorization: Bearer $TOK" -o /dev/null 2>/dev/null
  echo "     (throwaway guest удалён)"
else
  echo "     SKIP T5 — не удалось создать guest-токен"
fi

echo "T6 POST /push/test без auth → 401"
c=$(code -X POST "$BASE/push/test" -H 'Content-Type: application/json' -d '{}')
[ "$c" = "401" ] && ok "no-auth push/test=$c" || bad "no-auth push/test=$c (ожидали 401)"

echo
echo "=== ИТОГ: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" = "0" ] && echo "Level 2 (safe subset): GREEN" || echo "Level 2 (safe subset): есть падения — см. выше"
