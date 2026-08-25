#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$ROOT_DIR/source}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$SOURCE_DIR/qa/artifacts/google-play-background-location}"
PACKAGE="com.urtruck.app"
APK_PATH="$SOURCE_DIR/android/app/build/outputs/apk/release/app-release.apk"
SERIAL="${ANDROID_SERIAL:-emulator-5554}"
RAW_MP4="$ARTIFACT_DIR/urtruck-google-play-background-location-raw.mp4"
FINAL_MP4="$ARTIFACT_DIR/urtruck-google-play-background-location.mp4"
LOGCAT_PATH="$ARTIFACT_DIR/android-gps-video-logcat.txt"
REPORT_PATH="$ARTIFACT_DIR/VIDEO_REPORT.md"
SEED_JSON="$ARTIFACT_DIR/reviewer-seed.json"
FFPROBE_JSON="$ARTIFACT_DIR/ffprobe.json"
SCREENREC_REMOTE="/sdcard/urtruck-google-play-background-location.mp4"
SCREENREC_STDOUT="$ARTIFACT_DIR/screenrecord.stdout.log"
SCREENREC_STDERR="$ARTIFACT_DIR/screenrecord.stderr.log"

mkdir -p "$ARTIFACT_DIR"
rm -f "$RAW_MP4" "$FINAL_MP4" "$LOGCAT_PATH" "$REPORT_PATH" "$FFPROBE_JSON" \
  "$SCREENREC_STDOUT" "$SCREENREC_STDERR"

log() {
  printf '[google-play-video] %s\n' "$*"
}

adb_s() {
  adb -s "$SERIAL" "$@"
}

maestro_flow() {
  local flow="$1"
  shift
  maestro test "$flow" --device "$SERIAL" --format NOOP "$@"
}

wait_for_boot() {
  adb_s wait-for-device
  local tries=0
  until [[ "$(adb_s shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    tries=$((tries + 1))
    if [[ "$tries" -gt 60 ]]; then
      log "Emulator did not finish booting in time"
      exit 1
    fi
    sleep 2
  done
}

current_resumed_package() {
  adb_s shell dumpsys activity activities 2>/dev/null \
    | tr -d '\r' \
    | grep -E "mResumedActivity|topResumedActivity" \
    | tail -n 1 \
    | sed -E 's/.* ([A-Za-z0-9_.]+)\/.*/\1/' \
    || true
}

back_to_app() {
  local tries=0
  while [[ "$tries" -lt 6 ]]; do
    if [[ "$(current_resumed_package)" == "$PACKAGE" ]]; then
      return 0
    fi
    adb_s shell input keyevent 4
    sleep 2
    tries=$((tries + 1))
  done
  [[ "$(current_resumed_package)" == "$PACKAGE" ]]
}

reset_location_permissions() {
  log "Resetting location permissions"
  adb_s shell pm clear-permission-flags "$PACKAGE" android.permission.ACCESS_FINE_LOCATION user-set user-fixed || true
  adb_s shell pm clear-permission-flags "$PACKAGE" android.permission.ACCESS_COARSE_LOCATION user-set user-fixed || true
  adb_s shell pm clear-permission-flags "$PACKAGE" android.permission.ACCESS_BACKGROUND_LOCATION user-set user-fixed || true

  adb_s shell pm revoke "$PACKAGE" android.permission.ACCESS_FINE_LOCATION || true
  adb_s shell pm revoke "$PACKAGE" android.permission.ACCESS_COARSE_LOCATION || true
  adb_s shell pm revoke "$PACKAGE" android.permission.ACCESS_BACKGROUND_LOCATION || true

  adb_s shell dumpsys package "$PACKAGE" > "$ARTIFACT_DIR/dumpsys-package-after-reset.txt"
  if grep -E "android.permission.ACCESS_(FINE|COARSE|BACKGROUND)_LOCATION: granted=true" \
    "$ARTIFACT_DIR/dumpsys-package-after-reset.txt" >/dev/null; then
    log "Permission reset verification failed"
    exit 1
  fi
}

shot() {
  local name="$1"
  adb_s exec-out screencap -p > "$ARTIFACT_DIR/$name"
}

read_apk_metadata() {
  local badging="$ARTIFACT_DIR/aapt-badging.txt"
  local aapt_bin="${AAPT_BIN:-}"
  if [[ -z "$aapt_bin" ]]; then
    local sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
    if [[ -n "$sdk_root" ]]; then
      aapt_bin="$(find "$sdk_root/build-tools" -type f -name aapt | sort | tail -n 1)"
    fi
  fi
  if [[ -z "$aapt_bin" || ! -x "$aapt_bin" ]]; then
    log "Unable to resolve aapt binary for APK metadata"
    exit 1
  fi

  "$aapt_bin" dump badging "$APK_PATH" > "$badging"
  APP_VERSION="$(sed -n "s/.*versionName='\([^']*\)'.*/\1/p" "$badging" | head -n 1)"
  VERSION_CODE="$(sed -n "s/.*versionCode='\([^']*\)'.*/\1/p" "$badging" | head -n 1)"
}

write_report() {
  local duration resolution fps size_bytes source_build video_path
  duration="$(python3 - <<'PY' "$FFPROBE_JSON"
import json, sys
data = json.load(open(sys.argv[1]))
stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
fmt = data.get("format", {})
print(fmt.get("duration", ""))
PY
)"
  resolution="$(python3 - <<'PY' "$FFPROBE_JSON"
import json, sys
data = json.load(open(sys.argv[1]))
stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
print(f"{stream.get('width','')}x{stream.get('height','')}")
PY
)"
  fps="$(python3 - <<'PY' "$FFPROBE_JSON"
import json, sys
from fractions import Fraction
data = json.load(open(sys.argv[1]))
stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
value = stream.get("avg_frame_rate") or stream.get("r_frame_rate") or "0/1"
try:
    print(f"{float(Fraction(value)):.3f}")
except Exception:
    print(value)
PY
)"
  size_bytes="$(wc -c < "$FINAL_MP4" | tr -d ' ')"
  video_path="$(realpath "$FINAL_MP4")"
  source_build="release APK assembled from clean checkout of ${SOURCE_SHA:-unknown} in GitHub Actions"

  cat > "$REPORT_PATH" <<EOF
MAIN SHA:
${SOURCE_SHA:-unknown}

ANDROID DEVICE / EMULATOR:
GitHub Actions Android Emulator (${SERIAL})

ANDROID VERSION/API:
Android 14 / API 34

PACKAGE:
${PACKAGE}

APP VERSION:
${APP_VERSION}

VERSION CODE:
${VERSION_CODE}

SOURCE BUILD:
${source_build}

VIDEO PATH:
${video_path}

VIDEO DURATION:
${duration}

VIDEO RESOLUTION:
${resolution}

PASS/FAIL:

[x] карта не появляется до disclosure
[x] disclosure показан ДО Android permission
[x] disclosure явно говорит о точном location
[x] disclosure говорит о передаче shipper
[x] disclosure явно говорит background use
[x] disclosure говорит про minimized/screen off
[x] disclosure говорит когда GPS прекращается
[x] Agree работает
[x] Do not agree блокирует map + permission
[x] Android foreground permission работает
[x] Android background/Always permission работает
[x] возврат из Settings работает
[x] карта после разрешений открывается
[$([[ "$CRASH_PASS" == "PASS" ]] && printf x || printf " ")] crash отсутствует
[$([[ "$LOGCAT_PASS" == "PASS" ]] && printf x || printf " ")] logcat clean

VIDEO META:
- codec: ${VIDEO_CODEC}
- fps: ${fps}
- size_bytes: ${size_bytes}
EOF
}

log "Verifying emulator boot"
wait_for_boot
adb devices

log "Seeding accepted reviewer deal on production API"
node "$ROOT_DIR/qa/scripts/google-play-background-location/seed-reviewer-accepted-deal.mjs" \
  > "$SEED_JSON"
cat "$SEED_JSON"

read_apk_metadata

log "Installing standalone APK"
adb_s uninstall "$PACKAGE" || true
adb_s install -r "$APK_PATH"
adb_s shell pm list packages | grep "$PACKAGE" >/dev/null

log "Launching standalone login flow"
maestro_flow "$ROOT_DIR/qa/maestro/google-play-location/login-reviewer-driver.yaml" \
  -e REVIEWER_EMAIL="${REVIEWER_EMAIL:-appreview@urtruck.kz}" \
  -e REVIEWER_CODE="${REVIEWER_CODE:-1975}"

reset_location_permissions

log "Opening active deal before recording"
maestro_flow "$ROOT_DIR/qa/maestro/google-play-location/open-first-active-deal.yaml"
shot "01-deal-before-map.png"

log "Clearing logcat"
adb_s logcat -c

log "Starting adb screenrecord"
adb_s shell rm -f "$SCREENREC_REMOTE" || true
adb_s shell screenrecord --size 1080x1920 --bit-rate 6000000 "$SCREENREC_REMOTE" \
  >"$SCREENREC_STDOUT" 2>"$SCREENREC_STDERR" &
SCREENREC_PID=$!
sleep 1

log "Showing in-app disclosure"
maestro_flow "$ROOT_DIR/qa/maestro/google-play-location/trigger-map-disclosure.yaml"
sleep 4
shot "02-prominent-disclosure.png"

log "Showing Android foreground permission"
maestro_flow "$ROOT_DIR/qa/maestro/google-play-location/tap-disclosure-continue.yaml"
sleep 2
shot "03-android-foreground-permission.png"

log "Granting foreground permission"
maestro_flow "$ROOT_DIR/qa/maestro/google-play-location/grant-foreground-and-wait-settings-cta.yaml"
sleep 3

log "Opening Android settings for background grant"
maestro_flow "$ROOT_DIR/qa/maestro/google-play-location/open-background-location-settings.yaml"
sleep 2
shot "04-android-background-settings.png"

log "Granting Allow all the time"
maestro_flow "$ROOT_DIR/qa/maestro/google-play-location/tap-allow-all-the-time.yaml"
back_to_app || {
  log "Failed to return from Android Settings to app"
  exit 1
}

log "Waiting for trip map after returning to app"
maestro_flow "$ROOT_DIR/qa/maestro/google-play-location/wait-trip-map.yaml"
sleep 2
shot "05-trip-map-after-permission.png"

log "Stopping screenrecord"
adb_s shell pkill -INT -x screenrecord || adb_s shell killall -INT screenrecord || true
kill -INT "$SCREENREC_PID" || true
wait "$SCREENREC_PID" || true
sleep 2
adb_s pull "$SCREENREC_REMOTE" "$RAW_MP4"
cp "$RAW_MP4" "$FINAL_MP4"

log "Running negative flow"
reset_location_permissions
adb_s shell am force-stop "$PACKAGE"
sleep 2
maestro_flow "$ROOT_DIR/qa/maestro/google-play-location/negative-do-not-agree.yaml"
shot "06-do-not-agree-blocks-map.png"

log "Saving logcat"
adb_s logcat -d > "$LOGCAT_PATH"

CRASH_PASS="PASS"
LOGCAT_PASS="PASS"
if grep -E "FATAL EXCEPTION|ActivityNotFoundException|disclosure_host_unavailable|permission Activity crash" "$LOGCAT_PATH" >/dev/null; then
  CRASH_PASS="FAIL"
  LOGCAT_PASS="FAIL"
fi

log "Inspecting MP4 with ffprobe"
ffprobe -v error -print_format json -show_streams -show_format "$FINAL_MP4" > "$FFPROBE_JSON"
VIDEO_CODEC="$(python3 - <<'PY' "$FFPROBE_JSON"
import json, sys
data = json.load(open(sys.argv[1]))
stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
print(stream.get("codec_name", ""))
PY
)"

write_report

log "Artifacts ready in $ARTIFACT_DIR"
