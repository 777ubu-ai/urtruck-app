# RELEASE_SIGNING.md — подпись Android-релизов (UrTruck)

Документ создан после инцидента: Google Play Console отклонял `.aab`, т.к. бандл
подписывался **не тем ключом**. Здесь — причина, исправление и правила на будущее.

## 🔴 Корневая причина (подтверждена аудитом)

`android/app/build.gradle` содержал:
```gradle
release {
    signingConfig signingConfigs.debug   // ← релиз подписывался DEBUG-ключом
}
```
То есть релизный `.aab` подписывался **стандартным Android debug-ключом**, который
одинаков у всех разработчиков и никогда не совпадёт с Upload key в Google Play.

**Отпечатки debug-ключа (это «неправильный» ключ, которым подписывался релиз):**
- Alias: `androiddebugkey`, Owner: `CN=Android Debug`
- SHA-1: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
- SHA-256: `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`

Правильный keystore в репозитории есть — `keystore/urtruck-release.keystore` — но
Gradle его **не использовал**.

## 📌 Фактические отпечатки и статус (обновлено 2026-07-05)

На проекте существуют **два кандидата на upload-ключ**, и «правильный» из них
определяется **только эталоном Upload key из Play Console** (см. ниже):

**1) Keystore, которым подписывает EAS** (`eas credentials -p android`,
Build Credentials `Bc3SldLONR`, default — используется при `eas build`):
- Type: JKS, Key Alias: `3079ff4a234ca93cda8a355212793892`
- SHA-1:   `07:D0:4D:1E:27:C9:EE:DC:9C:EE:D1:0D:D7:65:E4:D4:54:8E:4C:C8`
- SHA-256: `F8:15:CC:F3:BF:E1:A2:17:58:F9:5B:FC:C9:49:CE:B5:FE:35:75:BB:8E:47:0D:8B:1C:E1:C1:CF:FF:56:4A:53`

**2) Локальный keystore** `keystore/urtruck-release.keystore`
- Alias/SHA-1/SHA-256: _заполнить после того, как владелец даст store/key-пароль и alias_
  (`keytool -list -v -keystore keystore/urtruck-release.keystore -alias <ALIAS>`).

**Путь сборки:** на машине разработчика установлена только **JDK 26**, а Gradle-wrapper
8.10.2 её не поддерживает → локальный `./gradlew bundleRelease` не соберётся. Прод-`.aab`
собираем через **EAS** (`eas build -p android --profile production`, тип `app-bundle`),
он подписывает keystore-ом `Bc3SldLONR` (SHA-1 `07:D0…`).

**Решение по сверке с Play Upload key:**
- Upload key == `07:D0:4D…:4C:C8` → EAS-сборка уже подписана верно, ничего больше не нужно.
- Upload key == локального keystore → загрузить локальный keystore в EAS
  (`eas credentials -p android` → Keystore → Upload) и пересобрать, либо собрать локально.
- Не совпал ни один → Play Console → *Request upload key reset* (см. раздел ниже).

## ✅ Что исправлено в коде

1. В `signingConfigs` добавлен блок `release`, читающий путь/пароли из свойств
   `URTRUCK_UPLOAD_*` (без хардкода секретов).
2. `buildTypes.release.signingConfig` теперь = `signingConfigs.release`, если свойства
   заданы; иначе безопасный фолбэк на `debug` (чтобы dev-сборки не падали).
3. В `android/gradle.properties` — плейсхолдеры-комментарии (без реальных паролей).

## 🔑 Как настроить подпись (на машине сборки)

Реальные значения — **только в `~/.gradle/gradle.properties`** (вне репозитория):
```properties
URTRUCK_UPLOAD_STORE_FILE=/абсолютный/путь/keystore/urtruck-release.keystore
URTRUCK_UPLOAD_STORE_PASSWORD=***
URTRUCK_UPLOAD_KEY_ALIAS=***
URTRUCK_UPLOAD_KEY_PASSWORD=***
```

## 🧭 Порядок устранения несовпадения (сделать на Mac с доступом к Play/EAS)

1. **Эталон из Play Console** → App integrity → App signing: записать SHA-1/SHA-256
   **Upload key** и **App signing key**.
2. **Отпечаток нашего keystore:**
   ```
   keytool -list -v -keystore keystore/urtruck-release.keystore -alias <ALIAS>
   ```
   Сверить SHA-1/256 с **Upload key** из Play.
3. **Путь сборки:**
   - **Локально (gradle):** задать `URTRUCK_UPLOAD_*` в `~/.gradle/gradle.properties`,
     собрать `./gradlew bundleRelease`.
   - **EAS:** `eas credentials -p android` — сверить keystore EAS с Upload key Play;
     при несовпадении загрузить правильный keystore в EAS.
4. **Если Upload key совпал** → просто пересобрать (см. ниже).
5. **Если ни один keystore не совпадает (upload key утерян):**
   Play Console → *Request upload key reset* → сгенерировать новый keystore, выгрузить
   PEM и отправить в Google (см. команды).

## 🛠 Команды

```bash
# отпечатки keystore
keytool -list -v -keystore keystore/urtruck-release.keystore -alias <ALIAS>

# PEM (upload certificate) из keystore — для регистрации/reset в Play
keytool -export -rfc -keystore keystore/urtruck-release.keystore -alias <ALIAS> -file upload_certificate.pem
keytool -printcert -file upload_certificate.pem

# проверить подпись готового бандла
jarsigner -verify -verbose -certs app-release.aab
```

## 🏗 Сборка релизной AAB

- **EAS:** `eas build -p android --profile production`
- **Локально:** `cd android && ./gradlew bundleRelease`
  (артефакт: `android/app/build/outputs/bundle/release/app-release.aab`)

После сборки сверить SHA-1/256 бандла с Upload key в Play — должны совпасть.

## ⚠️ Security (обязательно к исправлению)

- `keystore/urtruck-release.keystore` **закоммичен в git, а репозиторий публичный** →
  keystore скомпрометирован. После восстановления релизов:
  1) сделать **reset Upload Key** в Play Console новым ключом;
  2) убрать keystore из репозитория и хранить его вне git (менеджер секретов/бэкап);
  3) добавить `*.keystore`/`*.jks` в `.gitignore` (guard уже добавлен для будущих файлов).
- Пароли подписи — никогда в git. Только `~/.gradle/gradle.properties` или EAS credentials.

## 🚫 Что нельзя менять без согласования

- Alias и сам upload/app-signing key (смена ломает обновления в Play).
- `applicationId` / `package` (`com.urtruck.app`).
- `signingConfig` релиза — только через свойства `URTRUCK_UPLOAD_*`, не хардкодом.
