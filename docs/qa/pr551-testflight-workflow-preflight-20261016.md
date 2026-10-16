# Exact-source TestFlight tooling for PR551

Preflight: isolated branch fix/testflight-pr551-exact-source-20261016, base release/store-public-20261010 a1fa2822276cbef602e490aaaaf54abb040e958a. Production runtime SHA UNKNOWN. Known-good tooling baseline 918a522f previously built source 9ac0b620; that acceptance does not transfer to this candidate.

Scope: one new manual-only workflow and its contract test. Existing workflows, app source, secrets and Environment policies unchanged. App SHA pinned to f8cf82f30c96cfd35bffe7b2fdc67c7c0fb0d227; CI identity pinned to successful run 38909907753. Existing exact-tooling-SHA check, EAS/ASC counter comparison, production bundle/API/signing verification, explicit upload mode and single iOS concurrency group retained. Build/upload requires production Environment.

Promotion: review and merge this tooling-only PR into the already allowed release/store-public-20261010 branch. Then read current ASC build maximum, dispatch with the exact reviewed resulting tooling SHA, and obtain production Environment approval. Reviewers observed: 777ubu-ai and arbeiterschaft02-prog; prevent_self_review=true, can_admins_bypass=false, protected branches only. If owner triggers the run as 777ubu-ai, approval must come from an eligible different reviewer such as arbeiterschaft02-prog. No feature-branch dispatch or policy change is proposed. Until promotion there is no pending Environment approval URL.

Risk: workflow controls production signing and TestFlight upload, so independent review is required before promotion/execution. TestFlight acceptance and device QA remain pending. Upload is not App Review/public release.

Rollback: close the tooling PR before merge; if merged, revert only the added workflow/test/docs. Do not restore any old database. No app/backend/data changes and no build started by this patch.
