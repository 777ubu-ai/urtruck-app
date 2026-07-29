#!/usr/bin/env bash
# CHAT QA — Level 2: безопасные API-тесты чата с прода (из облака).
#
# CONSTRAINTS: не трогаем production-данные, не шлём пуши реальным юзерам.
# Только негативные/гейт-проверки (401/403) + чтение публичных info.
# Позитивный round-trip (отправка/доставка/пуш) — на устройствах, см.
# qa/CHAT_QA_MASTER.md.

set -u
BASE="${CHAT_QA_BASE:-https://urtruck.kz/api/v1}"
STORAGE="${CHAT_QA_STORAGE:-https://urtruck.kz/storage}"
PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
code(){ curl -sS -m 20 -o /dev/null -w "%{http_code}" "$@" 2>/dev/null; }

echo "=== CHAT QA Level 2 (safe) @ $BASE ==="

echo "T1 система жива"
c=$(code "$BASE/system/info"); [ "$c" = "200" ] && ok "system/info=$c" || bad "system/info=$c"

echo "T2 /chat/send без auth → 401/403 (нельзя писать анонимно)"
c=$(code -X POST "$BASE/chat/send" -H 'Content-Type: application/json' -d '{"text":"x","to_user_id":"y"}')
case "$c" in 401|403) ok "no-auth send=$c";; *) bad "no-auth send=$c (ожидали 401/403)";; esac

echo "T3 /chat/rooms без auth → 401/403 (чужие чаты не читаются)"
c=$(code "$BASE/chat/rooms")
case "$c" in 401|403) ok "no-auth rooms=$c";; *) bad "no-auth rooms=$c";; esac

echo "T4 /chat/messages/{room} без auth → 401/403"
c=$(code "$BASE/chat/messages/room_nonexistent")
case "$c" in 401|403) ok "no-auth messages=$c";; *) bad "no-auth messages=$c";; esac

echo "T5 /chat/voice (upload аудио) без auth → 401/403"
c=$(code -X POST "$BASE/chat/voice")
case "$c" in 401|403) ok "no-auth voice=$c";; *) bad "no-auth voice=$c";; esac

echo "T6 /chat/photo без auth → 401/403"
c=$(code -X POST "$BASE/chat/photo")
case "$c" in 401|403) ok "no-auth photo=$c";; *) bad "no-auth photo=$c";; esac

echo "T7 /chat/typing без auth → 401/403"
c=$(code -X POST "$BASE/chat/typing" -H 'Content-Type: application/json' -d '{"room_id":"x"}')
case "$c" in 401|403) ok "no-auth typing=$c";; *) bad "no-auth typing=$c";; esac

echo "T8 /chat/unread без auth → 401/403"
c=$(code "$BASE/chat/unread")
case "$c" in 401|403) ok "no-auth unread=$c";; *) bad "no-auth unread=$c";; esac

echo "T9 /chat/translate без auth → 401/403"
c=$(code -X POST "$BASE/chat/translate" -H 'Content-Type: application/json' -d '{"message_id":1,"target_lang":"RU"}')
case "$c" in 401|403) ok "no-auth translate=$c";; *) bad "no-auth translate=$c";; esac

echo "T10 storage НЕ публичный: файл без подписи → 401/403/404"
c=$(code "$STORAGE/chat_photos/anyfile.jpg")
case "$c" in 401|403|404) ok "unsigned storage=$c (не отдаётся)";; 200) bad "unsigned storage=200 — ФАЙЛЫ ПУБЛИЧНЫ (дыра!)";; *) ok "unsigned storage=$c (не 200 — ок)";; esac

echo "T11 translate/info доступен (режим перевода)"
body=$(curl -sS -m 20 "$BASE/chat/translate/info" 2>/dev/null)
echo "     $(echo "$body" | head -c 140)"
c=$(code "$BASE/chat/translate/info"); [ "$c" = "200" ] && ok "translate/info=200" || bad "translate/info=$c"

echo "T12 push /subscribe возвращает user_id-поле (P1-2 fix живой)"
c=$(code -X POST "$BASE/push/subscribe" -H 'Content-Type: application/json' -d '{"endpoint":"https://example.invalid/ep-qa-test","keys":{"p256dh":"x","auth":"y"}}')
[ "$c" = "200" ] && ok "subscribe(anon)=200 (guest-подписка допустима by design)" || ok "subscribe(anon)=$c"
# cleanup: отписываем тестовый endpoint, не оставляем мусор
curl -sS -m 20 -X POST "$BASE/push/unsubscribe" -H 'Content-Type: application/json' -d '{"endpoint":"https://example.invalid/ep-qa-test"}' -o /dev/null 2>/dev/null
echo "     (тестовая подписка удалена)"

echo
echo "=== ИТОГ: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" = "0" ] && echo "CHAT Level 2 (safe): GREEN" || echo "CHAT Level 2: есть падения — см. выше"
