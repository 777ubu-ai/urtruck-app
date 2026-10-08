# Production: восстановление перевода и совместимости голосового API

## PRE-FLIGHT
- Branch: fix/production-voice-translation-recovery-20261008; base SHA: 6bba4163a92f385b71dfd2297bc4ecba29b4e246.
- Installed Android: com.urtruck.app, 1.0.9 (213622903), OPPO/Huawei, production https://urtruck.kz.
- Production reports version 1.0.50, build_time 2026-10-01 06:46. Exact server git SHA UNKNOWN; source hash api/chat.py: 653a71a6a5c97000de8ee854b137e1de76543b88649d361970b816ac1bd10267.
- Known-good: historical QA2 translation/voice evidence in GOLDEN_BASELINE. It is not production acceptance; current Android production delivery/composer PASS does not establish translation or STT.
- Scope: only append a backward-compatible cached voice-text endpoint to the currently deployed api/chat.py; restore existing OpenAI credential/model configuration. No APK, schema migration, UI, FSM, auth design, push, GPS, stores or QA2 runtime changes.
- Risks: brief API restart; existing OpenAI inference has usage charges; access must remain participant- and accepted-deal-scoped.
- Checks: Graphify AST-only, 13 unit/security/rollback checks, combined production source syntax check, read-only server preflight, then physical 4 exchanges each way on the same APK.
- Rollback: private backup of api/chat.py, backend .env and effective process AI env; guarded recovery script --rollback BACKUP_DIR restores files and process. No chat/message deletion.

## Confirmed root causes
1. OpenAI production credential: GET /v1/models returns HTTP 401, code invalid_api_key. Existing QA2 credential returns HTTP 200; required gpt-4o-mini / gpt-4o-mini-transcribe models available. No inference was requested.
2. Current Android calls GET /api/v1/chat/voice/1397/text and /1398/text; production returns HTTP 404. Deployed backend has POST /transcribe but lacks GET /voice/{message_id}/text.
3. Production file configured translation model gpt-5.6-luna; recovery selects the model available to the existing validated credential. Credential replacement alone has not been asserted to prove translation.

## Patch behavior
The new GET validates message existence, is_voice, participant membership and accepted-deal access before returning cached transcript/translation. No GET inference, background jobs or database writes are introduced. Uncached voice returns status=unavailable; the installed client's existing explicit-tap fallback then invokes POST /transcribe.

The recovery script is read-only by default. --apply is the explicit mutation switch. It refuses a changed source hash or missing models, backs up private files with restrictive permissions, appends the endpoint, updates only AI keys, restarts only urtruck-security-api and saves PM2 state after health passes. If restart fails, it restores the previous files and effective AI environment.

## Server commands after owner review/authorization
Copy both scripts from scripts/ops to a private directory on the server, then:
```sh
python3 /tmp/urtruck-ai-recovery-20261008/recover_production_chat_ai.py --expected-chat-sha256 653a71a6a5c97000de8ee854b137e1de76543b88649d361970b816ac1bd10267
# Changes production only with explicit --apply:
python3 /tmp/urtruck-ai-recovery-20261008/recover_production_chat_ai.py --expected-chat-sha256 653a71a6a5c97000de8ee854b137e1de76543b88649d361970b816ac1bd10267 --apply
# Exact backup directory is printed by APPLIED:
python3 /tmp/urtruck-ai-recovery-20261008/recover_production_chat_ai.py --rollback BACKUP_DIR
```

## Required physical acceptance
Existing room: 56405b6c-ff03-4e9e-a31c-ddac781c6279. OPPO RU, Huawei ZH.
- Four RU↔ZH text exchanges, exact punctuation, numbers/cities/currency.
- Four genuine acoustic voice recordings per device; verify content and playback before asserting STT correctness.
- Capture original, transcript, translation, duration and elapsed times.
- Verify retry, message order, no duplicates, preserved draft/focus.
- Never call recovery complete based solely on models/health or mocks.

## Current result
13 tests PASS; server read-only preflight PASS. Deployment, inference and physical repair acceptance NOT EXECUTED. Public rollout not authorized.
