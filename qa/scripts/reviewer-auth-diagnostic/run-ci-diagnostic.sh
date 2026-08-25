#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ARTIFACT_DIR="${ARTIFACT_DIR:-$ROOT_DIR/qa/artifacts/reviewer-auth-diagnostic}"
FLOW_PATH="${FLOW_PATH:-qa/maestro/google-play-location/login-reviewer-driver.yaml}"
PACKAGE="${PACKAGE:-com.urtruck.app}"
APK_PATH="${APK_PATH:?APK_PATH is required}"
APK_SHA256="${APK_SHA256:?APK_SHA256 is required}"
APK_RUN_ID="${APK_RUN_ID:?APK_RUN_ID is required}"
APK_ARTIFACT_ID="${APK_ARTIFACT_ID:?APK_ARTIFACT_ID is required}"
SOURCE_SHA="${SOURCE_SHA:?SOURCE_SHA is required}"
SERIAL="${SERIAL:-emulator-5554}"
LAUNCHABLE_ACTIVITY="${LAUNCHABLE_ACTIVITY:?LAUNCHABLE_ACTIVITY is required}"
EMULATOR_PROFILE="${EMULATOR_PROFILE:-pixel_7}"
EMULATOR_API="${EMULATOR_API:-34}"
AAPT_BIN="${AAPT_BIN:?AAPT_BIN is required}"
MITM_PORT="${MITM_PORT:-8081}"
MITM_EVENTS_JSONL="$ARTIFACT_DIR/mitm-events.jsonl"
MITM_STDOUT="$ARTIFACT_DIR/mitmproxy.stdout.log"
MITM_STDERR="$ARTIFACT_DIR/mitmproxy.stderr.log"
FULL_LOGCAT="$ARTIFACT_DIR/full-logcat.txt"
MAESTRO_STDOUT="$ARTIFACT_DIR/maestro.stdout.log"
MAESTRO_STDERR="$ARTIFACT_DIR/maestro.stderr.log"
SUMMARY_JSON="$ARTIFACT_DIR/summary.json"
SUMMARY_MD="$ARTIFACT_DIR/SUMMARY.md"
CHECKPOINT_ROOT="$ARTIFACT_DIR/checkpoints"

mkdir -p "$ARTIFACT_DIR" "$CHECKPOINT_ROOT"
: > "$MITM_EVENTS_JSONL"
: > "$MAESTRO_STDOUT"
: > "$MAESTRO_STDERR"
: > "$FULL_LOGCAT"

log() {
  printf '[reviewer-auth-diag] %s\n' "$*"
}

adb_s() {
  adb -s "$SERIAL" "$@"
}

cleanup() {
  set +e
  if [[ -n "${LOGCAT_PID:-}" ]]; then
    kill "$LOGCAT_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${MITM_PID:-}" ]]; then
    kill "$MITM_PID" >/dev/null 2>&1 || true
  fi
  adb_s shell settings put global http_proxy :0 >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for_boot() {
  adb_s wait-for-device
  local tries=0
  until [[ "$(adb_s shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    tries=$((tries + 1))
    if [[ "$tries" -gt 120 ]]; then
      log "Emulator did not finish booting in time"
      exit 1
    fi
    sleep 2
  done
}

capture_logcat_slice() {
  local dest="$1"
  if ! rg -N "($PACKAGE|ReactNativeJS|REVIEWER_DIAG|PhoneV2|OtpV2|email/send|register/email/send)" "$FULL_LOGCAT" > "$dest" 2>/dev/null; then
    tail -n 400 "$FULL_LOGCAT" > "$dest" || true
  fi
}

capture_checkpoint() {
  local name="$1"
  local dir="$CHECKPOINT_ROOT/$name"
  mkdir -p "$dir"

  adb_s exec-out screencap -p > "$dir/screenshot.png" || true
  adb_s exec-out uiautomator dump /dev/tty > "$dir/ui.xml" || true
  adb_s shell dumpsys activity activities > "$dir/dumpsys-activity.txt" || true
  {
    echo "pid=$(adb_s shell pidof -s "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
    adb_s shell ps -A | grep "$PACKAGE" || true
  } > "$dir/process-state.txt"
  capture_logcat_slice "$dir/logcat.txt"
  cp "$MAESTRO_STDOUT" "$dir/maestro.stdout.log" || true
  cp "$MAESTRO_STDERR" "$dir/maestro.stderr.log" || true
}

start_logcat() {
  adb_s logcat -c
  adb_s logcat -v threadtime > "$FULL_LOGCAT" 2>&1 &
  LOGCAT_PID=$!
}

start_mitm() {
  log "Starting mitmproxy capture"
  MITM_EVENTS_JSONL="$MITM_EVENTS_JSONL" \
    mitmdump --listen-host 0.0.0.0 --listen-port "$MITM_PORT" \
    -s "$ROOT_DIR/qa/scripts/reviewer-auth-diagnostic/capture_email_send.py" \
    >"$MITM_STDOUT" 2>"$MITM_STDERR" &
  MITM_PID=$!
  sleep 3
}

install_mitm_ca_if_possible() {
  local cert="$HOME/.mitmproxy/mitmproxy-ca-cert.cer"
  local hash_name

  if [[ ! -f "$cert" ]]; then
    log "mitmproxy CA not found"
    return 1
  fi

  if ! adb root >/dev/null 2>&1; then
    log "adb root unavailable"
    return 1
  fi

  adb wait-for-device
  adb remount >/dev/null 2>&1 || true
  hash_name="$(openssl x509 -inform PEM -subject_hash_old -in "$cert" | head -n 1).0"
  cp "$cert" "$ARTIFACT_DIR/$hash_name"
  adb push "$ARTIFACT_DIR/$hash_name" "/system/etc/security/cacerts/$hash_name" >/dev/null
  adb shell chmod 644 "/system/etc/security/cacerts/$hash_name"
  adb reboot
  adb wait-for-device
  wait_for_boot
  return 0
}

configure_proxy() {
  adb_s shell settings put global http_proxy "10.0.2.2:$MITM_PORT"
}

run_adb_stability_probe() {
  local ok="YES"
  local log_file="$ARTIFACT_DIR/adb-stability.txt"
  : > "$log_file"
  for attempt in 1 2 3 4 5; do
    {
      echo "probe=$attempt"
      adb_s get-state
      adb_s shell getprop sys.boot_completed
      adb_s shell pidof -s system_server
    } >> "$log_file" 2>&1 || ok="NO"
    sleep 1
  done
  echo "$ok"
}

verify_exact_apk() {
  local actual_sha
  actual_sha="$(sha256sum "$APK_PATH" | awk '{print $1}')"
  if [[ "$actual_sha" != "$APK_SHA256" ]]; then
    echo "FAIL"
    return 1
  fi
  echo "PASS"
}

verify_install_and_launch() {
  adb_s uninstall "$PACKAGE" >/dev/null 2>&1 || true
  adb_s install -r "$APK_PATH"
  adb_s shell pm list packages | grep -q "$PACKAGE"
  adb_s shell cmd package resolve-activity --brief "$PACKAGE" > "$ARTIFACT_DIR/resolve-activity.txt"
  adb_s shell am force-stop "$PACKAGE"
  adb_s shell am start -W -n "$PACKAGE/$LAUNCHABLE_ACTIVITY" > "$ARTIFACT_DIR/cold-launch.txt"
}

parse_json_field() {
  local file="$1"
  local expr="$2"
  python3 - "$file" "$expr" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
expr = sys.argv[2]
print(data.get(expr, ''))
PY
}

summarize() {
  local adb_stable="$1"
  local apk_hash="$2"
  local tap_handled="NO"
  local email_send_called="NO"
  local http_result="NO_RESPONSE"
  local navigation_fired="NO"
  local otp_screen_mounted="NO"
  local otp_input_present="NO"
  local first_breakpoint="UNKNOWN"
  local klass="UNKNOWN"
  local pre_xml="$CHECKPOINT_ROOT/pre_tap/ui.xml"
  local post_xml="$CHECKPOINT_ROOT/tplus_350ms/ui.xml"
  local late_xml="$CHECKPOINT_ROOT/tplus_2500ms/ui.xml"

  if [[ -f "$MITM_EVENTS_JSONL" ]] && rg -q '"kind": "request"' "$MITM_EVENTS_JSONL"; then
    email_send_called="YES"
  fi

  if [[ -f "$MITM_EVENTS_JSONL" ]]; then
    http_result="$(python3 - "$MITM_EVENTS_JSONL" <<'PY'
import json, sys
result = "NO_RESPONSE"
with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    for line in fh:
        try:
            event = json.loads(line)
        except Exception:
            continue
        if event.get('kind') == 'response':
            result = str(event.get('status_code', 'NO_RESPONSE'))
print(result)
PY
)"
  fi

  if [[ -f "$late_xml" ]] && rg -q 'resource-id="[^"]*otp-v2-screen"|content-desc="otp-v2-screen"|text="otp-v2-screen"' "$late_xml"; then
    otp_screen_mounted="YES"
  fi
  if [[ -f "$late_xml" ]] && rg -q 'otp-v2-input' "$late_xml"; then
    otp_input_present="YES"
  fi

  if [[ "$otp_screen_mounted" == "YES" || "$otp_input_present" == "YES" ]]; then
    navigation_fired="YES"
  fi

  if [[ "$email_send_called" == "YES" || "$navigation_fired" == "YES" ]]; then
    tap_handled="YES"
  elif [[ -f "$pre_xml" && -f "$post_xml" ]] && ! cmp -s "$pre_xml" "$post_xml"; then
    tap_handled="YES"
  fi

  if [[ "$adb_stable" != "YES" ]]; then
    first_breakpoint="adb stability"
    klass="ENVIRONMENT"
  elif [[ "$apk_hash" != "PASS" ]]; then
    first_breakpoint="exact APK hash"
    klass="HARNESS"
  elif [[ "$tap_handled" != "YES" ]]; then
    first_breakpoint="phone-v2-cta tap"
    klass="HARNESS"
  elif [[ "$email_send_called" != "YES" ]]; then
    first_breakpoint="client email/send request"
    klass="PRODUCT/INTEGRATION"
  elif [[ "$http_result" == "200" || "$http_result" == "201" || "$http_result" == "204" ]] && [[ "$navigation_fired" != "YES" ]]; then
    first_breakpoint="post-send navigation"
    klass="PRODUCT"
  elif [[ "$navigation_fired" == "YES" && "$otp_screen_mounted" == "YES" && "$otp_input_present" != "YES" ]]; then
    first_breakpoint="otp-v2-input visibility"
    klass="HARNESS"
  else
    first_breakpoint="undetermined"
    klass="UNKNOWN"
  fi

  cat > "$SUMMARY_JSON" <<EOF
{
  "CI adb stable": "$adb_stable",
  "exact APK hash": "$apk_hash",
  "tap handled": "$tap_handled",
  "email/send called": "$email_send_called",
  "HTTP result": "$http_result",
  "navigation fired": "$navigation_fired",
  "OtpV2Screen mounted": "$otp_screen_mounted",
  "otp-v2-input present": "$otp_input_present",
  "FIRST BREAKPOINT": "$first_breakpoint",
  "CLASS": "$klass",
  "SOURCE_SHA": "$SOURCE_SHA",
  "APK_RUN_ID": "$APK_RUN_ID",
  "APK_ARTIFACT_ID": "$APK_ARTIFACT_ID",
  "APK_SHA256": "$APK_SHA256",
  "PACKAGE": "$PACKAGE",
  "workflow_run_id": "${GITHUB_RUN_ID:-unknown}",
  "emulator_model": "$EMULATOR_PROFILE",
  "emulator_api": "$EMULATOR_API"
}
EOF

  cat > "$SUMMARY_MD" <<EOF
CI adb stable = $adb_stable
exact APK hash = $apk_hash
tap handled = $tap_handled
email/send called = $email_send_called
HTTP result = $http_result
navigation fired = $navigation_fired
OtpV2Screen mounted = $otp_screen_mounted
otp-v2-input present = $otp_input_present
FIRST BREAKPOINT = $first_breakpoint
CLASS = $klass
PR REQUIRED = YES
NEXT FIFO STEP = merge focused QA/CI PR and rerun this exact diagnostic workflow on main
EOF
}

log "Waiting for emulator boot"
wait_for_boot
start_mitm
MITM_CA_READY="NO"
if install_mitm_ca_if_possible; then
  MITM_CA_READY="YES"
fi
configure_proxy || true

ADB_STABLE="NO"
if [[ "$(run_adb_stability_probe)" == "YES" ]]; then
  ADB_STABLE="YES"
fi

APK_HASH="FAIL"
if verify_exact_apk >/dev/null; then
  APK_HASH="PASS"
fi

verify_install_and_launch
start_logcat

capture_checkpoint "pre_install_launch"

log "Running reviewer login Maestro flow"
std_buf_cmd=(stdbuf -oL -eL maestro test "$FLOW_PATH" --device "$SERIAL" --format NOOP)
"${std_buf_cmd[@]}" >"$MAESTRO_STDOUT" 2>"$MAESTRO_STDERR" &
MAESTRO_PID=$!

POST_TAP_CAPTURED="NO"
while kill -0 "$MAESTRO_PID" >/dev/null 2>&1; do
  if [[ ! -f "$CHECKPOINT_ROOT/pre_tap/screenshot.png" ]] && rg -q 'REVIEWER_DIAG_MARKER=pre_tap' "$MAESTRO_STDOUT" 2>/dev/null; then
    capture_checkpoint "pre_tap"
  fi
  if [[ "$POST_TAP_CAPTURED" == "NO" ]] && rg -q 'REVIEWER_DIAG_MARKER=after_tap' "$MAESTRO_STDOUT" 2>/dev/null; then
    sleep 0.35
    capture_checkpoint "tplus_350ms"
    sleep 2.15
    capture_checkpoint "tplus_2500ms"
    POST_TAP_CAPTURED="YES"
  fi
  sleep 0.2
done

set +e
wait "$MAESTRO_PID"
MAESTRO_RC=$?
set -e

capture_checkpoint "final"
summarize "$ADB_STABLE" "$APK_HASH"

if [[ "$MAESTRO_RC" -ne 0 ]]; then
  exit "$MAESTRO_RC"
fi
