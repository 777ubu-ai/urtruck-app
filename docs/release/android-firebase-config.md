# Android Firebase/FCM build configuration — инцидент и фикс (26.08.2026)

## Root cause

Android push уведомления в UrTruck никогда не доходили до реальных
устройств (`GET /api/v1/push/info` стабильно показывал `native_android=0`
при `native_ios` > 0), потому что **релизная Android-сборка никогда не
содержала реальной Firebase-конфигурации**:

- В корне репозитория лежал закоммиченный `google-services.json`, но он
  принадлежал **чужому** Firebase-проекту `bizchat-4d11d` (не UrTruck) —
  случайный leftover от другого проекта, который просто совпал по
  `package_name: com.urtruck.app`.
- Ни `android/build.gradle`, ни `android/app/build.gradle` не подключали
  Gradle-плагин `com.google.gms.google-services` — то есть даже если бы
  файл был правильным, он бы никогда не был обработан в реальный
  `google_app_id`/`gcm_defaultSenderId` в собранном APK/AAB.
- `app.json` (`expo.android`) не указывал `googleServicesFile` — Expo
  config-plugin, который при `expo prebuild` сам копирует файл в
  `android/app/google-services.json` и подключает плагин, ничего не делал.

Это подтверждено на уровне **реального собранного артефакта** (не только
исходников): у `expo-notifications` есть собственный `AndroidManifest.xml`,
который мерджится в финальный манифест и добавляет `POST_NOTIFICATIONS` +
`ExpoFirebaseMessagingService` — то есть на уровне permissions/компонентов
всё было готово, но без реального Firebase-проекта `FirebaseApp` не имел
runtime-конфигурации для инициализации, и токен FCM в принципе не мог быть
получен.

## Почему это осталось незамеченным

Два независимых Android-релизных пути в CI собирают приложение по-разному:

- **`build-android-apk.yml`** — гоняет `expo prebuild --platform android
  --clean` перед сборкой, то есть каждый раз генерирует `android/` заново
  из `app.json`/Expo config-plugins.
- **`deploy-play.yml`** — собирает **закоммиченный** `android/` напрямую
  через `./gradlew bundleRelease`, **никогда не запуская prebuild** (это
  сознательно — иначе Expo-шаблонный `build.gradle` уничтожил бы вручную
  настроенный `signingConfigs.release`, читающий
  `ORG_GRADLE_PROJECT_URTRUCK_UPLOAD_*`).

Ни один из двух путей не проверял (а) что Firebase-конфиг вообще
принадлежит правильному проекту, (б) что плагин Google Services реально
подключён, (в) что итоговый билд содержит настоящие Firebase runtime
ресурсы. Ошибка молча проходила оба пути.

## Canonical source-of-truth

Один канонический механизм для ОБОИХ путей, без двух конкурирующих схем:

- **Секрет**: `ANDROID_GOOGLE_SERVICES_JSON_BASE64` (репозиторный GitHub
  Secret) — `base64 -w0 google-services.json` реального Firebase Android
  app для `com.urtruck.app` в правильном UrTruck Firebase-проекте.
- **`app.json`**: `expo.android.googleServicesFile: "./google-services.json"`
  — Expo config-plugin сам копирует файл в `android/app/google-services.json`
  и подключает плагин при `expo prebuild`. Это управляет путём
  `build-android-apk.yml`.
- **`android/build.gradle`** / **`android/app/build.gradle`**: плагин
  `com.google.gms:google-services` подключён напрямую и **условно**
  (`if (file("google-services.json").exists()) { apply plugin: ... }`) —
  так что:
  - `deploy-play.yml` (без prebuild) получает плагин, положив файл прямо в
    `android/app/google-services.json` перед сборкой;
  - любой contributor, у которого нет секрета (`./gradlew assembleDebug`
    локально), не ломает сборку — плагин просто не применяется.
- Реальный `google-services.json` **никогда не коммитится** — в
  `.gitignore` добавлены `/google-services.json` и
  `/android/app/google-services.json`. Оба CI-пути материализуют файл из
  секрета непосредственно перед использованием и никогда не печатают его
  содержимое.

Файл `google-services.json`, принадлежавший проекту `bizchat-4d11d`, удалён
из репозитория (`git rm`) в этом же изменении — это тот самый leftover,
который вызвал инцидент.

## Fail-closed CI guard

`scripts/verify_android_firebase_config.py` вызывается в обоих workflow на
трёх стадиях и **падает громко**, если что-то не так — не просто
«файл существует», а именно правильный проект/пакет:

1. `--check-source <path>` — до/во время материализации файла из секрета:
   валидный JSON, `project_info.project_id` НЕ входит в
   `KNOWN_BAD_PROJECT_IDS` (сейчас там `bizchat-4d11d`), среди
   `client[].client_info.android_client_info.package_name` есть
   `com.urtruck.app`.
2. `--check-plugin <android-dir>` — после `expo prebuild` (APK-путь) или
   сразу после материализации файла (AAB-путь, где `android/` уже
   закоммичен): classpath в корневом `build.gradle` и `apply plugin` в
   `app/build.gradle` реально присутствуют.
3. `--check-resources <app-build-dir>` — после Gradle-сборки: в реально
   сгенерированных build-ресурсах присутствуют строки `google_app_id` и
   `gcm_defaultSenderId` — доказательство, что плагин не просто
   синтаксически применился, а обработал настоящий конфиг.

Если секрет `ANDROID_GOOGLE_SERVICES_JSON_BASE64` не задан — оба workflow
падают на первом же шаге с `::error::`, а не собирают Android-релиз без
push.

## Что это НЕ доказывает

Этот фикс закрывает **build-time конфигурацию**. Он не доказывает и не
может доказать реальную доставку push на физическое Android-устройство —
для этого нужен настоящий телефон: установить собранный APK/AAB, пройти
runtime permission → получить нативный FCM-токен → убедиться, что бэкенд
видит `native_android >= 1` в `/api/v1/push/info` → выполнить реальный
push driver↔shipper. До этого момента `ANDROID_REAL_DELIVERY = NOT PROVEN`
остаётся в силе независимо от того, что показывает CI.

## Связанные документы

- `SECURITY_ARCHITECTURE.md`, `backend/MVP_SETUP.md` — общая архитектура
  push/verification.
- GitHub issue #262 — control plane автономной релизной работы, включая
  чекпоинты по этому инциденту.
