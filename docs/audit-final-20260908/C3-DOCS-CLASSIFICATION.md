# C3 — DOCS FORENSIC: классификация 119 markdown-документов

Handoff: Claude B8 (DEPRECATED-заголовки + актуальный канон), Codex (CHANGELOG).
Baseline: main @ c4501ece + коммит 98417ddf (XSS-фикс admin, Claude). Классифицировано 119 md (11 корень + backend/MVP_SETUP.md + 43 docs/ + 64 qa/).

## Ground truth из кода (эталон сверки)

| Факт | Доказательство |
|---|---|
| Таб-бар водителя: 4 вкладки Feed·MyWork·Deals·Queue | AppNavigator.js:125-131 |
| Таб-бар клиента: 4 вкладки (Queue у клиента ЕСТЬ) | AppNavigator.js:132-138 |
| Неон таб-бара: driver #168759, client #FF8400 | AppNavigator.js:114 |
| designV1.js: обе роли #168759, onAccent #FFFFFF | designV1.js:20,24,26,51,55,57 |
| Тема по умолчанию — auto | ThemeContext.js:9,68 |
| Фоновый GPS реализован | backgroundLocation.js:62-64,273; manifest :4,13-14; app.json:82-84,114-115 |
| Голосовые реализованы (POST /chat/voice, storage chat_voice, STT) | chat.py:811-854,953; speech_to_text_service.py |
| Push-gateway: FCM/APNs primary, Expo fallback | push_gateway.py:1,23; коммит c4501ece |
| Версия: 1.0.7, iOS build 27, Android versionCode 9 | app.json:5,27,51 |
| Языки RU/EN/KK/ZH (UZ удалён); ключей RU 1941/KK 1776/ZH 1758/EN 1739 — асимметрия | i18n.js:3-6,10,2091,3917,5725 |
| Типов кузова 21 (TRUCK_KEYS), иконки MaterialCommunityIcons | truckConstants.js:9-13,24-28 |
| Комната чата — одна на пару (deal_key) | chat.py:159,169-228; CHANGELOG 2.0.9 |
| «Печатает…» реализовано | chat.py:731-734,873-874; chatAPI.js:239-246 |
| Регистрация водителя: 4 шага без Selfie/VehiclePhotos | AppNavigator.js:281-288 |
| payment_type в БД и API | marketplace.py:359-360,435,560 |
| Отрицательные цены отклоняются | коммит 0eff9911; test_cargo_price_validation.py |
| CHANGELOG последняя запись [2.1.2] 2026-08-19 | CHANGELOG.md:11 |

## Документы-ловушки — точные противоречия (фикс: Claude B8)

### CLAUDE.md — PARTIALLY CURRENT
| Строка | Ложь | Факт |
|---|---|---|
| :56 | «MainTabs = Feed·Track·Wallet·Profile», #2563EB/#F59E0B | 4 вкладки обе роли; #168759/#FF8400 |
| :77 | 5 типов кузова + «другое» | 21 тип |
| :78 | «Emoji вместо SVG-иконок» | Feather в 10+ файлах, MCI-иконки кузовов |
| :68 | «~1575 ключей (симметрично)» | RU 1941/EN 1739, асимметрия 202 |
| :171 | «Client tab-bar = 3 вкладки» | 4 вкладки у клиента |

Внутреннее противоречие: :56 противоречит :169-176. Секции Android GPS, Graphify-gated, MOCK/REAL — верны.

### CURSOR_INSTRUCTIONS.md — DEPRECATED
MainTabs Track/Wallet; Supabase как основная БД + schema.sql; RU/UZ/KZ/CN; 5 кузовов; #2563EB/#F59E0B; «ТРЕКИНГ: 6 статусов». Сохранить как исторический артефакт v0.

### ROADMAP.md — HISTORICAL (план от создания проекта, «21 файл, БД не подключена»)

### AGENTS_PLAN.md — DEPRECATED как план
Переводчик реализован (translate_service.py); Модератор/OCR частично; Push-диспетчер частично; Антифрод частично; Ценовой аналитик НЕТ; FAQ-бот НЕТ; Контент-генератор НЕТ. «Supabase Edge Functions» ≠ FastAPI/SQLite.

### CHANGELOG.md — PARTIALLY CURRENT (обрыв 19.08.2026; фикс: Codex)
Нет записей для ≥30 коммитов: 0eff9911 (negative prices), c4501ece (push-gateway), 98417ddf (XSS admin), серия fix(chat) (compact deal header, voice contrast, P0 доставка текста, каноническая комната), d9354f71 (iOS build 27).

### docs/APP_OVERVIEW_FOR_DEVELOPERS.md — DEPRECATED
:42 изумруд #00E676 (факт #168759); :41 тёмная тема основная (факт auto); :51-55 таб-бар 5 вкладок с Чатами/Профилем; :113 «GPS НЕ реализован» (реализован); :24-25 «~1740 ключей, полная симметрия» (ложь).

### docs/SPEC_DRIVER_водитель.md — DEPRECATED
:14 #00E676+чёрный текст (факт #168759+белый); :18-26 таб-бар 5 вкладок; :32 регистрация 5 шагов с Selfie (факт 4 без); :39 5 кузовов; :98 «Кошелёк» живой (legacy).

### docs/SPEC_CLIENT_грузоотправитель.md — DEPRECATED
:20 #F59E0B/#0C0A09 (факт #168759/#F6F8F7); :26-37 таб-бар 5 позиций с «➕ Создать»; :71-72 5 кузовов; :76 «цена по договорённости» (удалена, цена обязательна); :128 WalletScreen актуален (legacy).

### docs/CHAT_PUSH_SPEC.md — DEPRECATED (ядро перевёрнуто кодом)
:14-19 ключ комнаты c:{cargo_id}:... (факт deal_key по паре); :31 голосовые выключены (реализованы); :107 GPS не реализован (реализован); :109 «печатает… — нет» (есть); :46 бейдж на «Чаты» (вкладки нет, бейдж на Deals); :59 push только Expo/APNs (факт gateway FCM/APNs). Эндпоинты §7 — точны, кроме отсутствия /voice.

### docs/DRIVER_DESIGN_SPEC.md — DEPRECATED
#00E676 везде ложен; :18 эмодзи-иконки; :82-84 таб-бар 5 вкладок; :12 тёмная тема основная.

### docs/CREATE_CARGO_SPEC.md — DEPRECATED
:32,87,124 #FF8400 клиент (факт #168759; #FF8400 — только неон таб-бара); :33,165 #00E676 водитель; :21 тёмная по умолчанию; :64 5 кузовов; :75 payment_type «нужен столбец» (уже есть).

### docs/BUILD39_CHANGELOG.md — HISTORICAL EVIDENCE (сессия 18-19.07; не трогать, при желании хедер)

## Полная классификация (CSV)

Классы: CUR / PC / DEP / HIST. Владелец: B8=Claude, CX=Codex, —=не определён.

```
path,class,owner,причина
AGENTS.md,CUR,B8,"канон Android GPS сверен с app.json/manifest — верен"
CLAUDE.md,PC,B8,"строки 56,68,77,78,171 ложны; остальное верно"
AGENTS_PLAN.md,DEP,B8,"3/7 агентов нереализованы; Edge Functions ≠ FastAPI"
CHANGELOG.md,PC,CX,"обрыв 19.08.2026"
CURSOR_INSTRUCTIONS.md,DEP,B8,"всё ключевое ложно"
DEPLOY.md,PC,—,"IP/PM2 подтверждены; CI теперь deploy.yml/secure-production-deploy"
PRELAUNCH_QA_PROMPT.md,PC,—,"сценарии живы, навигация не сверена"
README.md,DEP,B8,"v0: Supabase schema.sql как основная БД — противоречит FastAPI/SQLite"
ROADMAP.md,HIST,—,"план от создания проекта"
SECURITY_ARCHITECTURE.md,PC,B8,"scoring/blacklist существуют; построчная пересверка не делалась"
backend/MVP_SETUP.md,PC,—,"сервисы существуют; prod-режим WhatsApp — BLOCKED без сервера"
docs/QA_AUTH_STRATEGY.md,PC,—,"rate_limit.py фактически в api/, не services/"
docs/SMART_BRIDGE_CGR_INTEGRATION_REQUIREMENTS.md,HIST,—,"требования 22.04.2026"
docs/social-auth-mobile-secure-handoff.md,CUR,—,"workflow существует; secrets-only не противоречит"
docs/appstore/screenshots/README.md,HIST,—,"паспорт ассетов итерации"
docs/cgr/TZ-CGR-001-v1.1.md,PC,—,"ТЗ; SQLite-миграция подтверждена кодом"
docs/cgr/CGR_DISCOVERY.md,HIST,—,"разведка 13.06.2026"
docs/cgr/DECISIONS.md,HIST,—,"решения 28-29.05.2026"
docs/cgr/NIGHT_PROGRESS.md,HIST,—,"журнал 28-29.05.2026"
docs/cgr/PACKAGE_README.md,HIST,—,"пакет-инструкция v1.1"
docs/cgr/QA_CHECKLIST_CGR.md,PC,—,"модули существуют; требует прогона"
docs/release/google-play-background-location.md,CUR,B8,"канон, консистентен с кодом и тестами"
docs/release/android-firebase-config.md,HIST,—,"инцидент-репорт 26.08.2026; текущее FCM — BLOCKED без устройства"
docs/release/offer-expiry-20260820.md,CUR,—,"BID_TTL_HOURS=48 подтверждён (bid_expiry.py:20)"
docs/release/pr-187-reconciliation.md,HIST,—,"реконсиляция PR #187"
docs/release/production-deploy-router-fallback.md,PC,—,"актуальность после PR #234 — нужен prod"
docs/release/push-event-matrix-2026-08-26.md,PC,CX,"не учитывает push-gateway и chat-фиксы сентября"
docs/release/push-live-checklist-2026-08-26.md,HIST,—,"device-proof 26.08"
docs/release/urtruck-live-device-smoke.md,HIST,—,"runbook 2026-08"
docs/reports/APPSTORE_RELEASE_CHECKLIST.md,PC,—,"версии устарели (1.0.7/build 27), процесс валиден"
docs/reports/ASC_SUBMISSION_GUIDE.md,HIST,—,"контекст 1.0.0 устарел"
docs/reports/BUILD35_INSTRUCTIONS.md,HIST,—,"build 35"
docs/reports/DESIGN_SYSTEM.md,DEP,B8,"стандарт эмодзи-иконок отменён 13.06"
docs/reports/DESIGN_SYSTEM_TZ.md,HIST,—,"ТЗ редизайна 12.05"
docs/reports/FINAL_STATUS.md,HIST,—,"статус 10.05"
docs/reports/FIXES_DONE.md,HIST,—,"аудит v60 14.04"
docs/reports/FULL_AUDIT_REPORT.md,HIST,—,"аудит v1.0.50 24.04"
docs/reports/LAUNCH_REPORT.md,HIST,—,"v58 19.04"
docs/reports/MASTER_PLAN.md,HIST,—,"мастер-план 16.07"
docs/reports/PR15_VS_QA_COMPARISON.md,HIST,—,"эпоха rc1"
docs/reports/QA_REPORT.md,HIST,—,"TestFlight build 25, 11.06"
docs/reports/REGRESSION_CHECKLIST.md,PC,B8,"26.07; пункты не сверены с сентябрьским кодом"
docs/reports/RELEASE_SIGNING.md,PC,—,"инцидент верен; актуальность ключей BLOCKED"
docs/reports/SERVER_ACCESS.md,PC,—,"доступ подтверждён; креды не проверяемы"
docs/reports/TESTFLIGHT_CHECKLIST.md,HIST,—,"11.06"
docs/reports/VERIFY_REPORT.md,HIST,—,"v1.0.50 21.04"
docs/reports/ИТОГ_ПРОСТЫМ_ЯЗЫКОМ.md,HIST,—,"12.06"
qa/README.md,CUR,—,"команды существуют в package.json"
qa/TEST_METHODOLOGY.md,CUR,—,"команды существуют"
qa/AUTONOMOUS_QA_REPORT_20260522-1558.md,HIST,—,"22.05"
qa/BACKEND_DEPLOY_PREFLIGHT_VARIANT_B.md,HIST,—,"preflight итерации"
qa/BUILD16_PREP_REPORT.md,HIST,—,"build 16"
qa/BUILD17_PREP_REPORT.md,HIST,—,"build 17"
qa/BUILD29_PREFLIGHT.md,HIST,—,"build 29"
qa/BUILD39_QA_CHECKLIST.md,HIST,—,"build 39"
qa/CARGORUQSAT_INTEGRATION_PLAN.md,HIST,—,"2026-05/06"
qa/CHAT_*.md (9 файлов),HIST,—,"чат-QA май-июнь; чат сильно менялся — evidence не трогать"
qa/CLIENT_AUDIT_REPORT.md,HIST,—,"своя итерация"
qa/I18N_COMPLETE_REPORT.md,HIST,—,"числа ключей устарели"
qa/MAESTRO_*.md (3),HIST,—,"брифы"
qa/MORNING_HANDOFF.md,HIST,—,"11.06"
qa/NIGHT_OPS_LOG.md,HIST,—,"та же сессия"
qa/PR105_QA_REPORT.md,HIST,—,"PR #105"
qa/PUSH_CODE_REVIEW.md,HIST,—,"до push-gateway"
qa/PUSH_DEVICE_TEST.md,HIST,—,"device-тест"
qa/PUSH_DRIVER_PRODUCTION_CHECK.md,HIST,—,"prod-проверка"
qa/PUSH_MANUAL_TEST_PLAN.md,PC,"план пушей; не учитывает gateway"
qa/PUSH_QA_REPORT.md,HIST,—,"отчёт"
qa/RATELIMIT_REPORT.md,HIST,—,"rate_limit.py существует"
qa/RC1_AUDIT_FINDINGS_2026-08-06.md,HIST,—,"RC1 06.08"
qa/SESSION_REPORT_20260522-1650.md,HIST,—,"22.05"
qa/SHIPPER_CARD_RELEASE_CHECK.md,HIST,—,"карточки shipper"
qa/SHIPPER_PUSH_CHANGELOG.md,HIST,—,"до gateway"
qa/TERMINAL_*.md (10),HIST,—,"брифы build 38-42"
qa/maestro/*.md (4),HIST,—,"отчёты 10.06 + карта"
qa/manual/CHAT_*.md (5),HIST,—,"ручные чеклисты; часть утверждений опровергнута кодом — evidence сохранить"
qa/reports/*.md (7),HIST,—,"прогоны июня-июля; push 28.08 ДО gateway"
```

## BLOCKED (read-only из репо)

1. Prod-режим WhatsApp/Face/Storage — нет доступа к серверу и .env.
2. FCM/APNs доставка — нужны устройства и prod-секреты.
3. Router-fallback после PR #234 — нужен prod.
4. Внешний контур CGR (cgr.qoldau.kz).
5. Keystore/подпись — секреты недоступны.
