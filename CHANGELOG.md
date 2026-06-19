# Changelog

## [1.0.1] - 2026-06-19

Версия: `1.0.1`
Android versionCode: `2`
Теги релиза: `v1.0.1`, `android-build-78`

### Изменено

- Подготовлена Android release-конфигурация для сборки `1.0.1`.
- Синхронизированы публичные версии в `app.json`, `package.json` и `package-lock.json`.
- Добавлены JVM-настройки Gradle для стабильной UTF-8 кодировки при Android-сборках.
- Включен `android.overridePathCheck=true` для совместимости локальной Android-сборки.

### Безопасность

- Убраны hardcoded-пароли и параметры keystore из `android/app/build.gradle`.
- Release-подпись теперь читается из Gradle properties или переменных окружения:
  `URTRUCK_UPLOAD_STORE_FILE`, `URTRUCK_UPLOAD_STORE_PASSWORD`, `URTRUCK_UPLOAD_KEY_ALIAS`, `URTRUCK_UPLOAD_KEY_PASSWORD`.
- Локальные keystore-файлы и Android-артефакты (`.apk`, `.aab`) добавлены в `.gitignore`.
