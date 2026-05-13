# Spec: inDrive-style регистрация (Вариант A)

> Решение владельца от 12 мая 2026 (после аудита `AUDIT_2026-05-12_ROLES_AND_REG.md`):
> Делаем **Вариант A** — inDrive-стиль в одном приложении, роль выбирается **после** OTP и имени.
>
> Этот документ — **контракт реализации** для RC2-эпиков. Кода пока нет.

---

## 1. Целевой flow

```
┌─────────────┐
│   Splash    │  1 сек, лого UrTruck по центру, белый фон
└──────┬──────┘
       │ (первый запуск ИЛИ язык не выбран)
       ↓
┌─────────────┐
│  Language   │  выбор RU/KK/EN/ZH, сохраняется в storage
└──────┬──────┘    последующие запуски — пропускается
       ↓
┌─────────────┐
│ PhoneScreen │  поле телефона + одна CTA "Далее"
│             │  ↓ под полем — мелкий гостевой link
│             │  "Посмотреть ленту"  (ведёт в Main как guest, role=null)
└──────┬──────┘
       ↓
┌─────────────┐
│   OtpScreen │  4-6 цифр, autofocus, autosubmit на последней цифре
│             │  textContentType="oneTimeCode" — iOS autofill
│             │  таймер resend, кнопка "изменить номер"
└──────┬──────┘
       ↓
   ┌───┴───┐
   │ ?     │  backend ответил: existing user / new user
   └───┬───┘
       │
   existing? ────yes────→  navigation.reset → Main (роль уже в session)
       │
       no
       ↓
┌─────────────┐
│  NameScreen │  одно поле: "Как вас зовут?", CTA "Далее"
└──────┬──────┘
       ↓
┌─────────────┐
│  RoleScreen │  ДВЕ карточки — "Я водитель" / "Я грузовладелец"
│   (новая)   │  + мелкий текст "можно сменить позже в настройках"
│             │  при выборе → setRole(role) → reset → Main
└──────┬──────┘
       ↓
   ┌───┴───┐
   │ Main  │  DriverTabs или ClientTabs (см. RC2-A)
   └───────┘
```

---

## 2. Маппинг на текущие экраны

| Целевой экран | Текущий аналог | Что делаем |
|---|---|---|
| Splash | `SplashScreen.js` | без изменений |
| Language | (нет — встроено в OnboardingScreen) | **новый**: `LanguageScreen.js` |
| PhoneScreen | `registration/PremiumRegisterScreen.js` | **переделать**: убрать role-badge, убрать role из payload OTP, оставить только phone + consent + CTA |
| OtpScreen | `registration/PremiumOtpScreen.js` | **переделать**: убрать role-badge сверху; обработка ответа backend (existing vs new) разветвляет navigation |
| NameScreen | `registration/PremiumProfileScreen.js` (упрощённый) | **переделать**: убрать поле "город" (можно оставить опционально, но не требовать); убрать role-badge |
| RoleScreen v2 | `RoleScreen.js` | **переделать радикально**: больше не welcome-экран, теперь роль-сектор после auth. Две карточки, без hero-PNG, белый фон |
| Main | `MainTabs` | разделить на DriverTabs / ClientTabs (RC2-A) |
| OnboardingScreen | `OnboardingScreen.js` | **удалить из основного flow** (можно оставить доступным через Settings → "Об UrTruck" для интересующихся, но НЕ показывать перед PhoneScreen) |

---

## 3. Изменения в навигации (`AppNavigator.js`)

### Сейчас (упрощённо)

```js
if (!hasToken || !session || !hasRole) {
  // Stack: Role → Auth → Login → Reg → RegOtp → RegProfile → Main
} else {
  // Stack: Main + детали
}
```

### Должно стать

```js
if (!languageSelected) {
  // Stack: Splash → Language → Phone
} else if (!hasToken) {
  // Stack: Phone → Otp
  //   ↓ guest link → Main(guest)
} else if (!session?.user?.name) {
  // Stack: Name
} else if (!hasRole) {
  // Stack: Role
} else {
  // Stack: Main + детали (Main = DriverTabs или ClientTabs)
}
```

Каждое условие — отдельный sub-stack. Реактивность та же, что сейчас.

---

## 4. Изменения в backend

`backend/routes/registration.py` (или эквивалент):

| Endpoint | Сейчас принимает | Должен принимать |
|---|---|---|
| `POST /api/v1/register/send-otp` | `{ phone, role }` | `{ phone }` — role убираем |
| `POST /api/v1/register/verify-otp` | `{ phone, code }` → `{ token, user, isNew }` | то же, но **обязательно** возвращает `isNew: bool` чтобы фронт знал, ветвить ли на NameScreen или сразу в Main |
| `POST /api/v1/register/profile` | `{ name, city, role }` | разделить на 2: `POST /api/v1/register/name { name }` и `POST /api/v1/register/role { role }` (или один `PATCH /api/v1/users/me` с partial body) |

Backend импакт — **минимальный**, по сути просто разделение payload-а одного существующего endpoint-а.

---

## 5. i18n (ключи)

### Удаляем
- `prem_reg_phone_title_driver`
- `prem_reg_phone_title_client`
- `guest_tab_cargos`
- `guest_tab_trips`
- `role_screen_browse_cta` (если есть)

### Добавляем
- `language_screen_title` — "Выберите язык" / "Select language"
- `phone_screen_title` — "Введите номер телефона"
- `phone_screen_subtitle` — "Мы отправим SMS-код для входа"
- `phone_screen_cta` — "Далее"
- `phone_screen_guest_link` — "Посмотреть ленту"
- `phone_screen_consent` — "Нажимая «Далее», вы соглашаетесь..."
- `name_screen_title` — "Как вас зовут?"
- `name_screen_placeholder` — "Имя"
- `role_v2_title` — "Кто вы?"
- `role_v2_subtitle` — "Выберите роль, чтобы мы показали нужный интерфейс"
- `role_v2_driver_card_title` — "Я водитель"
- `role_v2_driver_card_subtitle` — "Ищу грузы и рейсы"
- `role_v2_client_card_title` — "Я грузовладелец"
- `role_v2_client_card_subtitle` — "Размещаю грузы"
- `role_v2_change_later_hint` — "Можно сменить позже в настройках"

11 языков (RU/KK/EN/ZH + остальные из `i18n.js`).

---

## 6. Гостевой режим (вариант B-opt-3 из аудита)

**Решение по умолчанию:** оставить «Посмотреть ленту» как мелкую ссылку под consent на `PhoneScreen`. Это компромисс между B-opt-1 (только грузы) и B-opt-3 (вообще нет гостя).

Гость:
- видит **одну** ленту (грузы — дефолт);
- НЕ видит toggle «Грузы/Рейсы» в шапке (`guestRole`-state удаляется);
- видит весь bottom nav, но при нажатии MyWork / Chats / Profile → редирект на `PhoneScreen` с message «Войдите, чтобы продолжить»;
- может посмотреть карточку груза (CargoDetail), но при нажатии «Откликнуться» → редирект на `PhoneScreen`.

Если владелец потом скажет «гостя вообще убираем» — это 1 коммит (удалить ссылку + удалить ветку `Main(guest)` в navigation).

---

## 7. Разделение MainTabs на DriverTabs / ClientTabs (RC2-A)

После выбора роли пользователь попадает в **разные** Tab.Navigator-ы:

### DriverTabs (role === 'driver')
```
┌─────────────────────────────────────────┐
│  Грузы  │  Мои рейсы  │  +  │  Чаты  │ Профиль │
└─────────────────────────────────────────┘
   Feed       MyWork       CreateTrip   Chats   Profile
   (cargos)   (trips)
```

### ClientTabs (role === 'client')
```
┌─────────────────────────────────────────┐
│ Транспорт │ Мои грузы │  +  │  Чаты  │ Профиль │
└─────────────────────────────────────────┘
   Feed         MyWork        CreateCargo  Chats   Profile
   (trucks)     (cargos)
```

`BottomNav.js` упрощается:
- больше нет условий `if (isDriver) { ... } else { ... }` — компонент тонкий, рендерит то, что ему дали;
- `ICONS` мапа становится плоской;
- `Publish` cell всегда ведёт на правильный Create-screen, в каждом стеке свой.

`FeedScreen.js`, `MyTripsScreen.js`:
- удаляется ветка `isGuest` (гость попадает в guest-stub-экран, не в основной FeedScreen);
- `role` приходит из `session.user.role` напрямую, fallback не нужен;
- удаляется `guestRole` state.

---

## 8. План PR (порядок)

| PR | Эпик | Что делает | Зависимости |
|---|---|---|---|
| **#A** | RC2-C1 | Backend: разделение register endpoint-а | — |
| **#B** | RC2-C2/C3/C4 | Новый flow: PhoneScreen без role + Name + RoleScreen v2 + LanguageScreen | #A |
| **#C** | RC2-A | DriverTabs / ClientTabs разделение | #B |
| **#D** | RC2-B | Удаление `guestRole`-toggle, гостевой stub-экран | #C |
| **#E** | RC2-D | Технический долг (см. раздел 6 аудита) | #B-D |
| **#F** | release | Bump version → 1.1.0, build (10) → TestFlight | #A-E |

Каждый PR — самостоятельный, ревьюится отдельно, мержится отдельно. Между #B и #C — TestFlight build (10) можно НЕ собирать (внутреннее состояние).

---

## 9. Что НЕ трогаем (zero-touch zone)

- `app.json` — bundle ID, иконки, splash, infoPlist (кроме version bump в PR #F);
- `eas.json` — build/submit configs;
- `package.json` / `package-lock.json` (если не нужны новые зависимости — а тут не нужны);
- `ios/`, `android/`, `UrTruck/` native folders;
- `patches/expo-localization+16.0.1.patch` — оставляем как есть;
- Push (`src/utils/push.js`, `pushNotifications.js`);
- Build (9) на TestFlight — живёт своей жизнью.

---

## 10. Срок и риск

**Грубая оценка** (один разработчик, без блокеров):

- PR #A (backend): 0.5 дня
- PR #B (новый auth flow): 1.5 дня + 0.5 QA
- PR #C (split tabs): 1 день + 0.5 QA
- PR #D (удаление гостя-toggle): 0.5 дня
- PR #E (tech debt): 0.5 дня
- PR #F (build & ship): 0.5 дня

**Итого: ~5 рабочих дней** до build (10) на TestFlight, если делать последовательно. Параллельно можно сократить до 3 дней, но риск merge-конфликтов растёт.

**Риски:**
- Backend `verify-otp` не отдаёт `isNew` — нужно добавить, миграции БД нет;
- iOS autofill OTP может не работать без правильного entitlement (associated-domains для applinks). Если нет — фоллбек: ручной ввод. Не блокер;
- Дизайнерский Figma до сих пор не сделан → реализуем по ASCII-мокапам из этого spec-а, потом красим.

---

## 11. Ожидаю от владельца ОК на

1. **Этот flow** (раздел 1) — финальный, в work?
2. **Гостевой режим** — оставляем мелкую ссылку «Посмотреть ленту» (как описано в разделе 6) или вырезаем гостя совсем?
3. **Старт работ** — начинаем сейчас (отдельная ветка `release/appstore-rc2`), или ждём недели observation для build (9) на TestFlight?
4. **Имя поля в PhoneScreen** — оставить consent-текст ("Нажимая «Далее»...") как сейчас, или вынести его в отдельный чекбокс (как Phase 2A AuthScreen)?

Когда дашь ответы — открываю PR #A (backend) первым.
