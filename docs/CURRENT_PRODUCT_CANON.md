# UrTruck — актуальный продуктовый канон

> Заменяет продуктовые разделы `CLAUDE.md` ("Канон UrTruck", навигация,
> IS_BETA) там, где они разошлись с кодом. **Не удалять `CLAUDE.md`** — он
> остаётся источником правил, которые здесь не оспариваются (палитра,
> типы кузова, правила UI, Graphify-gated список). Составлено 2026-09-08
> в рамках Track B инженерного спринта, на основе прямой проверки кода
> (не пересказа предыдущих аудитов без верификации — два их вывода уже
> оказались ложными, см. "Ретрагированные находки" ниже).

## 1. Навигация — фактическое состояние

Проверено: `src/navigation/AppNavigator.js:125-139`, тест
`tests/frontend/test_navigation_tabs.mjs`.

| Роль | Вкладки (в порядке кода) | Экран Feed |
|---|---|---|
| driver | Feed / MyWork / Deals / Queue | `CargoFeedScreen.js` (грузы) |
| client | MyWork / Feed / Deals / Queue | `FeedScreen.js` (машины/водители) |

**Обе роли получают 4 вкладки, включая Queue.** Это подтверждено тестом
(`test_navigation_tabs.mjs:15`, комментарий `// Owner-approved IA: ... Border
is the fourth tab.`) — сознательное решение продукта, принятое ПОСЛЕ того,
как в `CLAUDE.md` было зафиксировано «Client tab-bar = 3 вкладки». Тот
раздел `CLAUDE.md` устарел, не текущий код.

Остальное в каноне `CLAUDE.md` подтверждено и продолжает действовать
без изменений: нет вкладок «Чаты»/«Разместить», профиль — pushed-экран из
☰, `Deals` = `ChatsListScreen` в dealsMode.

## 2. Вход в сделку — единственный путь

Подтверждено: `grep` по всему `src/` не находит ни одного прямого импорта
`DealWorkspaceScreenV2` вне `src/components/deal/DealWorkspaceRoute.js`.
`ChatScreenV2.js`, `CargoDetailV2.js`, `TripDetailV2.js` — все идут через
`DealWorkspaceRoute`. Канон `CLAUDE.md` про это — верен, без изменений.

### 2.1. FSM сделки — актуальная реализация

Раньше FSM была захардкожена строками прямо в `ChatScreen.js` (мёртвый
файл, см. `docs/CURRENT_ENGINEERING_CANON.md`). Сейчас — чистая функция
`getAvailableDealActions({ role, status, isInternational, t })` в
`src/utils/dealActionResolver.js`, потребляется `DealWorkspaceScreenV2.js`.

```
driver: accepted → in_progress ("Начать рейс")
        in_progress (international=true) → at_border
        in_progress (international=false) → delivered  (домашний рейс без границы)
        in_progress (international=null)  → clarify (disabled, нужно уточнить маршрут)
        at_border → delivered
client: delivered → received ("Подтвердить получение")
        received → completed ("Завершить сделку")
```

Клиент/грузоотправитель **не получает ни одного действия**, пока статус
`in_progress` — сделано намеренно (защита от преждевременного подтверждения
доставки), покрыто юнит-тестами `tests/frontend/rc1_deal_fsm_static.mjs`.

### 2.2. Карта в сделке — не отдельный экран

`DealWorkspaceScreenV2.js` переключает `viewMode` между `'chat'`/`'map'`
внутри ОДНОГО экрана (`openMap`/`closeMap`, testID `deal-header-map` →
`deal-map-fullscreen` → `deal-map-collapse`/`deal-chat-dock`). Это заменило
старую архитектуру `ChatScreen.js` («открыть отдельный экран `TrackTruck`»
через `navigation.navigate('TrackTruck', ...)`).

**Важно:** экран `TrackTruckScreen.js` и маршрут `'TrackTruck'` всё ещё
зарегистрированы в `AppNavigator.js` (дважды, для обеих ролей), но живой
код на них больше не переходит — единственный вызывающий `navigate('TrackTruck', ...)`
это мёртвый `ChatScreen.js`. Это **осиротевший маршрут**: не мёртвый код в
строгом смысле (импортируется, монтируется), но недостижимый ни одним
реальным действием пользователя. Решение — оставить/удалить/переиспользовать
— за владельцем; ничего не удалено в рамках этого спринта.

## 3. Известные разрывы UX (найдены в ходе Track B, не исправлены)

- **Кнопка звонка недостижима.** `DealWorkspaceScreenV2.js`'s call-menu
  modal (testID `deal-call-menu`) существует полностью (audio/video
  disabled, "отправить ссылку на звонок" работает), но `setCallMenuOpen(true)`
  не вызывается НИ ОДНИМ элементом интерфейса — 8 мест сбрасывают в
  `false`, ни одного не включает. Функция звонка сейчас нигде не открывается.

## 4. IS_BETA — не то, что описывает `CLAUDE.md`

`CLAUDE.md` утверждает: «`IS_BETA = true` делает всё платное бесплатным».
Фактически:
- `src/config/supabase.js:20-26` — управляется `EXPO_PUBLIC_IS_BETA`, но
  единственный живой потребитель — текстовая плашка `pro_beta_note` в
  `ProfileScreen.js`. Реальной paywall/монетизационной логики, которая
  читала бы этот флаг, в коде не найдено.
- `src/config/env.js:81` — **второй, независимый** `export const IS_BETA = true;`,
  нигде не импортируется (мёртвый код/потенциальный источник путаницы).
- Реальный переключатель тестового доступа — `BETA_MODE` на backend
  (`backend/config.py`), управляет универсальным OTP-кодом `0000`, и
  защищён `env_check.py` (процесс не стартует в проде, если `BETA_MODE`
  включён без явного намерения).

Риск «забыли выключить IS_BETA → всё бесплатно» ниже, чем предполагает
`CLAUDE.md` — просто потому что монетизация пока не привязана к этому
флагу вообще. Когда её подключат — нужен явный runtime-guard по аналогии
с `env_check.py`, а не полагание на комментарий.

## 5. Ретрагированные находки предыдущих аудитов

Эти два пункта были заявлены как **критичные** аудитом от 2026-09-08 (тот
же день), но не подтвердились при прямой проверке в этом инженерном
спринте — фиксируем здесь, чтобы не тратить время на них повторно:

- **«i18n асимметрия, 141-158 сырых ключей у KK/ZH»** — не подтвердилось.
  `Object.keys()` на реально загруженном `translations` (не ручной парсинг
  строк) показывает RU=EN=KK=ZH=1963, ноль расхождений. Существующий
  `qa/utils/i18nSmoke.js` (уже был в репозитории, просто не упомянут в
  предыдущем аудите) подтверждает: 0 из 969 реальных мест вызова `t()` не
  резолвятся ни в одном языке. См. коммит `investigate(i18n): retract
  earlier "critical" asymmetry finding` в Track B.
- **«`window.height` в DealWorkspaceScreenV2/DealWorkspaceScreen — баг»**
  — не подтвердилось. `window` в обоих файлах — локальная переменная из
  `const window = useWindowDimensions();`, не глобальный браузерный
  `window`. Ложное срабатывание.
- **«ErrorBoundary не смонтирован»** — не подтвердилось. `App.js:328`
  оборачивает весь `App()` (`ThemeProvider → AuthProvider → AppInner`),
  снаружи ещё `Sentry.wrap(App)`.

## 6. Что осталось без изменений

Правила UI, цветовая палитра (кроме уточнения `warning`-токена, см.
`docs/CURRENT_ENGINEERING_CANON.md`), типы кузова, i18n-языки (RU/KK/ZH/EN),
Graphify-gated список зон — всё это в `CLAUDE.md` подтверждено и остаётся
источником истины без изменений.
