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
1. OpenAI production credential: GET /v1/models returns HTTP 401, code invalid_api_key. Existing QA2 credential returns HTTP 200; required gpt-4o-mini / gpt-4o-mini-transcribe models available. No inference was requested during the initial credential preflight.
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

## Applied recovery and results (2026-10-08)
Owner explicitly authorized the production patch and use of the existing working OpenAI credential for repeated tests. Recovery APPLIED; only production API restarted. Health passed, public system info reports production/beta=false, unauthenticated voice GET returns 401. Private rollback backup: /home/ubuntu/urtruck-ai-recovery-backups/20261008T152841Z. Patched chat.py SHA256: 80619b090b46559587ceb6d3722c1cd308cbd44345d24e4748f7e1fe6ecef080.
13 unit/security/rollback checks passed before deployment. No APK build, store rollout, migration, account change or data deletion.

### Physical text exchanges
OPPO app RU; Huawei app ZH. Eight exact messages, IDs 1403–1410, physically delivered in the existing room, contiguous order, no duplicates in the scoped read-only message query. All eight produced a translation on the recipient after tapping translate; observed UI latency 3.30–7.16 seconds.
| Pair | Content | Result |
|---|---|---|
| 1 | Location question RU; vehicle in Yiwu ZH | Both translations preserve meaning |
| 2 | Tomorrow 10:00; ten tonnes | Both preserve time and weight |
| 3 | 1500 USD; price confirmation | Both preserve amount and currency |
| 4 | Cargo photo/documents; arrival in Almaty | ZH→RU preserves essential meaning; RU→ZH says photos of cargo and documents rather than cargo photo plus documents: semantic qualification |

Retry on the previously failing Chinese message also succeeded. This establishes recovery of translation execution, not perfect translation quality.

### Controlled server audio tests
Eight mono PCM16/16kHz WAV inputs, generated using Milena/Tingting, passed through production speech_to_text_service and translate_service. All eight returned transcripts and translations; STT 0.78–2.46 seconds, translation 1.07–1.61 seconds. These are server tests, not physical microphone acceptance.
Six transcripts preserve essential source meaning. Two fail semantic acceptance:
- zh3: 运费 (freight) recognized as 订费 (order fee); 1500 USD preserved but fee meaning changed.
- ru4: question “Когда приедете в Алматы?” recognized as subordinate “когда приедете в Алматы”; translation changed to “send photos/documents when arriving”.
zh4 translated arrival with an ambiguous pronoun; arrival subject needs review.
These findings must not be reported as 8/8 quality PASS.

### Physical voice recording remains incomplete
Initial synthesized playback was routed to AirPods, so phone recordings contained unrelated ambient speech and were excluded. A later explicit built-in-speaker attempt yielded near-silent audio (message 1417: actual 7.41 s, mean -62.0 dB, max -37.6 dB), with no accepted transcript. Existing voice retry did return a transcript after recovery, but its content was ambient and does not validate the intended test phrase.
The previous Mac audio output was restored. No full physical voice PASS. Controlled speech needs an audible real microphone recording on each phone before acceptance; verify playback/source content first.

### Remaining checks
- Four physical RU voice recordings and four ZH recordings, playback, accurate transcript and translation.
- Recognition quality for freight terminology and question boundaries.
- Semantic text nuance for photo/documents; localized Huawei participant role label may say driver instead of shipper.
- Retry/persistence/draft/focus and full voice duration semantics remain outside this completed recovery check.
Huawei visible push delivery and numerical unread from earlier runs remain unresolved/unverified; iPhone is not tested here. Release acceptance remains NO-GO.

Evidence on the connected Mac: qa-evidence/play-internal-213622903-20261008/ai-recovery (screenshots/XML, results.jsonl, voice-results.jsonl and controlled-server-audio-results.json). Credentials and unrelated ambient transcripts are excluded from this public report.

## Owner confirmation and preservation
On 2026-10-08 the owner confirmed voice works on the phones. This is owner-reported physical confirmation, separately recorded from the incomplete automated acoustic matrix. Applied source SHA256 rechecked against production: matches. Private rollback backup verified present. Existing working credential values remain private. No additional build or merge performed to preserve this result.
