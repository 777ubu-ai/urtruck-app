#!/usr/bin/env bash
BASE="http://127.0.0.1:8001/api/v1"
QAT="$(grep -E '^QA_AGENT_TOKEN=' /Users/bahitzanbahitzanovic/urtruck-app/backend/.env | head -1 | cut -d= -f2-)"
tok(){ curl -sS -m 10 -X POST "$BASE/qa/ensure-actor" -H "Content-Type: application/json" -H "X-QA-Agent-Token: $QAT" -d "{\"actor\":\"$1\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))"; }
BORIS=$(tok boris); SERIK=$(tok serik)
echo "boris tok ${#BORIS}, serik tok ${#SERIK}"

# 1) boris cargo A — «Тент 20т стройматериалы» (получит ставку)
CA=$(curl -sS -m 10 -X POST "$BASE/market/cargos" -H "Authorization: Bearer $BORIS" -H "Content-Type: application/json" \
  -d '{"from_city":"Алматы","to_city":"Москва","cargo_desc":"Тент 20т стройматериалы","cargo_type":"tent","weight_tons":20,"volume_m3":40,"price":2400,"currency":"USD","pickup_date":"2026-07-25"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
echo "cargo A id: $CA"

# 2) boris cargo B — «Рефконтейнер с рыбой» (0 ставок)
CB=$(curl -sS -m 10 -X POST "$BASE/market/cargos" -H "Authorization: Bearer $BORIS" -H "Content-Type: application/json" \
  -d '{"from_city":"Алматы","to_city":"Урумчи","cargo_desc":"Рефконтейнер с рыбой","cargo_type":"ref","weight_tons":18,"volume_m3":60,"price":3000,"currency":"USD","pickup_date":"2026-07-26"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
echo "cargo B id: $CB"

# 3) serik ставка на cargo A
BID=$(curl -sS -m 10 -X POST "$BASE/market/bids" -H "Authorization: Bearer $SERIK" -H "Content-Type: application/json" \
  -d "{\"cargo_id\":\"$CA\",\"amount\":2300,\"message\":\"Возьму, опыт есть\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))")
echo "bid id: $BID"
echo "SEED_DONE cargoA=$CA cargoB=$CB bid=$BID"

# --- Сделка для deal/chat-флоу: boris cargo → serik bid → boris accept ---
CC=$(curl -sS -m10 -X POST "$BASE/market/cargos" -H "Authorization: Bearer $BORIS" -H "Content-Type: application/json" -d '{"from_city":"Алматы","to_city":"Бишкек","cargo_desc":"QA сделка деморейс","cargo_type":"tent","weight_tons":10,"volume_m3":20,"price":1500,"currency":"USD","pickup_date":"2026-07-24"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
NB=$(curl -sS -m10 -X POST "$BASE/market/bids" -H "Authorization: Bearer $SERIK" -H "Content-Type: application/json" -d "{\"cargo_id\":\"$CC\",\"amount\":1450,\"message\":\"Беру\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
DEAL=$(curl -sS -m15 -X POST "$BASE/market/bids/$NB/accept" -H "Authorization: Bearer $BORIS" -H "Content-Type: application/json" | python3 -c "import sys,json;print(json.load(sys.stdin).get('deal_id',''))")
echo "DEAL_SEEDED deal=$DEAL cargoC=$CC"

# --- Рейс serik (карточка перевозчика в клиентской ленте для ❤️) ---
curl -sS -m10 -X POST "$BASE/market/trips" -H "Authorization: Bearer $SERIK" -H "Content-Type: application/json" -d '{"from_city":"Урумчи","to_city":"Алматы","truck_type":"tent","capacity_tons":20,"available_m3":80,"price":2000,"currency":"USD","departure":"2026-07-25"}' >/dev/null && echo "trip serik seeded"
