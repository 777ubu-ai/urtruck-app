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

## Direct OpenAI STT check — 28.09.2026

A dedicated one-hour project key was created through the encrypted OpenAI key
flow and decrypted only on the Mac. Two new non-personal system-voice fixtures
were submitted directly to `gpt-4o-mini-transcribe`: RU 9.817 s and ZH
10.878 s. Both requests reached OpenAI but returned HTTP 429 before inference:
`type=insufficient_quota`, `code=credit_balance_exhausted` (RU 1.42 s, ZH
1.28 s on the diagnostic rerun). No transcript was produced and no model
quality or latency PASS can be claimed. Local key and audio files were removed;
the temporary platform key expires automatically after one hour.

## Blockers

- OpenAI STT: BLOCKED until the API project has positive billing credit.
- Translation: QA2 matrix pending; source tests are not QA2 acceptance.
- STT: BLOCKED pending approved non-personal RU/ZH fixtures with references.
- Native push: BLOCKED pending QA2 FCM configuration and physical delivery.

## Read-only gate-reason diagnostic — source only

- Source commit `0f57275e47f57b211a8dc8c9e5e54654a048fe9e` adds structured
  `gate_failure_reasons` to a new QA2 AI-service response. It does **not**
  weaken the quality gate: `translation_quality_ok(...)` is exactly the
  negation of `translation_quality_failures(...)`.
- QA2 runtime has not been installed or changed, therefore runtime source SHA
  remains **UNKNOWN**. A future diagnostic-only workflow copies the runner and
  this source revision of `backend/qa_ai_service/quality.py` only into a
  temporary `/tmp` directory, executes the synthetic loopback corpus, then
  removes that directory. It does not deploy or restart the AI service.
- On an older runtime that returns HTTP 422 with `detail.candidate` but without
  reason codes, the runner records that candidate and computes its structured
  reasons with the temporary source copy. Such rows are explicitly marked
  `gate_reason_provenance=diagnostic_source`; they are diagnostic evidence,
  not proof that QA2 has the source commit installed. Runtime-provided reason
  codes are marked `server`.

## Read-only result on `cd2d298e` — 2026-09-28

Run [#36409260200](https://github.com/777ubu-ai/urtruck-app/actions/runs/36409260200)
used source SHA `cd2d298eb4b7f1c0d8f51a7ea7202f62224cbe4a` and sent the same
60 public synthetic rows once. It produced 18 semantic PASS, 26 HTTP 422 and
16 semantic FAIL. The matrix deliberately returned exit code 1 because it is
not green; this is a diagnostic outcome, not a deployment failure.

All 26 HTTP 422 responses carried `detail.candidate`; none carried runtime
`gate_failure_reasons`. The source-copy fallback generated reasons for all 26,
each marked `gate_reason_provenance=diagnostic_source` and
`runtime_reason_codes_available=false`. No row is marked `server`. QA2 runtime
SHA remains **UNKNOWN**, as the workflow's deploy/recovery jobs were skipped.

Per direction: RU→ZH 4 PASS / 4 HTTP / 2 semantic; ZH→RU 2 / 4 / 4;
RU→EN 2 / 2 / 6; EN→RU 4 / 4 / 2; EN→ZH 4 / 6 / 0; ZH→EN 2 / 6 / 2.
The new structured evidence identifies genuine candidate loss (for example a
missing weight unit or city) separately from apparent gate false rejects caused
by numeric formatting, inflection, or equivalent date representation. No
quality-gate rule was changed based on this diagnostic run.

## Offline repair replay — source only

The saved 60 synthetic rows from run `#36409260200` were replayed locally by
`scripts/replay_qa2_ai_diagnostic.py`; it made no HTTP request. Before repair,
the matrix had 18 PASS. After deterministic repair, strict quality checks and
the semantic checker it has 54 PASS: 24 earlier HTTP 422 candidates become
safe to accept and 12 earlier semantic failures become PASS. Every promoted
row still passed required price/currency, weight, city, time/date, body-type
and negation checks.

Six rows remain red: case 28 fresh/warm stays a confirmed NLLB hallucination
(`This is the first time I've been...`) and retains a non-equivalent date;
cases 8 fresh/warm (`Уруми-Ци`) and 13 fresh/warm (`Urumchi`) require manual
language review before adding any city alias. This is offline source evidence
only; QA2 remains unmodified and its runtime SHA remains **UNKNOWN**.

The root-owned `__pycache__` cleanup failure from run `#36409260200` was
resolved by a dedicated no-AI cleanup job. Run
[#36412614794](https://github.com/777ubu-ai/urtruck-app/actions/runs/36412614794)
successfully removed only `/tmp/qa2-ai-readonly-diagnostic-36409260200` and
verified that it no longer exists. Its diagnostic, deploy and recovery jobs
were skipped.

## Source hardening before review

The backend quality gate now owns the critical polarity checks for refrigerated
transport, tent bodies and cargo readiness. It returns explicit reason codes
for lost/flipped negation and readiness, rather than relying on the diagnostic
checker. The source contract also exposes only `source_sha` in local-AI health
and makes a future AI deploy fail unless that value equals the requested exact
source SHA.

The one-shot cleanup workflow job was removed after its successful run; the
read-only diagnostic retains its guarded automatic cleanup. A second offline
replay of the same saved 60 synthetic rows reaches **58/60**: `Уруми-Ци` is
repaired only for Chinese `乌鲁木齐`, `Urumchi` is accepted as the explicit
English alias, and case 28 fresh/warm remains FAIL due to invented travel
history. No QA2 service was installed or restarted for this source result.

The public synthetic corpus is now a checked-in fixture at
`tests/fixtures/qa2_local_ai_readonly_36409260200.jsonl`, with SHA-256
`f8439956a911f49677df217011b7e9ee3f42e5c42a4fb389adb67528c36be97a`.
`SOURCE_TESTS` verifies that checksum and requires exactly 58 PASS with case
28 as the only failing case ID; it makes no AI or QA2 request.

## Deterministic Translation Memory foundation

Source commits: `b9f6364e` (engine), `18b806f4` (candidate data), `c1901d07`
(tests/report), `69f67d69` (CI inclusion), `731666dd` (typed exact-slot
matching), and `7f67e2e3` (cached shadow index). The
engine is exact-match only, language/intent/slot/version scoped, and validates
typed logistics facts and polarity after whitelist rendering. It is disabled
by default (`TRANSLATION_MEMORY_ENABLED=false`) and shadow-enabled by default;
the existing NLLB path and beam/model settings are unchanged. No QA2 deploy,
APK build or production change was made.

All ten JSONL seed files contain 25 candidate templates and terminology rows
(`approved` count: 0); Chinese
logistics terms and border names remain pending native/domain review. Protected
values are passed as validated slots and are not written to metrics. The
optional `translate_service` hook can return a TM result only when the feature
flag is explicitly enabled; otherwise it falls through to the configured
provider.

Local source checks: Python compile PASS; `git diff --check` PASS. A 1,000-call
local exact-match benchmark measured p50 0.032 ms and p95 0.042 ms on this
machine (the test budget is p50 <=50 ms and p95 <=200 ms). Pytest is not
installed in the current Mac interpreter, so the full backend test count must
come from the normal CI environment. QA2 runtime SHA remains UNKNOWN; the
feature is not approved for user responses until terminology and template
review plus shadow evidence are complete.

Source CI run [#36444728524](https://github.com/777ubu-ai/urtruck-app/actions/runs/36444728524)
on `69f67d69` passed: 78 backend tests, 25 Node workflow tests, fixture replay
and compile checks passed; the `deploy` job was skipped. This is source evidence
only and does not establish an installed QA2 runtime SHA.

After tightening the typed-slot matcher, source CI run
[#36445402483](https://github.com/777ubu-ai/urtruck-app/actions/runs/36445402483)
on `731666dd` passed: 79 backend tests, 25 Node workflow tests, replay and
compile checks passed; `deploy` was skipped. The additional test proves that a
trailing unmatched phrase cannot be swallowed by a final slot capture.

Final source-only run [#36445664465](https://github.com/777ubu-ai/urtruck-app/actions/runs/36445664465)
on `7f67e2e3` passed with 79 backend tests and 25 Node workflow tests; replay
and compile checks passed, and `deploy` remained skipped.
