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

## Blockers

- Translation: QA2 matrix pending; source tests are not QA2 acceptance.
- STT: BLOCKED pending approved non-personal RU/ZH fixtures with references.
- Native push: BLOCKED pending QA2 FCM configuration and physical delivery.
