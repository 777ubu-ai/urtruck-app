"""Проверить конфигурацию, действительно вложенную в собранный QA2 APK."""
import json
import sys
import zipfile


def main():
    if len(sys.argv) != 4:
        raise SystemExit("Использование: verify_qa2_apk_feed.py APK SOURCE_SHA QA2_API")
    apk, expected_sha, expected_api = sys.argv[1:]
    try:
        with zipfile.ZipFile(apk) as archive:
            config = json.loads(archive.read("assets/app.config"))
        extra = config["extra"]
        assert extra.get("urtruckExternalFreightFeedEnabled") is True
        assert extra.get("urtruckSourceSha") == expected_sha
        assert extra.get("urtruckApiUrl", "").rstrip("/") == expected_api.rstrip("/")
        assert extra.get("urtruckBuildFlavor") == "qa2"
    except (KeyError, ValueError, OSError, zipfile.BadZipFile, AssertionError, AttributeError):
        raise SystemExit("Ошибка: конфигурация QA2 APK не соответствует source, API, flavor или включённой ленте")
    print("Конфигурация вложенного QA2 APK: PASS")


if __name__ == "__main__":
    main()
