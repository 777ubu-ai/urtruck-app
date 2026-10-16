# PR551 physical acceptance readback — 2026-10-16

Frozen candidate: `f8cf82f30c96cfd35bffe7b2fdc67c7c0fb0d227`, tree `c44f8f6b1c76c6e4bd5db202b31cb75cace27bac`. PR551 remains draft, without merge. This report is a separate documentation branch. No public release, production deploy, data clear, uninstall, real-user role change or store-country/account change was performed.

## QA functionality

Exact-source QA build run 38928961827 succeeded, artifact 12058647108. APK SHA-256 `ae06d4c70e0d4ccd277584fc2495b42643b5465879642b8ec6b62dba32743dd0`, package `com.urtruck.app.qa2`, version 1.0.9-qa2 / 211040107. Compatible QA signer `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Local manifest plus actual DEX FCM checks passed.

Both Xiaomi BUA6JB99T465Q49X and OPPO WGCA9PSGOFUOWC7D were read back with that exact APK hash. A concurrent controller updated the devices before our guarded install script ran; the script detected the changed baseline and aborted before installing. Therefore installation by this script is not claimed. Both original firstInstallTime values were preserved. Final readback verified production package metadata/APK hashes unchanged on both phones, and QA firstInstallTime unchanged. Xiaomi's inactive debug-signed production package and retained data were left untouched.

Full exact-source main:app runs in an isolated loopback lab on Mac port 8005, fresh synthetic SQLite and local storage, BETA_MODE=false. Each phone's QA loopback port 8002 is reversed to 8005. The earlier shortened lab was not used for acceptance. QA accounts were created through ordinary email OTP/profile endpoints, using the existing unconfigured QA-channel mock code, not injected sessions. This does not verify external email delivery. No production users or their roles were changed.

Physical observations:

- PASS: ordinary QA login for shipper on Xiaomi and driver on OPPO; cargo visible to driver. The synthetic cargo itself was prepared through the owner's ordinary API, so physical cargo publication is not PASS.
- PASS: OPPO driver bid, Xiaomi shipper acceptance, deal room creation, text messages sent and visible on both devices.
- PASS: Xiaomi selected the deliberately prepared PDF fixture through Android DocumentsUI; OPPO received and rendered the PDF in the native preview. Original and lab-storage SHA-256 agree (`da433d2e69ac984780313482964332ac4918bf45aa693791a1771ede3b1a054e`). This is a 613-byte synthetic PDF, not large-file, iOS or production-storage acceptance.
- PARTIAL: a repository-owned image was selected through Xiaomi's photo picker, uploaded to lab storage and shown in the sender bubble. Recipient image rendering/opening was not confirmed. No personal media was intentionally selected.
- PARTIAL: driver started the trip after the normal location disclosure/QA-app Android permission flow. The room showed in_progress. Background GPS delivery, terminal stop and real notifications were not accepted.
- BLOCKER: OPPO next-status button bounds [42,2226][1038,2376] overlap Android navigation y=2268..2400. Its center activates Home; the process remains alive. Border/delivered/received/completed physical flow is not PASS.
- NEEDS VERIFICATION: PDF rendered, but an automation tap on its close button did not dismiss the preview; the control is near the status bar. No cause or fix is claimed here.

The status-sheet layout fix is isolated in draft PR555, source `b5bb015f4dfc98ebdac6a7cc15486983865cf1ba`, based on frozen f8cf82f. It adds bottom inset padding only; FSM, handlers, backend and Auth are unchanged. Local unit suite 1252/1252 and lint 508 files passed. CI run 38936129387 passed all three required jobs on exact source b5bb015f. Independent review is pending. Native geometry on a patched APK remains pending. No physical PASS transfers to this new source.

After testing, only QA processes on both phones were force-stopped as cleanup, including the active QA tracking process. No app data was cleared. The synthetic deal remains in_progress; process cleanup is not proof of FSM-driven tracking stop. Lab remains healthy (HTTP 200), SQLite quick_check=ok; reverse 8002→8005 remains. Production packages were not stopped or changed by this cleanup.

## Play update — PENDING

Existing candidate AAB upload: run 38913905712, versionCode 214323606, expected SHA-256 `e1b44daf7ee2b38d5c94fce52cd95a011a9b323843598835fb4b409b9e443767`. Read-only generated-APK run 38929173698 succeeded: Google generated APKs for that version. This confirms the uploaded bundle's existence, not the phone's track eligibility.

Actual fresh Internal track/tester/country readback is not completed. Draft diagnostic PR554 (`5933cf98ad3a4d9a39fabe6f9e492ab5fdb6b973`) passed CI 3/3, but its new workflow is unavailable to dispatch before registration on the default branch (HTTP 404). It performs temporary edit creation, GET-only metadata queries and DELETE cleanup; no edit commit or track update. Testers API exposes Google Groups, not individual email-list membership.

The historical offer of 213798673 cannot yet be attributed conclusively to membership, country or propagation. Xiaomi's retained inactive debug package explains INSTALL_FAILED_UPDATE_INCOMPATIBLE, not which version Play offers. OPPO's location error remains. No countries, memberships or Google accounts were changed. QA sideload acceptance is separate from a Play-delivered production update.

Local AAB search found only two older bundles; neither matches the final candidate hash. One bounded download attempt for final AAB artifact 12052443042 ended with HTTP 503: Egress is over the account limit. The preallocated archive is incomplete, renamed .partial and not accepted. AAB_FINAL_DEX_PENDING remains. No further retry was made; QA APK DEX PASS does not transfer to AAB.

## TestFlight — BLOCKED before Environment approval

Draft PR553 is the current main-targeted guarded tooling proposal (`b0c9bfaef76069bacdafc99539c631223b8bfb4e`); its CI passed. It pins runtime source f8cf82f and its source CI, preserves production Environment and signing/API checks, requires explicit upload mode and trusted tooling. The earlier PR552 was closed because its release-branch target was not a protected Environment-eligible path.

PR553 still needs independent review and the normal protected-main merge. The repository ENGINEERING_CONSTITUTION section 6 says: «Автор не подтверждает критическую работу единолично» and requires enhanced review for production infrastructure. No review is currently recorded on PR553. No iOS build/IPA upload or awaiting-Environment job exists yet; a job URL is therefore not claimed. After the reviewed workflow reaches the approved path, dispatch it with exact source/tooling SHA and await the normal Environment gate. Eligible reviewers are 777ubu-ai and arbeiterschaft02-prog; if 777ubu-ai triggers it, arbeiterschaft02-prog must approve because self-review is prohibited. No protection was disabled or bypassed.

## Unclosed acceptance

UPGRADE_PENDING remains. No authorized representative legacy database plus matching private storage was provided. External QQ/email, FCM/APNs delivery, production storage, full physical two-role terminal journey, new-candidate 1000+1000 UI/memory/filter matrix remain unaccepted. PR542–545 remain excluded.

Private raw evidence, logs and preservation hashes are under the user's existing qa-evidence/release-consolidation-20261014/pr551-device-acceptance-20261016 directory. Raw UI picker captures and private tokens/environment are not committed.
