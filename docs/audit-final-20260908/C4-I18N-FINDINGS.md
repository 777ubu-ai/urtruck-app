# C4 — I18N FORENSIC (baseline c4501ece + 98417ddf, read-only)

Handoff для Claude (владелец src/utils/i18n.js и COPY-миграций B4/B5).

## Запущенные гейты (факт)

| Проверка | Команда | Результат |
|---|---|---|
| i18nSmoke | node qa/utils/i18nSmoke.js | EXIT=0, 969 уникальных t()-ключей, 0 missing per locale |
| i18nAudit | node qa/utils/i18nAudit.js | EXIT=0, P1/P2 raw keys: 2 (alias), P3 missing: 0 |
| zhLocalizationSmoke | node qa/utils/zhLocalizationSmoke.js | EXIT=0 |
| test_map_locale_no_russian_leak | node --test | 7/7 |
| test_strict_locale_owned_content | node --test | 10/10 |

## Матрица ключей HEAD

RU 1963 / KK 1963 / ZH 1963 / EN 1963 (unique). Union = 1963. **Словари полностью симметричны, missing = 0.** (Ранние аудиты фиксировали асимметрию ~200 ключей — на HEAD 98417ddf её нет; вероятно, закрыта в сентябрьских коммитах. Это факт прогона, не предположение.)

**Дубликаты внутри блоков** (eval берёт последнее определение; i18nSmoke не проверяет):

| Локаль | Raw entries | Unique | Дублей |
|---|---|---|---|
| RU | 1986 | 1963 | 23 |
| KK | 2114 | 1963 | 151 |
| ZH | 2096 | 1963 | 133 |
| EN | 2129 | 1963 | 166 |

Дубли с РАЗНЫМИ значениями (примеры RU): `open_chat` 'Открыть чат' vs 'Чат'; `save_changes` 'Сохранить изменения' vs 'Сохранить'; `section_transport` 'Транспорт' vs '🚛 ТРАНСПОРТ'; `track_stopped` 'Стоит' vs 'GPS-отслеживание остановлено'; `my_bids_tab` 'Мои предложения' vs 'Мои ставки'. EN: `filter_date_from` 'Date from' vs 'From date'. Язык значений совпадает с локалью блока — утечки нет, но это источник тихой рассинхронизации.

## Raw keys, попадающие пользователю

- Статических ключей вне ВСЕХ словарей: **0**.
- Единственные 2 ключа вне словарей — `confirm_mark_delivered`, `confirm_receipt` — резолвятся KEY_ALIASES (useI18n.js:7-10), используются только через useI18n (ChatScreen.js:2393-2394 legacy, DealWorkspaceScreen.js:704-705 legacy, DealWorkspaceScreenV2.js:651-653 — ЖИВОЙ). Центральный t() alias не знает.
- `DealWorkspaceScreenV2.js:653 t('confirm_complete_deal')` — ключ существует во всех 4 локалях.

### Пробелы i18nSmoke (подтверждены)

1. Сканирует только `\bt(?:Global)?('...')` — обёртку `label(key, fallback)` НЕ видит (живой кейс: PushFilterScreen).
2. Не видит динамические ключи (template literals). Ручная сверка семейств: `push_cat_*` 12/12, `pay_*` 3/3, `rating_tag_*` 11/11, `truck_color_*` 9/9, `vt_*` 7/7, `bt_*` 6/6, `residence_*` 3/3, `deal_event_status_*` 7/7, `status_*` 18/18.
3. Пропускает ключи, оканчивающиеся на `_` (i18nSmoke.js:54); активных литеральных таких нет.
4. Дубликаты ключей внутри блока не проверяет.
5. Локальные COPY-словари и hardcoded-литералы не проверяет.

## Fallback chain (построчно)

- i18n.js:7665-7670: currentLang → EN → rawKey. **RU как промежуточный фолбэк не используется.**
- useI18n.js:17-24: тот же порядок + KEY_ALIASES.
- Локальные COPY: `|| COPY.RU` (кроме DealsScreen.js:276 и mapPermissionCopy.js:20 — `|| COPY.EN`); все COPY имеют 4 ветки, RU-фолбэк недостижим.
- Doc-drift: заголовок i18nAudit.js:5 заявляет «currentLang[key] || RU[key] || key» — фактически EN (i18n.js:7668).

## ПОДТВЕРЖДЁННЫЙ дефект: PushFilterScreen (смонтирован: AppNavigator.js:40, 268)

`label(key, fallback)` (PushFilterScreen.js:45-48) возвращает hardcoded-RU fallback, ключей нет ни в одном словаре:

| Строка | Ключ | ZH/KK/EN увидят |
|---|---|---|
| 154 | `route_direction` | 'Направление' |
| 166 | `push_route_driver_hint` | 'Водитель получит push, когда появится новый груз по этому направлению.' |
| 167 | `push_route_shipper_hint` | 'Грузоотправитель сохранит нужное направление для поиска машин и заявок.' |
| 202 | `saved_routes` | 'Сохранённые маршруты' |
| 206 | `saved_routes_empty` | 'Пока нет сохранённых маршрутов.' |
| 215 | `push_any_cargo` | 'Любой груз' |

Это единственный подтверждённый путь «русский текст ZH/KK/EN пользователю»; i18nSmoke его не ловит (п.1 пробелов).

## Country names gap

`src/utils/countries.js:23-56` — 34 iso-кода, `name` захардкожены по-русски. Ключи `country_XX` есть только для 21 кода. Отсутствуют 18: **UA AE IR AF PK IN MN KR JP VN TH SA IL EG DE FR IT ES**. Call-site'ы защищены фолбэком на `country.name` (CountryPickerSheet.js:53-54, FeedScreen.js:177-178, LocationPickerModal.js:55-56) — сырой ключ не показывается, но ZH/KK/EN видят русское имя страны.

## Проверено, НЕ дефект

- Все ZH-ветки 17 локальных словарей — 0 кириллических значений.
- KK-кириллица — законно. `DealRoom.js:92-99` — полный per-locale map.
- Мёртвые `t(key) || 'RU'` фолбэки (BidModal.js:182, HelpButton.js:72, OtpV2Screen.js:356, CitizenshipScreen.js:60, CreateCargoScreen.js:384/394, CreateTripScreen.js:306/316, EditProfileScreen ×8, displayName.js:40) — ключи существуют, утечки нет.
- HeaderMenuButton.js:42 accessibilityLabel кириллицей — только a11y. push.js:265 имя канала 'UrTruck сообщения' — system UI. LanguageSwitcher.js:32-33 — имена языков by design.
- DATA-словари (places.js, geo.js, cities.js и т.д.) — везде локализующие функции; test_strict_locale_owned_content 10/10.

## Экраны с собственными словарями (все 17 имеют 4 ветки, симметричны)

Смонтированы (prod): FeedScreen.js:40, CargoFeedScreen.js:58, QueueScreenLazyV2.js:38, DealsScreen.js:68, DealWorkspaceScreenV2.js:77, ProfileV2Screen.js:26, PremiumProfileScreen.js:25, DealStatusTimeline.js:10, BackgroundLocationDisclosureModal.js:5, PushPermissionBanner.js:7, DatePicker.js:7, share.js:12, PhoneV2Screen.js:69.
НЕ смонтированы: DealWorkspaceScreen.js:61, QueueScreenLazy.js:36, QueueScreenCarousel.js:33 (legacy); mapPermissionCopy.js — мёртвый модуль (0 импортов).

Замечания: PhoneV2Screen SOCIAL_LABELS без фолбэка (недостижимо — setLanguage гарантирует 1 из 4 кодов, i18n.js:7651-7656). DatePicker и DealsScreen фолбэкаются на EN.

## Итог для Claude (exact gaps)

1. 6 ключей + RU-fallback в смонтированном PushFilterScreen (таблица выше) — высший приоритет.
2. 18 отсутствующих `country_XX` ключей.
3. 23/151/133/166 дубликатов ключей (у части разные значения) — дедуп + CI-проверка.
4. Doc-drift i18nAudit.js:5 (RU→EN фолбэк).
5. Мёртвый mapPermissionCopy.js — кандидат на удаление, не на перевод.
6. i18nSmoke gaps — расширить сканер (label()-обёртки, дубликаты, `_`-суффиксы).

BLOCKED: полнота backend-значений (review tags, free-text типы кузова) — нет доступа к прод-БД; рантайн-проверка на устройстве не выполнялась.
