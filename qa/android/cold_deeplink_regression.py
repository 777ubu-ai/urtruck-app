"""Проверка сохранённой Android-задачи без удаления приложения и его данных."""
import argparse
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path


def workspace_state(raw, marker, package="com.urtruck.app.qa2"):
    nodes = list(ET.fromstring(raw).iter("node"))
    ids = {n.get("resource-id", "") for n in nodes}
    return {
        "workspace": "deal-workspace-back" in ids,
        "expected_marker": bool(marker) and any(marker in (n.get("text", "") + n.get("content-desc", "")) for n in nodes),
        "root_screen": bool(ids & {"cargo-screen", "my-work-screen", "client-feed-screen"}),
        "app_nodes": sum(n.get("package") == package for n in nodes),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--expected-version", required=True, type=int)
    parser.add_argument("--expected-marker", required=True, help="Уникальная контрольная надпись запрошенного чата, сверенная с QA2")
    args = parser.parse_args()
    if not args.url.startswith("urtruck://chats/"):
        parser.error("Нужна ссылка на существующий контролируемый QA2-чат")
    if not args.expected_marker.strip():
        parser.error("Нельзя подтвердить правильный чат без контрольной надписи")
    package = "com.urtruck.app.qa2"
    component = package + "/.MainActivity"
    args.evidence.mkdir(parents=True, exist_ok=False, mode=0o700)

    def adb(*parts):
        return subprocess.run(["adb", "-s", args.serial, *parts], capture_output=True, check=True, timeout=45).stdout

    def pid():
        result = subprocess.run(["adb", "-s", args.serial, "shell", "pidof", package], capture_output=True, timeout=10)
        return result.stdout.decode().strip()

    def snapshot(name):
        result = adb("shell", "uiautomator", "dump", "/sdcard/urtruck-cold-test.xml")
        if b"UI hier" not in result:
            raise RuntimeError("Диагностика не получила дерево UI; это не доказательство падения приложения")
        raw = adb("exec-out", "cat", "/sdcard/urtruck-cold-test.xml")
        (args.evidence / (name + ".xml")).write_bytes(raw)
        (args.evidence / (name + ".png")).write_bytes(adb("exec-out", "screencap", "-p"))
        return workspace_state(raw, args.expected_marker, package)

    version = re.search(rb"versionCode=(\d+)", adb("shell", "dumpsys", "package", package))
    if not version or int(version[1]) != args.expected_version:
        raise RuntimeError("Установлена другая версия; тест не выполнялся")
    adb("shell", "input", "keyevent", "KEYCODE_WAKEUP")
    # Нужна именно старая задача с launcher Intent. Force-stop не очищает данные;
    # сразу запускаем приложение, чтобы не оставлять его в stopped-состоянии.
    adb("shell", "am", "force-stop", package)
    adb("shell", "am", "start", "-W", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", "-n", component)
    time.sleep(4)
    before = snapshot("launcher-before")
    if not before["root_screen"] or before["workspace"]:
        raise RuntimeError("Launcher не открыл исходный основной экран: предусловие холодного теста не выполнено")
    old_pid = pid()
    adb("shell", "input", "keyevent", "KEYCODE_HOME")
    time.sleep(1)
    for _ in range(10):
        adb("shell", "am", "kill", "--user", "0", package)
        time.sleep(0.5)
        if not pid():
            break
    if pid():
        raise RuntimeError("Процесс не завершился: холодный запуск не подтверждён")
    launch = adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-c", "android.intent.category.BROWSABLE", "-f", "0x10000000", "-d", args.url, "-n", component)
    # URI остаётся только в приватном локальном доказательстве.
    (args.evidence / "launch-private.log").write_bytes(launch)
    states = []
    for attempt in range(5):
        states.append(snapshot("cold-link-" + str(attempt)))
        if states[-1]["workspace"] and states[-1]["expected_marker"]:
            break
        time.sleep(2)
    result = {
        "version_code": args.expected_version,
        "process_absent_before_launch": True,
        "old_pid": old_pid,
        "new_pid": pid(),
        "cold_link": "PASS" if states[-1]["workspace"] and states[-1]["expected_marker"] else "FAIL",
        "states": states,
    }
    if result["cold_link"] == "PASS":
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(1)
        after = snapshot("after-back")
        result["system_back"] = "PASS" if after["app_nodes"] and not after["workspace"] else "FAIL"
    (args.evidence / "summary.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({k: v for k, v in result.items() if k not in ("states", "old_pid", "new_pid")}, ensure_ascii=False))
    return 0 if result["cold_link"] == "PASS" and result.get("system_back") == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
