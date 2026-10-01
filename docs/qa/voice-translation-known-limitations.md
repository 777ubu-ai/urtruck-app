# QA2 voice translation: known limitation

The Xiaomi physical run on 2026-10-01 measured 63–64 seconds from voice
submission to a prepared STT result. This PR does not change the STT model,
worker capacity, queueing policy, or its timeout, so that latency remains an
unresolved performance issue and must not be reported as PASS.

This PR only repairs the proven RU→ZH translation quality-gate failure for the
observed NLLB Almaty spelling and preserves safe HTTP 422 reason codes. A
future physical run must measure upload, queue, transcription, reveal, and
translation separately.
