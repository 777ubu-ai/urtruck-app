# App Store Connect submission — гайд по 3 блокерам

Это документация. Никакого кода/конфига здесь не правится. Все правки конфигов (`app.json`, `eas.json`) — **только после твоего отдельного OK**.

Контекст: версия 1.0.0, бандл `com.urtruck.app`, ASC App ID **не задан** в `eas.json` (`REPLACE_WITH_APP_STORE_CONNECT_APP_ID`), Display Name пустой, скриншоты не подходят по разрешению, в Xcode 375 warnings (все из чужого кода).

---

## Блокер 1 — Скриншоты для App Store

### Что Apple требует

ASC показал две красные ошибки. Ниже — официальные требования (Apple App Store Connect Help, 2025):

| Категория | Размер скриншотов | Где такой экран | Сколько нужно |
|---|---|---|---|
| **6.9" iPhone** (Pro Max последних) | **1290 × 2796** или 2796 × 1290 | iPhone 17 Pro Max, 16 Pro Max, 15 Pro Max | 1 набор обязателен (3-10 шт.) |
| **6.5" iPhone** (старые Plus/Max) | **1242 × 2688** или 2688 × 1242, или **1284 × 2778** или 2778 × 1284 | iPhone XS Max, 11 Pro Max, 12 Pro Max, 13 Pro Max, 14 Plus | 1 набор обязателен |
| **6.3" iPhone** (новый стандартный Pro) | **1206 × 2622** или 2622 × 1206, или **1179 × 2556** или 2556 × 1179 | iPhone 15, 16, 17 Pro | 1 набор обязателен |
| **5.5" iPhone** | 1242 × 2208 | iPhone 8 Plus | **уже не обязателен** (был до 2024) |
| iPad Pro 12.9" | 2048 × 2732 или 2732 × 2048 | если ты выбрал iPad как destination | у тебя в `app.json` `supportsTablet: false` → не нужны |

**Минимум для 1.0:** 3-10 скриншотов на каждое из 3 размеров = **минимум 9 PNG**, максимум 30.

### Как снять — самый быстрый путь (Xcode Simulator на твоём Mac)

1. **Открой в Xcode** ту же сборку, что у тебя сейчас (`stage48-otp-honest-response`).
2. **Поменяй конфигурацию на Release** (важно — иначе в правом верхнем углу будет watermark «UrTruck (Debug)»):
   - Product → Scheme → Edit Scheme… → **Run** → Build Configuration → **Release**
   - (Это локально, не коммитится)
3. **Выбери симулятор нужного размера** в верхней панели Xcode:
   - Для 6.9": **iPhone 17 Pro Max** (или 16 Pro Max)
   - Для 6.5": **iPhone 14 Plus** (или 13 Pro Max)
   - Для 6.3": **iPhone 17 Pro** (или 15 Pro)
4. **Запусти Cmd+R**. Подожди пока приложение откроется в симуляторе.
5. **Пройди по экранам**, которые хочешь показать в App Store. Рекомендую **8 экранов**:
   - Splash + Onboarding (опционально)
   - **Лента грузов** (с двумя-тремя реальными карточками)
   - **Карточка груза** (CargoDetail) с фото
   - **Профиль водителя** (DriverDetail) с рейтингом
   - **Чат** с парой сообщений
   - **Регистрация** (тот шаг, где имя/город)
   - **Создание груза** (форма частично заполнена)
   - **Опции на выбор** (Statistics / SecurityScreen / etc.)
6. **На каждом экране** — `Cmd + S` (или меню симулятора **File → Save Screen**). PNG падает на Desktop с правильным разрешением для выбранного устройства.
7. **Залить в ASC**: на той же странице, что у тебя на скриншоте — кнопка **«Выбрать файл»**. Перетащи 8 PNG в верхний прямоугольник 6.5" → потом то же для 6.3" → потом 6.9".

### Альтернатива — fastlane snapshot

Если экранов много и ты захочешь автоматизировать на 1.1 / 1.2 — `fastlane snapshot` сам прогонит UI-тесты на разных симуляторах и снимет PNG-ы. Для 1.0 это overkill.

### Проверь перед загрузкой

```bash
# на Mac, в папке со скриншотами:
sips -g pixelWidth -g pixelHeight screenshot.png
```

Если получаешь `pixelWidth: 1290 / pixelHeight: 2796` — годится для 6.9".

---

## Блокер 2 — Display Name пустой

### Что увидел Xcode

В `Identity → Display Name` пусто, бандл `com.urtruck.app`. Это значит: **под иконкой на iPhone не будет никакой подписи**, App Store Review **отклонит** (Guideline 2.3.7 — Accurate Metadata).

### Откуда это берётся

В Expo managed workflow за `Display Name` отвечает `app.json`:

```json
{
  "expo": {
    "name": "UrTruck",        // ← ЭТО становится CFBundleDisplayName
    "slug": "urtruck",
    "version": "1.0.0",
    ...
  }
}
```

Я **прочитал** твой текущий `app.json` — там **есть** `"name": "UrTruck"`. То есть Expo своё дело сделал.

**Тогда почему пусто в Xcode?** Три вероятных причины:

1. **Сборка делалась до того**, как `name` поправили в `app.json`. Тогда в `Info.plist` (внутри `UrTruck.xcodeproj`) лежит старое значение / пустота. Решается **rebuild через `expo prebuild --clean`** или новой EAS-сборкой.
2. **`expo prebuild`** не запускался после правки `app.json`. То же решение.
3. **Native `Info.plist`** был отредактирован вручную и затёр Expo-значение. Решается ручной правкой `UrTruck/Info.plist` → `CFBundleDisplayName = UrTruck`.

### Что делать

**Не локально в Xcode**, а через нормальную сборку:

```bash
# на Mac, не на сервере
cd ~/path/to/urtruck-app
git checkout release/appstore-rc1
npm install
npx expo prebuild --clean --platform ios
# проверить:
grep -A1 CFBundleDisplayName ios/UrTruck/Info.plist
# должно показать <string>UrTruck</string>
```

Затем **EAS-сборка** (под запрет, делаешь ты):

```bash
eas build --platform ios --profile production
```

⚠ **Я этого делать не могу** — нет доступа к EAS-аккаунту и к Mac.

### Если очень хочется локально

В Xcode можно открыть `Identity → Display Name` и просто **вписать `UrTruck`** руками. Сохранится в `Info.plist` коммитом (если у тебя `ios/` под git). Но это native правка → **под запретом** до твоего OK.

---

## Блокер 3 — `eas.json` `ascAppId` пустой

В `eas.json:33` стоит:

```json
"submit": {
  "production": {
    "ios": {
      "ascAppId": "REPLACE_WITH_APP_STORE_CONNECT_APP_ID"
    }
  }
}
```

Без правильного `ascAppId` команда `eas submit --platform ios --profile production` упадёт.

### Где взять

1. App Store Connect → **My Apps** → выбрать UrTruck
2. **App Information** → внизу строка **Apple ID** (это число, ~10 цифр, например `6764504167`)
3. Скопировать в `eas.json` вместо плейсхолдера

### Почему я не делаю

`eas.json` — **под запретом** до твоего отдельного OK. Это однострочная правка. Когда дашь добро — делаю в две минуты.

---

## Что насчёт 375 Xcode warnings

См. предыдущий отчёт в чате: **наших native-файлов в репо нет**, все warnings из `Pods/` и `node_modules/expo-modules/`. Apple App Store Review **их игнорирует**. Чинить нельзя без патча чужого кода или Expo SDK upgrade — оба варианта хуже самой проблемы.

**Действий не требуется.**

---

## Чек-лист перед App Store submission

- [ ] **Скриншоты 6.9" / 6.5" / 6.3"** залиты в ASC Media Manager (минимум 3 размера × 3 PNG)
- [ ] **Display Name** = `UrTruck` (проверить через `expo prebuild --clean`)
- [ ] `eas.json` → `ascAppId` заменить на реальный (с твоим OK)
- [ ] **Privacy strings** есть в `app.json` (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`) — **уже OK** ✅
- [ ] **Bundle ID** = `com.urtruck.app` — **уже OK** ✅
- [ ] **App Store metadata** в ASC: описание, категория (Travel или Business), keywords, support URL, privacy URL — заполняется в ASC, не в коде
- [ ] **Privacy Policy URL** в ASC — у тебя должен быть `urtruck.kz/privacy.html` (видел в `web/legal/privacy.html` в `package.json` build:web)
- [ ] **TestFlight build** прошёл review — т.е. внутреннее тестирование выявило 0 крашей перед production submission
- [ ] **Что не блокирует:** 375 Xcode warnings — игнорировать

---

## Что мне сейчас разрешено / запрещено

| Действие | Статус |
|---|---|
| Документация (`*.md`) в QA-ветку | ✅ можно |
| JS/TS код в QA-ветке | ✅ можно (но ничего не пишу — заморозка) |
| Правка `app.json` | ❌ нужен явный OK |
| Правка `eas.json` (`ascAppId`) | ❌ нужен явный OK |
| Правка native (`UrTruck/`, `ios/`) | ❌ нужен явный OK |
| EAS-сборка | ❌ нет доступа к аккаунту |
| Скриншоты симулятора | ❌ нет Mac/Xcode в окружении |
| Заполнение ASC metadata | ❌ нет доступа к ASC |

---

## Что я могу сделать **прямо сейчас**, если разрешишь

1. **Подготовить one-liner правку `eas.json`** — заменить `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` на реальный ASC ID, который ты пришлёшь.
2. **Подготовить правку `app.json`** — если нужно изменить `name` / добавить `ios.infoPlist.CFBundleDisplayName` явно (страховка от того, что `expo prebuild` не подхватил).
3. **Расписать пошагово**, какие 8 экранов снимать и как они должны выглядеть в App Store (промо-копия / прохождение / какие данные мокать в Demo Account).

Всё — после твоего отдельного OK на каждый пункт.
