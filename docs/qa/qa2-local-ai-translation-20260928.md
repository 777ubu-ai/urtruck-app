# QA2 local-AI translation — 2026-09-28

## Scope and safety

- Branch: `fix/voice-stt-translation-20260925`.
- Source SHA: `8be2c2c5e80b57a7d349df577435bcbad3794db2`.
- The runner sends only the checked-in synthetic logistics corpus. It does not
  read application databases, chats, media, transcripts, or private storage.
- QA2 runtime SHA: **UNKNOWN**. No deploy occurred.

## Checker changes

The structured checker now treats money/currency, weights, cities, warehouse,
time/date, body type and negation as required facts. It rejects a waterfall,
an added refrigerator, a negated tent, and a negative short answer such as
"Cargo ready? No". A failed mandatory synthetic case returns exit code 1.

## Evidence pending

Read-only run [#36388079397](https://github.com/777ubu-ai/urtruck-app/actions/runs/36388079397)
completed for source SHA `57bdd434d7edf1cf6a978134a50f4baf0c6e1857`: 60/60
synthetic rows, 16 PASS, 26 HTTP 422 and 18 semantic FAIL. Its workflow failed
correctly because the matrix was red; no deploy job ran.

The 60 saved synthetic JSON rows were rechecked locally, without AI requests,
by source SHA `7a0ac8db`. Adding only the verified English equivalent `goods
are ready` changes the result to 18 PASS, 26 HTTP FAIL and 16 semantic FAIL;
ZH→EN is 2/10. The two promoted rows are `Good, the goods are ready.`. This is
a checker false-negative correction, not a model-quality improvement. The
remaining `tent -> waterfall` cases remain FAIL.

Reproduction (the source JSON is intentionally not committed):
`python3` imports `scripts/qa2_ai_readonly_diagnostic.py`, reads the 60
`safe_translation` JSON lines from run `#36388079397`, and calls
`semantic_check(target_lang, phrase_kind, translated_text)` only. Source
SHA-256: `9eab17345d24f3a218b288fdf2933b87d4ce14ab413ceb293f2d20cb57c337db`.
The per-direction PASS counts are RU→ZH 4/10, ZH→RU 2/10, RU→EN 2/10,
EN→RU 4/10, EN→ZH 4/10 and ZH→EN 2/10.

## OpenAI mini STT pilot — 28.09.2026

PRE-FLIGHT: branch `fix/voice-stt-translation-20260925`, base `fb4c6816`.
Known-good: only historical partial RU→ZH physical voice on Xiaomi (17.09);
current QA2 local STT took about 40.53 s for 8 s audio. Production source SHA
and actual QA2 runtime source SHA are UNKNOWN; do not transfer historical PASS.
Scope: a protected, manually dispatched CI pilot of `gpt-4o-mini-transcribe`
on six newly synthesized, non-personal RU/ZH 10/15/20 s clips with fixed
reference facts. Text translation, installed QA2 service, production, phones,
APK, push, database and storage are not changed. The repository already has
a separate `QA2_OPENAI_API_KEY` secret; its value must not appear in logs.
Checks: Python compile, QA Center YAML, workflow contract tests, six response
HTTP/timing/fact checks and independent review of transcripts. p50/p95 in run
logs are based on three calls per language, so they are preliminary only.
Rollback: the pilot makes no runtime mutation; if any fact or HTTP call fails,
leave QA2 on local AI. A future deployment needs its own protected workflow,
source SHA check, secure QA2 configuration backup and rollback, plus Xiaomi↔OPPO
physical verification on approved recordings. The mini STT model has a planned
API removal on 26.02.2027; benchmark `gpt-transcribe` before that date.

## Blockers

- Translation: QA2 matrix pending; source tests are not QA2 acceptance.
- STT: BLOCKED pending approved non-personal RU/ZH fixtures with references.
- Native push: BLOCKED pending QA2 FCM configuration and physical delivery.
