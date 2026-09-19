# UrTruck — F03: восстановление голосового перевода

Дата: 16.09.2026, UTC. Основание: владелец утвердил `URTRUCK-RELEASE-REMEDIATION-20260916-v1` и начало исправлений в текущей QA-ветке.

## База и границы

- Ветка: `qa/master-hard-qa-20260916`.
- Исходный HEAD и проверенный remote ref: `e24a0268c59f0234031506fbc4dd5acd0f56d116`.
- Перед работой tracked-файлы чистые, только untracked `node_modules`.
- GPS recovery `07013b6e` остаётся ancestor.
- Production, БД, credentials, установленные приложения, APK/versionCode и телефоны не изменялись.
- Это исправление frontend-дефекта F03, не завершение всего W2 и не разрешение выпуска.

## Воспроизведение и причина

В автоматическом тесте выполнялся извлечённый из настоящего `DealWorkspaceScreenV2` обработчик `toggleVoiceTranscript`: сохранённый китайский original, RU-интерфейс, одно нажатие.

До исправления: 1 тест, 0 PASS, 1 FAIL; actual API calls `[]`, expected `[['translate', 'v1', 'ru']]`.

Причина: ветка с уже существующим transcript только меняла видимость и выходила. Сохранённая расшифровка ошибочно считалась готовым результатом на языке интерфейса. Дополнительно прежнее состояние не разделяло переводы по target language и использовало общий индикатор загрузки одного сообщения.

## Исправление

1. Выделено только frontend-состояние голосового текста в `src/utils/voiceTranscriptState.js`. Используются прежние `chatAPI.transcribe` и `chatAPI.translate`; новый provider, таблица или backend-архитектура не создавались.
2. Сохранённый original другого языка вызывает только перевод. Первое распознавание использует существующий совмещённый endpoint.
3. RU/RU и ZH/ZH не требуют дополнительного translation; коды языков нормализуются.
4. Cache и pending/error разделены по message и target language; STT single-flight общий для одного сообщения.
5. Retry после STT failure повторяет STT; после translation failure повторяет только перевод.
6. Poll сообщений не стирает готовый перевод. Смена языка использует original и отдельный cache.
7. Поздние ответы не публикуются в другую комнату/аккаунт и не запускают последующие этапы после отключения состояния. Уже отправленный HTTP-запрос этим не отменяется.
8. Пока перевод ожидается, original не выдаётся за готовый перевод. При ошибке original явно подписан; исходный текст не теряется.
9. Ошибки локализуются текущим `t()`; raw provider message не отображается. Stub/empty/wrong-target translation не считается успехом.
10. Запись, загрузка/воспроизведение голоса, FSM, суммы, Back, tabs и Bell не переписывались.

## Файлы и проверки контрактов

| Файл | Изменение |
|---|---|
| `src/screens/DealWorkspaceScreenV2.js` | Подключение scoped state, hydration, переключение/повтор, защита позднего messages response |
| `src/components/VoiceMessageBubble.js` | Pending/translated/original fallback и защита кнопки retry |
| `src/utils/voiceTranscriptState.js` | Узкий координатор frontend-состояния |
| `tests/frontend/test_voice_translation_state.mjs` | 22 новых поведенческих и интеграционных проверок извлечённых callbacks |
| `tests/frontend/test_chat_voice_stt_push_contract.mjs` | Контракт прежнего API через выделенный helper |
| `tests/frontend/test_deal_chat_composer_visibility.mjs` | Вместо проверки расположения строки ошибки — отдельная поведенческая проверка локализованной STT-ошибки |
| `tests/frontend/test_strict_locale_owned_content.mjs` | Проверка обязательных зависимостей loader, допускающая новые зависимости |

В первом общем прогоне 642/644: два FAIL были static assertions о прежнем месте строки ошибки и точном массиве из трёх dependencies. Проверки IME/composer, языка, комнаты и пользователя сохранены; тесты не отключались.

## Graphify и риск связей

До изменений выполнен AST-only Graphify `0.9.63` в изолированной venv; без LLM. После изменений граф пересобран: 8572 узла, 18662 связи. Новый helper используется экраном сделки и тестами; других production consumers не найдено. Второй consumer VoiceMessageBubble — DesignPreview — сохраняет прежний интерфейс props.

Общие `get_conn`, `useI18n`, theme/auth и `AppNavigator` не изменялись. Ограничения графа: 19 SQL-файлов без optional parser и 3 частично разобранных Gradle-файла; это не полный SQL/native-аудит. Граф не коммитится; сохраняется отдельно от worktree для диагностики.

## Результаты текущего пакета

Среда: Mac, Node 25.9.0; исходный red-test — scratch Node 24.19.0. Новые проверки не вызывают живой платный provider.

| Команда/проверка | Результат |
|---|---|
| Red-test F03 на прежнем handler | FAIL воспроизведён |
| Целевые voice/STT/chat canon/playback suites | 56/56 PASS, exit 0 |
| `npm run test:unit` после обновления контрактов | 645/645 PASS; 0 fail, exit 0 |
| `npm run lint` | PASS: 372 active JavaScript files |
| `npm run qa:i18n` | PASS: RU/EN/KK/ZH; по 2003 ключа, 916 call-site keys, missing 0 |
| `npm run qa:zh` | PASS: 11 маршрутов, 113 геоточек, 49 cargo labels, 6 screenshot fixtures, 4 system fixtures, 6 dialogs |
| `npm run qa:nav` | PASS |
| Прямой `CI=1 npx expo export --platform web --output-dir <evidence>/web` | PASS, exit 0 |
| `git diff --check` | PASS |

Предупреждение Node `MODULE_TYPELESS_PACKAGE_JSON` остаётся; ради него тип пакета не менялся.

Логи на Mac: `/private/tmp/urtruck-voice-fix-20260916-jn2qix/`: `targeted.log`, `unit.log` (промежуточные 2 FAIL), `unit-final.log`, `web.log`, `graphify-final.log`. Постоянное воспроизводимое evidence — этот отчёт и тесты в Git; временный каталог не является единственным доказательством.

## Что не проверено этим пакетом

- Реальный STT/translation provider, качество RU↔ZH, записи 55–60 секунд, quotas.
- Реальный relaunch клиента и persistence работающего сервера: тесты моделируют повторное получение persisted original через прежний API.
- Backend full suite в этом пакете не запускался; исторические 822 PASS не выдаются за новый результат.
- Android/iOS native build, микрофон, карта, push, GPS и физические устройства — NOT RUN по текущему code-only объёму.
- F01/F02/F04/F05/F06/F07/F08/F09 этим пакетом не закрыты.

**F03: FIXED IN CODE / AUTOMATED PASS. W2 целиком: NOT CLOSED. FINAL RELEASE VERDICT: BLOCKED.**
