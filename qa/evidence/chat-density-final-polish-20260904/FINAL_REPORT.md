# URTRUCK TASK 2 - FINAL VERIFICATION REPORT

Date: 2026-09-04
Workspace: `/Users/bahitzanbahitzanovic/Downloads/urtruck-app`
Scope: final verification only. No new UI work was performed in this pass.

## BUILD

PASS.

- Known-good Java used: `/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`
- Java: OpenJDK 17.0.20.1 Homebrew
- Gradle: 8.10.2
- Command:
  `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home PATH=/opt/homebrew/opt/openjdk@17/bin:$PATH ./gradlew :app:assembleRelease -PURTRUCK_APPLICATION_ID=com.urtruck.app.qa2 -PURTRUCK_VERSION_CODE=210488256`
- Result: `BUILD SUCCESSFUL in 1m 35s`
- APK: `android/app/build/outputs/apk/release/app-release.apk`
- APK metadata: `package='com.urtruck.app.qa2' versionCode='210488256' versionName='1.0.7' compileSdkVersion='36' targetSdkVersion='36'`

JDK 26 was the bad environment from the earlier failure. JDK 17 is the working environment for this build.

## INSTALL

PASS.

Installed with `adb install -r` over existing QA2 data. No uninstall and no clear-data were used.

- Fedya: `4PYDDI4DHIXS5DD6` -> install success, package dump `versionCode=210488256`, `versionName=1.0.7`.
- Boris: `BUA6JB99T465Q49X` -> install success, package dump `versionCode=210488256`, `versionName=1.0.7`.

Evidence:

- `physical-after/fedya_after_warm.png`
- `physical-after/fedya_after_warm.xml`
- `physical-after/boris_after_warm.png`
- `physical-after/boris_after_warm.xml`

## ROLE LOCALE

PASS.

Command:
`QA_BASE_URL=http://127.0.0.1:4173 npm run qa:role-locale`

Result:

- RU: 23/23 pass
- EN: 23/23 pass
- ZH: 23/23 pass
- KK: 23/23 pass
- TOTAL: 92/92 pass

Diagnosis of previous apparent hang:

- The runner is silent until final summary.
- It was not stuck at the first case; artifacts showed steady progress through RU, EN, ZH, and KK.
- Local preview server served the QA gallery with HTTP 200. Expected preview-only backend calls returned HTTP 404, but did not fail the matrix.
- Final successful run log: `role-locale-diagnostics/qa-role-locale-manual.log`
- Generated screenshots/matrix: `qa-artifacts/role-locale-matrix/`

## PHYSICAL AFTER

PASS for available physical evidence on QA2 `210488256`.

Fedya deal room, keyboard closed:

- `deal-chat-composer`: `[28,1426][692,1552]`
- input: `[142,1448][402,1530]`
- camera/plus: `[53,1459][125,1531]`
- emoji: `[419,1459][491,1531]`
- mic: `[507,1459][579,1531]`
- attach: `[595,1459][667,1531]`

Fedya text/send state:

- typed text rendered in `deal-chat-input`
- send button rendered as `deal-chat-send`
- multiline input remained bounded: composer `[28,1392][692,1552]`, input `[142,1414][490,1530]`

Voice density:

- visible stacked voice bubbles include `0:11`, `0:04`, `0:35`, `0:13`, `0:59`, `0:59`, `1:00`
- V60 bubble visible as `voice-time` = `1:00`
- voice bubble/control test ids present in XML: `deal-chat-voice-bubble`, `voice-play-btn`, `voice-progress-track`, `voice-transcript-toggle`

Evidence:

- `physical-after/fedya_room_closed.png`
- `physical-after/fedya_room_closed.xml`
- `physical-after/fedya_keyboard_typed.png`
- `physical-after/fedya_keyboard_typed.xml`
- `physical-after/fedya_multiline_typed.png`
- `physical-after/fedya_multiline_typed.xml`
- `physical-after/fedya_text_sent.png`
- `physical-after/fedya_v60_transcript_expanded.png`
- `physical-after/fedya_v60_transcript_expanded.xml`
- `physical-after/boris_deals2.png`
- `physical-after/boris_deals2.xml`

Note: Boris was also updated and opened successfully, but coordinate taps twice escaped into WeChat/system UI. I did not clear data or reset the device; Boris evidence is therefore limited to install, launch, and Deals screen.

## COMPOSER FUNCTIONAL QA

PASS with one limitation.

Verified on Fedya:

- keyboard/input focus
- type text
- send state appears
- send tap performed
- multiline input
- compact row remains bounded
- mic/emoji/attach visible in closed composer evidence

Limitation:

- The subsequent scripted clear attempt left residual text (`Ta`) in the input, so attach-menu open state was not conclusively captured in this pass. The closed composer still proves attach touch target layout.

## V60 PLAYBACK

PASS.

Verified on physical Fedya with an existing visible `1:00` voice bubble:

- first play started
- pause tapped
- resume tapped
- completion wait performed
- second play started after completion

Evidence:

- `v60-playback-after/fedya_v60_playing_3s.png`
- `v60-playback-after/fedya_v60_paused.png`
- `v60-playback-after/fedya_v60_resumed.png`
- `v60-playback-after/fedya_v60_after_completion.png`
- `v60-playback-after/fedya_v60_second_play_3s.png`
- `v60-playback-after/fedya_v60_audio_playing_3s.txt`
- `v60-playback-after/fedya_v60_audio_second_play.txt`
- `v60-playback-after/fedya_v60_logcat_play_pause_resume.txt`
- `v60-playback-after/fedya_v60_logcat_full_cycle.txt`

The full-cycle logcat capture contains 139 audio/playback-related lines for the V60 interaction window.

## AUTOMATED

PASS for scripts present in this checkout:

- `npm run build:web` -> PASS
- `npm run qa:locale-runtime` / `node qa/utils/runtimeLocaleLeakProbe.mjs http://127.0.0.1:4173` -> PASS
- `npm run qa:role-locale` -> PASS, 92/92
- `npm run qa:i18n` -> PASS
- `npm run qa:zh` -> PASS
- `npm run qa:theme` -> PASS
- `npm run qa:nav` -> PASS

N/A in this checkout:

- `npm run test:frontend` -> missing script in `package.json`
- `node tests/frontend/test_chat_golden_suite.mjs` -> file not found
- `node tests/frontend/test_voice_long_state_regression.mjs` -> file not found
- `node --test tests/frontend/test_voice_60sec_finalize_regression.mjs` -> file not found

Because these requested canonical tests are absent from `/Users/bahitzanbahitzanovic/Downloads/urtruck-app`, this final verification cannot be marked fully passed.

## FINAL

No UI source changes were made during this final verification pass.

TASK 2 CHAT POLISH INCOMPLETE
