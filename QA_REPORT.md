# QA-отчёт UrTruck — ветка `claude/qa-testing-urtruck-EiRlA`

База: `release/appstore-rc1`. Прошёл по коду; ниже — статус всех 12 известных багов + 3 новых.

---

## 🔴 BLOCKER — релиз держим

### Bug #4 — Profile после регистрации пустой
- **Файл:** `src/screens/RegScreen.js:708-715` (ClientReg) и `src/screens/RegScreen.js:265` (DriverReg)
- **Статус:** ВОСПРОИЗВОДИТСЯ
- **Что происходит:** После OTP оба flow вызывают только локальный `saveProfile(...)`. Никто не PATCH'ит `/users/me` с `name/city`. ProfileScreen на focus делает GET `/users/me` (`ProfileScreen.js:62-86`) — сервер не знает имя/город → после перезагрузки приложения профиль пуст.
- **Дополнительно:** в ProfileScreen `city: d.city ?? prev?.city` — если бэк вернёт пустую строку `""`, она перезатрёт локальный город (nullish-coalescing не ловит пустую строку).

### Bug #7 — Support chat: нет кнопки отправки
- **Файл:** `src/screens/HowItWorksScreen.js:125-131`
- **Статус:** ВОСПРОИЗВОДИТСЯ
- **Что происходит:** "Поддержка" — это `<Text>` с hardcoded строкой `Telegram: @UrTruckSupport · Email: hello@urtruck.kz`. Ни `<TouchableOpacity>`, ни `Linking.openURL`, ни `t(...)` локализации. Пользователь читает текст — в поддержку попасть некуда.

### Bug #9 — Share/WeChat дублируется, большая кнопка не работает
- **Файл:** `src/components/ShareModal.js:91, 127-130`
- **Статус:** ВОСПРОИЗВОДИТСЯ
- **Что происходит:** В CHANNELS-гриде уже есть WeChat (`handleWeChat` копирует текст). Ниже — secondary `handleOpenWeChat` на `Linking.openURL('weixin://')` без `Linking.canOpenURL` → на Android без WeChat падает в catch и шлёт toast. Это и есть "большая кнопка не работает" + дубль.

### Bug #11 — "— → —" пустые маршруты в ленте
- **Файл:** `src/components/ui/v1/FeedCard.js:56`
- **Статус:** ВОСПРОИЗВОДИТСЯ
- **Что происходит:** `{(route && route.from) || '—'} → {(route && route.to) || '—'}`. Никакой защиты от пустых `from_city/to_city` на бэке.
- **Дополнительно:** в `FeedScreen.js:503` водитель-карточка передаёт `{ from: item.name, to: '' }` — для driver-карточек всегда `"Иван → —"`.

---

## 🟡 ВОСПРОИЗВОДИТСЯ ЧАСТИЧНО

### Bug #1 — Direction filter "пустой" хотя рейсы из Китая есть
- **Файл:** `src/screens/FeedScreen.js:667-696`
- **Что происходит:** UI это два TextInput (substring contains), а не dropdown с готовыми городами/странами. Если ожидался dropdown с автонабором по `from_city` существующих cargo/trips — функционал отсутствует, пустое поле выглядит мёртвым.

### Bug #5 — Banner image на профиле грузовладельца лишний
- **Файл:** `src/screens/EditProfileScreen.js:135`
- **Что происходит:** `<HeroTruck size="sm" />` рендерится без условия по роли — фура у грузовладельца действительно лишняя. В `ProfileScreen.js` баннера нет, баг живёт только в EditProfile.

### Bug #6 — Inputs в профиле выглядят пустыми
- **Файл:** `src/screens/EditProfileScreen.js:160-200`
- **Что происходит:** `Field` Stage 28 уже всегда рендерит label сверху (хорошо), но placeholder не передаётся в `<Field icon="👤" label={t('signup_field_first_name')} value={firstName} ... />`. Поле без значения = label сверху + пусто внизу → визуальный gap, юзеру неясно что вводить.

### Bug #8 — "Мои грузы" → "Разместить груз" не нажимается
- **Файл:** `src/screens/MyTripsScreen.js:572-573`
- **Что происходит:** Кнопка нажимается, но `onAction = navigation.navigate('Feed', { role })` — ведёт на ленту, а не сразу в `CreateCargo`. Два клика вместо одного. UX-баг.

### Bug #10 — Created cargo card неполная (только вес/объём)
- **Файл:** `src/screens/FeedScreen.js:435-439`
- **Что происходит:** `meta = [pickup, tons, m3].filter(Boolean)`. Если у созданного cargo не задан `pickup_date` (необязателен на форме) и отсутствует `price` — карточка показывает только две строки. Нужно либо обязать поля на CreateCargo, либо показывать "—".

---

## ✅ УЖЕ ПОЧИНЕНО (в коде уже корректно)

### Bug #2 — Language/flag mismatch
- **Файл:** `src/components/LanguageSwitcher.js:31-48`
- **Что починено:** Stage 49 P0 fix: `code` (RU/KK/EN/ZH) совпадает с `translations[]` ключами, `current = LANGS.find(l => l.code === getLanguage())` — флаг гарантированно соответствует выбранному языку.

### Bug #3 — Language кнопка мешает
- **Файл:** `src/screens/FeedScreen.js:542`
- **Статус:** По дизайну Stage 45 LanguageSwitcher осознанно слева в brand bar. Не баг, а решение — с владельцем уточнить.

### Bug #12 — "+ Разместить груз" не role-aware
- **Файлы:** `BottomNav.js:97-98`, `FeedScreen.js:613`
- **Что починено:** Везде `isDriver ? 'CreateTrip' : 'CreateCargo'` и `isDriver ? t('postTrip') : t('postCargo')`. Возможно на момент Android smoke было сломано, сейчас в коде корректно.

---

## 🆕 Новые баги, которые я нашёл вне списка

### N1 — Hardcoded русские строки на экране HowItWorks
- **Файл:** `src/screens/HowItWorksScreen.js:114, 126, 128`
- **Что происходит:** "Почему UrTruck", "Остались вопросы?", "Напиши в поддержку" — не идут через `t(...)`. Нарушает CURSOR_INSTRUCTIONS ("все пользовательские тексты обязаны идти через `t(...)`"). На CN/EN/KZ — пользователь увидит русский.

### N2 — Пустая строка с сервера затирает локальный город
- **Файл:** `src/screens/ProfileScreen.js:74`
- **Что происходит:** `city: d.city ?? prev?.city` — `??` пропускает только null/undefined, но не пустую строку. Если бэк вернёт `city=""`, локальный город перезатрётся пустым. Должно быть `d.city || prev?.city`.

### N3 — Race condition в ClientReg при отсутствии session.user.id
- **Файл:** `src/screens/RegScreen.js:710`
- **Что происходит:** `saveProfile(session?.user?.id || 'c_' + Date.now(), ...)` — fallback id-генерация: если сессии нет (а до `setRole('client')` действительно может не быть user.id), профиль сохранится под рандомным id, ProfileScreen потом не найдёт его в `getProfile(session.user.id)`.

---

## Что делать (приоритет)

1. **Блокировать релиз** до фиксов 4 / 7 / 9 / 11 — это P0.

2. Патч-список:
   - `RegScreen.js` ClientReg + DriverReg: добавить `fetch('/users/me', { method: 'PATCH' })` с name/city перед `setRole(...)`.
   - `HowItWorksScreen.js`: завернуть текст поддержки в `<TouchableOpacity onPress={() => Linking.openURL('https://t.me/UrTruckSupport')}>` + локализация через `t()`.
   - `ShareModal.js`: убрать secondary `handleOpenWeChat` или обернуть `Linking.canOpenURL` и скрывать кнопку, если `weixin://` недоступен.
   - `FeedCard.js:56`: вместо `'—'` показывать осмысленный fallback типа `t('route_unknown')`. Для driver-карточек в `FeedScreen.js:503` не передавать пустой `to: ''` — заменить на `null` и обработать в FeedCard.
   - `ProfileScreen.js:74`: заменить `d.city ?? prev?.city` на `d.city || prev?.city`.
   - `EditProfileScreen.js:135`: завернуть `<HeroTruck>` в `{isDriver && ...}`.
   - `EditProfileScreen.js:160-200`: добавить `placeholder` в `<Field>` (примеры: "Иван", "Петров", "Алматы").
   - `MyTripsScreen.js:573`: заменить `navigate('Feed')` на `navigate(isDriver ? 'CreateTrip' : 'CreateCargo', { role })`.

3. Запустить целевые e2e после фиксов:
   - `tests/e2e/urtruck-smoke.spec.js` (driver flow)
   - `qa/agents/full.auth.regression.spec.js` (профиль после регистрации)
   - `qa/mobile/shipper.mobile.spec.js`
