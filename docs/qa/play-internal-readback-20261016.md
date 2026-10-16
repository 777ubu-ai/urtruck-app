# Play Internal metadata readback

Preflight: isolated ops/play-internal-readback-20261016 from candidate f8cf82f30c96cfd35bffe7b2fdc67c7c0fb0d227. Only a manual diagnostic workflow is added; no application/runtime/dependency change. Existing authorized Play credential is consumed only by official Google auth and hardcoded androidpublisher.googleapis.com API.

Scope: create an isolated temporary edit, GET tracks/testers/country availability, delete edit in finally; no edits.commit, update, upload, tester or country changes. Results contain version codes/status, group counts/fingerprints, country availability. API testers does not expose email-list membership. Source compilation and diff check before execution. Rollback: close PR/delete diagnostic workflow by normal revert; any failed edit deletion expires without commit. No production release or backend change.
