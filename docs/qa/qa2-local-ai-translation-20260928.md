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
was started for source SHA `57bdd434d7edf1cf6a978134a50f4baf0c6e1857` and
was still running when this note was written. Its 60 rows and matrix summary
must be preserved here after completion before changing NLLB settings or the
service quality gate.

## Blockers

- Translation: QA2 matrix pending; source tests are not QA2 acceptance.
- STT: BLOCKED pending approved non-personal RU/ZH fixtures with references.
- Native push: BLOCKED pending QA2 FCM configuration and physical delivery.
