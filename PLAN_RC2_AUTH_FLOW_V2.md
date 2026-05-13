# PLAN: Auth/Onboarding Flow v2 (inDrive-style, Вариант A финализированный)

> Решение владельца от 12 мая 2026 (после `SPEC_RC2_INDRIVE_FLOW.md`):
> Role идёт **до** Profile, потому что профиль зависит от роли.
> Returning user не должен заново видеть Language/Role/Profile, если всё заполнено.
>
> Этот документ — **plan-only**. Кода нет, PR не открываем без OK владельца.

---

## 0. Финальный flow (zafiks'd)

```
Splash
  ↓
Language          (если selectedLanguage уже в storage — skip)
  ↓
Phone             (введён номер → fetch /whatsapp/send)
  ↓
OTP               (введён код → fetch /whatsapp/verify → got token+role+name)
  ↓
User status check (фронт читает backend /me как source of truth)
  ├─ token + role !== 'guest' + profileComplete  →  Main (DriverTabs|ClientTabs)
  ├─ token + role !== 'guest' + !profileComplete →  Profile (по роли)        → Main
  ├─ token + role === 'guest'                    →  Role → Profile (по роли) → Main
  └─ new user (token, role === 'guest', no name) →  Role → Profile (по роли) → Main
```

Гость (без OTP): мелкая ссылка «Посмотреть ленту» под consent на PhoneScreen → `ensureGuest` создаёт временный guest-token → Main с role=null (только Feed + клик на любую защищённую фичу → редирект на PhoneScreen).

---

## 1. Какие файлы менять

### Фронтенд

| Файл | Текущая роль | Что делаем | Риск |
|---|---|---|---|
| `src/navigation/AppNavigator.js` | Решает стек по `hasToken / session / hasRole` | **Переписать условия**: добавить `selectedLanguage`, `profileComplete`. Заменить `MainTabs` (один) на `DriverTabs / ClientTabs` (два, выбор по `role`). | средний |
| `src/utils/AuthContext.js` | Хранит `session`, `hasToken`, `verificationLevel`. Восстанавливает из `ur_session` + `regAPI.me()`. | Добавить computed `profileComplete`, `selectedLanguage`. Не ломать существующее API (`signIn`, `setRole`, `signOut`, `ensureGuest`, `refreshLevel`). | средний |
| `src/screens/RoleScreen.js` | Welcome + 4 действия (driver/client/login/guest) | **Перерождение**: становится пост-OTP экраном «Кто вы?». Удалить hero PNG, guest-link, login-link. Оставить две карточки. Белый фон (designV2). | средний |
| `src/screens/SplashScreen.js` | Splash | Без изменений | — |
| `src/screens/OnboardingScreen.js` | 3 onboarding-слайда | Убрать из основного flow. Остаётся доступен через `Settings → Об UrTruck` для интересующихся (вне auth-flow). | низкий |
| `src/screens/registration/PremiumRegisterScreen.js` | phone + role-badge + consent | **Переделать в `PhoneScreen.js`**: убрать role-badge, убрать role из `sendCode` payload (или передавать `null`). Оставить consent + cooldown UX. Под кнопкой добавить ссылку «Посмотреть ленту». | средний |
| `src/screens/registration/PremiumOtpScreen.js` | otp 6 цифр + role-badge | **Переделать в `OtpScreen.js`**: убрать role-badge. После `verifyCode` — читать response, навигировать по табл. ниже. iOS autofill (`textContentType="oneTimeCode"` — проверить, есть ли). | средний |
| `src/screens/registration/PremiumProfileScreen.js` | имя + город (общее для обеих ролей) | **Разделить** на `ProfileDriverScreen.js` + `ProfileClientScreen.js`. Поля разные (см. раздел 2). | средний |
| `src/screens/FeedScreen.js` | Лента + `guestRole`-toggle в шапке | Удалить `guestRole` state и `<View style={s.guestTabs}>`. Использовать `role` напрямую из `session.user.role`. | низкий |
| `src/components/ui/v1/BottomNav.js` | Один таб-бар на все роли | Упростить: больше не читает `role` для `Publish` (это становится частью driver/client stack). | низкий |
| `src/utils/registration.js` | API клиент | `sendCode` — убрать `role` (или сделать optional). `verifyCode` — обработать новое поле `is_new` (см. backend). Добавить `setRoleAPI(role)` (отдельный PATCH на `/users/me`). | средний |
| `src/utils/i18n.js` | Словари 11 языков | Добавить новые ключи (см. раздел 7), пометить старые `[DEPRECATED]` (не удалять сразу, чтобы build (9) пользователи не словили missing-key crash при auto-update). | низкий |

### Backend

| Файл | Что делаем | Риск |
|---|---|---|
| `backend/api/registration.py` | Endpoint `/whatsapp/verify` (line 201) — в response добавить `is_new: bool` (= `True` если `driver` был создан только что в `get_or_create_driver`, или если `role` в `("guest", None)` И `full_name` пустой). Endpoint `/whatsapp/send` (line 108) — `role` parameter становится optional, не сохраняется в audit как обязательный. | средний |
| `backend/database/registration_dal.py` (или эквивалент) | `get_or_create_driver` — должна различать «existing» vs «just created». Добавить return `(driver, created: bool)` или флаг внутри driver dict. | низкий |
| Новый: `PATCH /api/v1/users/me/role` | Отдельный endpoint для сохранения роли после её выбора на RoleScreen v2. Сейчас роль приходит в `sendCode` audit — это смешение. | низкий |
| Новый: `PATCH /api/v1/users/me/profile` | Профиль с role-specific полями. Уже есть `regAPI.updateProfile({name, city, about})` (registration.js:136), но он шлёт в `/users/me`. Расширить, чтобы принимать `vehicle_type`, `capacity_kg`, `routes` (driver) и `company`, `usual_cargo` (client). | средний |

---

## 2. Какие новые экраны создавать

| Новый файл | Назначение | Поля |
|---|---|---|
| `src/screens/LanguageScreen.js` | Выбор языка при первом запуске | список 11 локалей (RU/KK/EN/ZH/UZ/...), CTA «Продолжить» |
| `src/screens/PhoneScreen.js` (rename из PremiumRegisterScreen) | Ввод телефона | country picker + phone input + consent + CTA + guest-link |
| `src/screens/OtpScreen.js` (rename из PremiumOtpScreen) | OTP-код | 4-6 digit pin input + resend timer + change-phone link |
| `src/screens/RoleScreen.js` (полная переделка существующего) | Выбор роли пост-OTP | две карточки + hint «можно сменить позже» |
| `src/screens/profile/ProfileDriverScreen.js` | Профиль водителя | Имя, Город, Тип кузова (tent/ref/platform/auto/izoterm/other), Грузоподъёмность (кг), Маршруты (опционально, multi-select городов) |
| `src/screens/profile/ProfileClientScreen.js` | Профиль грузовладельца | Имя, Компания (опционально), Город, Что обычно отправляете (опционально, free text) |
| `src/navigation/DriverTabs.js` | Tab.Navigator для driver | Feed (грузы), MyWork (мои рейсы), Publish (CreateTrip), Chats, Profile |
| `src/navigation/ClientTabs.js` | Tab.Navigator для client | Feed (транспорт), MyWork (мои грузы), Publish (CreateCargo), Chats, Profile |
| `src/screens/GuestStubScreen.js` (опционально) | Заглушка для гостя на защищённых табах | «Войдите, чтобы продолжить» + CTA → PhoneScreen |

Старые `PremiumLoginScreen.js`, `PremiumRegisterScreen.js`, `PremiumOtpScreen.js`, `PremiumProfileScreen.js` — НЕ удаляем сразу, оставляем доступными через `?qa=design` (qaPreview) на 1 релиз, потом удаляем.

---

## 3. Где сейчас auth/token хранится

| Что | Где (frontend) | Где (backend) | Ключ |
|---|---|---|---|
| Bearer token | `storage` (AsyncStorage/localStorage) | `driver_sessions` таблица в SQLite | `ur_reg_token` |
| Session (user object) | `AuthContext.session` + storage | derived from `driver` row | `ur_session` |
| verification_level | `AuthContext.verificationLevel` + storage | `drivers.verification_level` (0/1/2/3) | `ur_verification_level` |
| Phone | `session.user.phone` + backend driver row | `drivers.phone` | — |

Источник истины — backend (`regAPI.me()` в `AuthContext.refreshLevel()`, `AuthContext.js:30-46`). Local storage — fallback на время сетевых сбоев.

---

## 4. Где сейчас role хранится

| Что | Где |
|---|---|
| Frontend state | `AuthContext.session.user.role` (`AuthContext.js:121-127` через `setRole(role)`) |
| Frontend storage | `ur_session` JSON в `storage` (key `KEY` = `'ur_session'`) |
| Backend column | `drivers.role` SQLite (values: `'driver'`, `'client'`, `'guest'`, NULL) |
| Backend API | `GET /api/v1/register/me` возвращает `{ role: driver.role || 'guest' }` |
| Установка | Сейчас: `RoleScreen` вызывает `setRole(role)` через AuthContext + `regAPI.sendCode` шлёт `role` в payload как audit. Реального backend write нет до момента profile-save. |

**Проблема:** роль сохраняется только локально до момента `updateProfile`. Если юзер выберет роль и закроет app — роль потеряется. **План: новый endpoint `PATCH /users/me/role`**, вызывается сразу при выборе на RoleScreen v2.

---

## 5. Как определить existing/new user

**Сейчас** — нельзя надёжно. `/whatsapp/verify` возвращает `role: "client"` по умолчанию для новых драйверов (`registration.py:289`), что путает. Frontend компенсирует через `regAPI.me()` (которое возвращает `role: "guest"` для новых).

**План — добавить явное поле `is_new` в response `/whatsapp/verify`:**

```python
# backend/api/registration.py:285 — поменять get_or_create_driver чтобы
# вернуть (driver, created: bool). В response добавить:
return {
    ...existing fields...,
    "is_new": created,                # ← новое поле
    "has_role": bool(driver.get("role")) and driver["role"] != "guest",
    "has_name": bool(driver.get("full_name")),
}
```

Frontend читает три флага и решает:

| is_new | has_role | has_name | Куда |
|---|---|---|---|
| false | true | true | Main (по роли) |
| false | true | false | Profile screen (по роли) |
| false | false | * | RoleScreen v2 → Profile → Main |
| true | * | * | RoleScreen v2 → Profile → Main |

---

## 6. Как определить profileComplete

Зависит от роли. Логика во фронте, в `AuthContext` как computed:

```
profileComplete = false если:
  - session.user.role не задана (тогда вообще не доходит до profile-check)
  - role === 'driver':
      требуем full_name + city + vehicle_type + capacity_kg
  - role === 'client':
      требуем full_name + city
      (компания и usual_cargo — опциональные)
```

Source of truth — backend `/api/v1/register/me` response. Поля `vehicle_type`, `capacity_kg`, `company` сейчас в `drivers` таблице — проверить, что они there (`backend/database/registration_dal.py`); если нет — добавить миграцию.

⚠️ **Важно:** `profileComplete=false` после выбора роли — не блокер для входа в Main. Это **soft-gate**: юзер попадает в Main, но при попытке опубликовать груз/рейс получает modal «Заполните профиль». Это inDrive-стиль (минимум friction до первого useful action).

---

## 7. Какие i18n keys добавить

11 языков × следующие ключи (`src/utils/i18n.js`):

### Добавляем

```
# Language screen
language_screen_title             — "Выберите язык" / "Select language"
language_screen_cta               — "Продолжить" / "Continue"

# Phone screen
phone_screen_title                — "Введите номер телефона"
phone_screen_subtitle             — "Мы отправим SMS-код для входа"
phone_screen_cta                  — "Далее"
phone_screen_guest_link           — "Посмотреть ленту"
phone_screen_consent              — "Нажимая «Далее», вы соглашаетесь с {terms} и {privacy}"

# OTP screen
otp_screen_title                  — "Введите код"
otp_screen_subtitle               — "Мы отправили его на {phone}"
otp_resend_in                     — "Получить заново через {time}"
otp_change_phone                  — "Изменить номер"

# Role screen v2
role_v2_title                     — "Кто вы?"
role_v2_subtitle                  — "Выберите роль, чтобы мы показали нужный интерфейс"
role_v2_driver_card_title         — "Я водитель"
role_v2_driver_card_subtitle      — "Ищу грузы и рейсы"
role_v2_client_card_title         — "Я грузовладелец"
role_v2_client_card_subtitle      — "Размещаю грузы"
role_v2_change_later_hint         — "Можно сменить позже в настройках"

# Profile (driver)
profile_driver_title              — "Расскажите о себе"
profile_driver_name_label         — "Имя"
profile_driver_city_label         — "Город базирования"
profile_driver_vehicle_type_label — "Тип кузова"
profile_driver_capacity_label     — "Грузоподъёмность (кг)"
profile_driver_routes_label       — "Основные маршруты (опционально)"

# Profile (client)
profile_client_title              — "Расскажите о себе"
profile_client_name_label         — "Имя или компания"
profile_client_company_label      — "Название компании (опционально)"
profile_client_city_label         — "Город"
profile_client_cargo_label        — "Что обычно отправляете (опционально)"

# Guest stub (на защищённых табах)
guest_stub_title                  — "Войдите, чтобы продолжить"
guest_stub_subtitle               — "Нужен номер телефона и SMS-код"
guest_stub_cta                    — "Войти"
```

### Помечаем `[DEPRECATED]` (не удаляем 1 релиз)

```
prem_reg_phone_title_driver
prem_reg_phone_title_client
prem_reg_phone_subtitle
prem_reg_profile_title
prem_reg_profile_subtitle
prem_reg_profile_finish
guest_tab_cargos
guest_tab_trips
```

---

## 8. Какие риски

| Риск | Вероятность | Импакт | Митигация |
|---|---|---|---|
| Backend `is_new` не вернётся → fallback логика на frontend сломает существующих юзеров | Низкая | Высокий | Сделать backend изменения первыми (PR #A), задеплоить, проверить через `/api/v1/system/info`. Frontend пишем только после деплоя backend. |
| Существующие юзеры на TestFlight build (9) после обновления потеряют сессию (новый flow ожидает `selectedLanguage` в storage, его нет) | Средняя | Средний | В migration logic: если `hasToken=true` И `selectedLanguage` отсутствует — выставить default (`RU`) и пропустить LanguageScreen. Документировать. |
| iOS SMS autofill не работает (нет associated-domains entitlement) | Высокая | Низкий | Не блокер — ручной ввод OTP всегда доступен. Оставить как known issue, починить позже (требует apple-app-site-association на urtruck.kz). |
| Role-switch logic: юзер выбрал driver, передумал — нет UI для смены роли | Средняя | Средний | Добавить в `ProfileScreen` (внутри Main) опцию «Сменить роль». При смене → reset Profile complete и навигация на `RoleScreen`. Не блокер для MVP. |
| `MyTripsScreen` / `ChatsListScreen` ломаются после split tabs (role читался из route.params) | Средняя | Средний | Перед split — пройти grep по `route.params.role`, заменить на `session.user.role` напрямую. Это refactor-PR (RC2-D в плане). |
| Backend `drivers` таблица не имеет `vehicle_type`, `capacity_kg`, `company` колонок | Низкая | Средний | До PR #A — проверить schema; если нет — добавить миграцию (новые nullable колонки, без data loss). |
| Гость на DriverTabs/ClientTabs ломается, потому что нет роли | Высокая (если не предусмотреть) | Высокий | Гость **никогда** не должен попадать в DriverTabs/ClientTabs. Гостевой стек — отдельный `GuestTabs` (только Feed + ссылка на login). |
| Параллельный агент в репо снова что-то меняет (как PR #28) | Средняя | Низкий | Перед стартом каждого PR — `git pull` и проверка HEAD. |

---

## 9. Тест-сценарии

### Happy paths

1. **Новый юзер (water-water clean install):**
   Splash → Language (RU) → Phone (+77000000000) → OTP (1234) → RoleScreen (выбрал driver) → ProfileDriver (имя, город, кузов, тоннаж) → Main (DriverTabs) → видит «Грузы» в Feed.

2. **Новый юзер, выбрал client:**
   Splash → Language → Phone → OTP → RoleScreen (client) → ProfileClient (имя + город) → Main (ClientTabs) → видит «Транспорт».

3. **Returning user, полный профиль:**
   Splash → (skip Language, есть в storage) → Phone → OTP → Main сразу (роль и профиль есть).

4. **Returning user, role есть, profile incomplete:**
   Splash → Phone → OTP → ProfileDriver/Client → Main.

5. **Returning user, role missing (legacy 'guest' роль):**
   Splash → Phone → OTP → RoleScreen → Profile → Main.

6. **Guest browse:**
   Splash → Language → Phone (нажал «Посмотреть ленту») → Main (только Feed грузов, без бейджей; клик на MyWork → редирект на Phone).

### Negative / edge

7. **OTP неверный 3 раза → rate limit:**
   Phone → OTP (1111) → ошибка → (2222) → ошибка → (3333) → cooldown 1 мин.

8. **Resend code:**
   Phone → OTP → подождать таймер → resend → новый код → enter.

9. **Сеть отвалилась во время verify:**
   Phone → OTP → timeout → retry → success.

10. **Юзер закрыл app на RoleScreen после OTP:**
    Открыл снова → Splash → должен попасть на RoleScreen (token есть, role нет) — НЕ на Phone снова.

11. **Юзер закрыл app на ProfileDriver не сохранив:**
    Открыл снова → должен попасть на ProfileDriver (token есть, role есть, profile incomplete).

12. **TestFlight build (9) → build (10) migration:**
    Юзер уже в Main → обновление → должен остаться в Main, не вернуться на Phone. Storage `ur_session`, `ur_reg_token`, `ur_verification_level` сохраняются между билдами в одной AppGroup.

13. **Смена роли через ProfileScreen:**
    Main (driver) → Profile → «Сменить роль» → confirm → RoleScreen → выбрал client → ProfileClient → Main (ClientTabs).

14. **Language switch на лету:**
    Profile → выбрал KK → все экраны на казахском. Перезапуск app → KK сохранился. (Уже работает в текущем i18n.)

15. **Guest конвертация:**
    Guest в Feed → клик «Откликнуться» → редирект Phone → OTP → guest_token апгрейдится в driver session (через `guest_token` в verify request — уже реализовано в `registration.js:97`).

### Backend tests

16. `/whatsapp/verify` для phone которого нет в БД → `is_new=true`, `has_role=false`, `has_name=false`.
17. `/whatsapp/verify` для phone который есть с role=driver и full_name=Иван → `is_new=false`, `has_role=true`, `has_name=true`.
18. `PATCH /users/me/role` без token → 401.
19. `PATCH /users/me/role` с `role='invalid'` → 400.
20. `PATCH /users/me/role` с `role='driver'` → driver row updated, return `{role: 'driver'}`.

---

## 10. Зависимости и порядок PR

```
PR #A: Backend
  - is_new флаг в /whatsapp/verify
  - PATCH /users/me/role
  - PATCH /users/me/profile (extended)
  - (если нужно) migration drivers table
  - tests 16-20

PR #B: LanguageScreen + PhoneScreen + OtpScreen
  - новые экраны, переименование старых
  - убрать role из sendCode payload
  - обработка is_new в OtpScreen → navigate
  - tests 1-9

PR #C: RoleScreen v2 + ProfileDriverScreen + ProfileClientScreen
  - переделка RoleScreen
  - новые profile экраны (split)
  - PATCH /users/me/role при выборе
  - tests 1-2, 4-5, 13

PR #D: DriverTabs / ClientTabs split + удаление guestRole-toggle
  - два tab navigator-а
  - удаление guestRole из FeedScreen
  - упрощение BottomNav
  - GuestStubScreen на защищённых табах
  - tests 6, миграция guest-user из toggle в honest guest mode

PR #E: AppNavigator переписать с новыми условиями
  - selectedLanguage + profileComplete computed
  - migration logic (см. риск №2)
  - tests 10-12

PR #F: i18n + cleanup
  - новые ключи в 11 языках
  - [DEPRECATED] метки на старые
  - удаление PremiumRegisterScreen / PremiumOtpScreen / PremiumProfileScreen
    (или оставить только в qaPreview)

PR #G: Build (10) → TestFlight
  - bump app.json version → 1.1.0
  - bump buildNumber → автоматический через EAS autoIncrement
  - eas build + submit
```

Параллелизация: PR #A блокирует #B, #C. PR #B и #D можно делать параллельно. PR #E зависит от #B-#D. PR #F и #G — финал.

---

## 11. Чего я НЕ делал в этом PLAN

- Не писал ни строки кода.
- Не открывал PR.
- Не запускал eas build.
- Не трогал app.json / eas.json / package.json.
- Не пушил в release/appstore-rc1 (это PR на ветке `audit-roles-and-registration`, доcs-only).
- Не делал миграции backend (только описание, что нужно).
- Не удалял старые экраны (только пометил, что они должны уйти).

---

## 12. Жду от владельца перед стартом PR #A

1. **Утверждаешь этот PLAN?** Если да — открываю PR #A в новую ветку `feat/rc2-backend-isnew-flag` под `release/appstore-rc2`.
2. **Что в ProfileDriver обязательное, а что опциональное?** Я предложил: имя+город+кузов+тоннаж обязательно, маршруты опционально. Согласен?
3. **Какая роль будет у `guest_token` юзера после конверсии через verify?** Сейчас backend апгрейдит guest_id → driver_id, но `role` остаётся `'guest'`. Должно стать NULL (чтобы попал на RoleScreen v2)?
4. **Когда стартуем?** Сейчас, или ждём недели observation build (9) на TestFlight (мой prefer — подождать, чтобы выловить crash-report при наплыве пользователей).

Когда дашь OK на 1-4 — начинаю PR #A. До этого ничего не двигаю.
