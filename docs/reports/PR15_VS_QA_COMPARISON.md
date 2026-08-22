# PR #15 vs `claude/qa-testing-urtruck-EiRlA` — comparison report

**База обеих веток:** `release/appstore-rc1` @ `9430b22`. Diff'ы честно сопоставимы.

- **PR #15** (`stage50-real-android-smoke-p0-fixes` @ `b547716`): 9 файлов, +130/-40
- **QA-ветка**: 11 файлов, +474/-95 (включая `QA_REPORT.md` 106 строк и +148 i18n)

12 заявленных багов одни и те же (P0/P1 Android smoke). Решения **разные**.

---

## Сводная таблица

| Файл | PR #15 | QA-ветка | Конфликт? | Брать из QA | Причина |
|---|---|---|---|---|---|
| `src/components/ShareModal.js` | удаляет 14 строк (secondaryBtn + handleOpenWeChat) | удаляет те же 14 строк, **добавляет** `Linking.openURL('weixin://')` внутрь `handleWeChat` | **TEXT CONFLICT** на `handleWeChat` | **НЕТ** | PR #15 чище: одна WeChat-кнопка, только copy. QA-вариант слабее (open weixin без `canOpenURL` — на desktop тихо падает). |
| `src/screens/ChatScreen.js` | `➤` Text → FA5 `paper-plane` solid white + `accessibilityLabel="Send"` | не трогает | — | — | Только в PR #15. Нечего переносить. |
| `src/screens/EditProfileScreen.js` | удаляет `<HeroTruck>` **безусловно**, ставит `placeholder = label` (дублирует), `phone editable=false`, email placeholder | оборачивает HeroTruck в `{isDriver ? ... : null}`, добавляет осмысленные placeholder'ы (`signup_first_name_placeholder` = "Например: Иван") | **TEXT CONFLICT** | **ЧАСТИЧНО** (через i18n-ключи) | PR #15 решает Bug #5 жёстче (вообще убирает фуру) — это OK для shipper, но driver тоже теряет hero. Решение QA точнее. Placeholder'ы QA лучше (примеры вместо повторного label). |
| `src/screens/FeedScreen.js` | +75/-10: Direction chip-suggestions (top-8), фильтр битых карточек (`f === '—'`), `from_point_name`/`to_point_name` fallback, `LanguageSwitcher` только гостю, `accessibilityLabel` через `t()` | +56/-9: те же chip-suggestions (top-10, ScrollView), null вместо `''` для driver-card.to, meta cargo-карточки **всегда 3 строки** с `'—'` fallback | **TEXT CONFLICT** в Direction sheet, в маппинге cargos, минорно в renderDriver | **НЕТ глобально**, **ДА точечно** | PR #15 решает Bug #10/#11 на уровне источника данных (`from_point_name`) + фильтр мусора — **архитектурно правильнее**. QA-вариант рендерит «—» в meta — это мелкий полезный UX, можно дополнить cherry-pick'ом одной строки. |
| `src/screens/MyTripsScreen.js` | empty CTA → CreateCargo/CreateTrip; bids tab driver→Feed, shipper→CreateCargo (без `{role}`) | то же самое + сохраняет `{ role }` параметр | **TEXT CONFLICT** (минимальный) | **ЧАСТИЧНО** | Логически идентичны. PR #15 теряет `{ role }` — это могло быть случайно. Можно cherry-pick'нуть `{role}` из QA отдельным PR. |
| `src/screens/registration/PremiumProfileScreen.js` | через `regAPI.updateProfile()` (новый метод в `registration.js`); fire-and-forget с `.catch(() => {})` | inline `fetch(API_BASE/users/me)` через `storage.get('ur_reg_token')`; await | **TEXT CONFLICT** | **НЕТ** | PR #15 архитектурно правильно — обёртка в `regAPI`, переиспользуется. QA-вариант делает то же самое, но дублирует логику в компоненте. **Брать PR #15.** |
| `src/theme/designV1.js` | `placeholder #5A6068 → #8B92A0` (WCAG AA fix) | не трогает | — | — | Только в PR #15. Связан с EditProfileScreen Bug #6. |
| `src/utils/normalizers.js` | `pick(...from_city, ..., from_point_name)` fallback в `normalizeTrip` | не трогает | — | — | Только в PR #15. Часть архитектурного решения Bug #10/#11. |
| `src/utils/registration.js` | новый метод `regAPI.updateProfile({name, city, about})` | не трогает | — | — | Только в PR #15. Pair'ится с PremiumProfileScreen. |
| `src/components/ui/v1/FeedCard.js` | не трогает | заменяет `'—' → '—'` на трёхуровневый fallback (from+to / только from / только to / `t('route_not_specified')`); добавляет import `tGlobal` | — | **МОЖНО** (но не обязательно) | PR #15 решает проблему пустых маршрутов **выше по стеку** (фильтр + `from_point_name`). После PR #15 этот fallback редко срабатывает, но защищает от регрессии. Низкий риск, можно cherry-pick. |
| `src/screens/HowItWorksScreen.js` | не трогает | hardcoded RU «Поддержка / Telegram / Email» → две `<TouchableOpacity>` с `Linking.openURL` (Bug #7); STEPS_CLIENT/_DRIVER + FEATURES → ключи `t()`; новые i18n-ключи. | — | **ДА** | Bug #7 в PR #15 **не решён вообще**. Это P0 из QA-отчёта (поддержка некликабельна). Обязательно cherry-pick'ать отдельным PR. |
| `src/screens/ProfileScreen.js` | не трогает | `city: d.city ?? prev?.city` → `\|\|` (N2: пустая строка с сервера затирала локальный город); тот же фикс для `bio` | — | **ДА** | Реальный баг. PR #15 не решает. Однострочный cherry-pick. |
| `src/screens/RegScreen.js` | не трогает | legacy DriverReg + ClientReg: добавляет `syncProfileToServer` (PATCH /users/me), убирает race condition `c_<timestamp>` id-fallback | — | **СОМНИТЕЛЬНО** | Этот экран — legacy (по `AppNavigator.js:22-23` он только в `qaPreview` и LegacyAuth/LegacyReg). В основном flow стоит `PremiumProfileScreen`, который PR #15 уже чинит. Если РЕАЛЬНО legacy и не используется — фикс не нужен; cherry-pick только если есть путь, по которому юзер туда попадает. |
| `src/utils/i18n.js` | не трогает | +148 строк: 25 новых ключей × 4 языка (RU/KK/ZH/EN) для HowItWorks, route_not_specified, signup placeholder'ы, support_questions_*, share_open_failed | — | **ДА** (если берём HowItWorks/FeedCard/EditProfile placeholder'ы) | Чистое расширение словаря. Конфликтов быть не может. Берётся в паре с теми экранами, где новые ключи используются. |
| `QA_REPORT.md` | — | новый | — | **ОПЦИОНАЛЬНО** | Документация. Можно держать в QA-ветке как историю; в `main` не нужен. |

---

## Сухой вывод

**PR #15 решает 12 багов жёстче и архитектурно лучше** в трёх местах:

1. **Bug #4 (Profile пустой)**: PR #15 выносит `regAPI.updateProfile()` в утилиту → переиспользуется. QA вкомпил inline fetch. → **PR #15 побеждает.**
2. **Bug #10/#11 (— → —)**: PR #15 чинит **источник** (fallback на `from_point_name` в маппинге + `normalizers.js`) **+** фильтр битых карточек. QA чинит только **рендер** (FeedCard). → **PR #15 побеждает.**
3. **Bug #6 (placeholders / WCAG)**: PR #15 поднимает `placeholder` цвет до AA-стандарта (`designV1.js`). QA только подсунул placeholder-тексты, цвет не трогал. → **Оба решения дополняют друг друга**, но цветовой fix критичнее.
4. **Bug #7 (Send button)**: PR #15 заменяет `➤` на `paper-plane` FA5. QA **не трогает**. → **PR #15 нужнее.**

**В QA есть 3 вещи, которых нет в PR #15** — стоит cherry-pick'ать отдельным PR ПОСЛЕ мержа PR #15:

1. **Bug #7 — Support chat в HowItWorksScreen** (поддержка плэйн-текстом, не кликабельна). P0, в PR #15 не решён.
2. **N2 — `city ?? → city ||` в ProfileScreen.js** (пустая строка с бэка затирала локальный город). Однострочник.
3. **i18n-расширение HowItWorks STEPS/FEATURES** — это уже улучшение, не баг-фикс. Можно с PR #2 «локализация».

**Что отбросить:**

- ShareModal `Linking.openURL('weixin://')` внутри `handleWeChat` — слабее чем явная отдельная кнопка с `canOpenURL`, и хуже чем «только copy». Не брать.
- RegScreen.js legacy фикс — этот экран не в основном flow (только `qaPreview`/`LegacyReg`), фикс просто шум. Не брать.
- Свой inline-fetch в PremiumProfileScreen — overlap с PR #15, но PR #15 архитектурнее. Не брать.
- QA-версия EditProfileScreen `<HeroTruck>` (условный по роли) — спорно. PR #15 убрал безусловно, и это нормально для компактного экрана редактирования. Решение владельца.

---

## Рекомендованный порядок

1. **Сначала** — мержить PR #15 в `release/appstore-rc1` (после owner Android/iPhone smoke на `urtruck.kz/preview-stage50/`).
2. **После** — отдельный PR из QA-ветки на `release/appstore-rc1` со ТРЕМЯ cherry-pick'ами:
   - `src/screens/HowItWorksScreen.js` (Bug #7) + новые ключи в `src/utils/i18n.js`
   - `src/screens/ProfileScreen.js` строка 74 (N2)
   - (опц.) `src/components/ui/v1/FeedCard.js` — defensive fallback на случай регрессии маппинга
3. **Закрыть QA-ветку** после cherry-pick без мержа целиком.
4. **`QA_REPORT.md`** оставить в QA-ветке как «памятник» или перенести в `docs/qa/2026-05-10-android-smoke.md` отдельным докум-PR.

---

## Конкретные cherry-pick команды

После мержа PR #15:

```bash
git checkout release/appstore-rc1
git pull
git checkout -b cherry-qa-3-extras

# 1) HowItWorks support buttons + i18n keys (Bug #7 + N1)
git checkout claude/qa-testing-urtruck-EiRlA -- \
  src/screens/HowItWorksScreen.js \
  src/utils/i18n.js

# 2) ProfileScreen N2 (city/bio nullish)
git checkout claude/qa-testing-urtruck-EiRlA -- src/screens/ProfileScreen.js

# 3) (опционально) FeedCard defensive fallback
git checkout claude/qa-testing-urtruck-EiRlA -- src/components/ui/v1/FeedCard.js

git diff --stat   # проверить что только эти файлы
git commit -m "fix: cherry-pick из QA-ветки — support chat (#7), city nullish (N2), route fallback"
git push -u origin cherry-qa-3-extras
# затем gh PR на release/appstore-rc1
```

⚠ **Перед cherry-pick** — обязательно убедиться что PR #15 уже в `release/appstore-rc1`, иначе `i18n.js` ключи окажутся в bundle'е раньше, чем код, который их использует (само по себе не сломает, но грязно).

---

## Что НЕ трогаем (повтор для гарантии)

- ✅ `eas.json`, ASC, TestFlight конфиги — обе ветки чисто.
- ✅ `app.json`, `package.json` (version 1.0.0) — обе ветки чисто.
- ✅ `package-lock.json` — обе ветки чисто.
- ✅ `backend/` — обе ветки чисто (PATCH /users/me — это вызов существующего endpoint, не новая фича бэка).
- ✅ Push-инфраструктура (`src/utils/push.js`, `pushNotifications.js`) — обе чисты.
- ✅ iOS / Android native (`UrTruck/`, `ios/`, `android/`) — обе чисты.

Дальше — твоё решение по preview-stage50 на устройстве.
