# UrTruck — F09: ошибки web-сборки больше не скрываются

Дата: 16.09.2026, UTC. Пакет W1 утверждённого `URTRUCK-RELEASE-REMEDIATION-20260916-v1`.

## База

Ветка `qa/master-hard-qa-20260916`, исходный HEAD `41d2569f45478642a2af32c87a9f15dfd67f3473` (исправление F03 уже сохранено на origin). Tracked-файлы перед пакетом чистые; untracked только `node_modules`. Изменены только build script, финализатор, тест и этот отчёт.

## Дефект и воспроизведение

Прежний `build:web` содержал цепочку `&& ... || true`, поэтому ошибка Expo могла маскироваться успешным копированием static assets/последним `true`.

Black-box тест выполняет реальную строку `scripts.build:web` из package.json в отдельном временном каталоге. Только исполняемый `npx` там заменён fixture, который возвращает exit 23. Каталог содержит старый index/bundle и необходимые исходные static assets.

На исходном коде: ожидался exit 23, получен exit 0; воспроизводящий тест FAIL. После исправления: exit 23, копирование после failed export не выполняется.

## Изменения

- `package.json`: `npx expo export --platform web && node scripts/finalize-web-export.mjs`.
- `scripts/finalize-web-export.mjs`: проверяет непустой index и локальные entry JS bundles, запрещает выход пути bundle из dist; проверяет восемь обязательных static sources до копирования; сохраняет прежние legal/share/deep-link URL и проверяет результат.
- `tests/frontend/test_web_build_fail_fast.mjs`: пять тестов, включая перебор каждого missing asset, missing index/bundle, empty bundle, путь вне dist, правильный exit и успешное копирование всех адресов.
- Все перечисленные static assets объявлены обязательными. Необязательные ошибки не подавляются общим `|| true`; dependency versions и lock не менялись.

## Проверки

| Проверка | Результат |
|---|---|
| Red-test export exit 23 на прежней команде | FAIL воспроизведён: actual 0 |
| Пять новых build tests | 5/5 PASS |
| Полный suite в рабочей QA-копии | 650/650 PASS, exit 0 |
| Полный suite после чистой установки в isolated copy | 650/650 PASS, exit 0 |
| `node --check scripts/finalize-web-export.mjs` | PASS |
| `npm run lint` в isolated copy | PASS, 373 active JavaScript files |
| `qa:i18n`, `qa:zh`, `qa:nav` в isolated copy | PASS |
| `npm ci --no-audit --no-fund` | PASS, 1016 packages; оба patch-package patch применились |
| `CI=1 npm run build:web` на чистой установке | PASS, exit 0; 1 entry JS bundle, 8 static sources |
| `git diff --cached --check` | PASS |

Чистая копия создана из Git tree `d952e9604e9a174f8f68c112d201f322d34bea06`; после тестов добавлен только этот отчёт. Каталог: `/private/tmp/urtruck-web-failfast-20260916-RKOb1R`.

Первая попытка isolated build с внешней ссылкой на node_modules завершилась честным exit 1: Metro не разрешил `@babel/runtime/helpers/interopRequireDefault` вне нового project root. Это не скрыто и не исправлялось изменением приложения; ссылка сохранена отдельно, затем выполнен полноценный npm ci и успешный повтор.

Логи: `/private/tmp/urtruck-voice-fix-20260916-jn2qix/` — `build-web-final.log` (первая неуспешная попытка), `build-npm-ci.log`, `build-web-clean.log`, `unit-with-build.log`, `unit-clean.log`. Этот отчёт и воспроизводимые тесты сохраняются в Git; временные логи не единственное evidence.

## Ограничения

- npm сообщил deprecation warnings (включая tar/glob); это не dependency security scan. SCA и multipart/F02 остаются отдельной задачей W1. Зависимости не объявляются безопасными по одному npm ci.
- Сборка не проверяет живые MapKit/routing/STT credentials, production API, микрофон, GPS или push.
- Android/iOS, production deployment, магазинные публикации и телефоны не запускались.
- F03 имеет отдельный отчёт `docs/qa/voice-translation-fix-20260916.md`; его live-provider/platform приёмка остаётся открытой.
- F01/F02/F04/F05/F06/F07/F08 этим пакетом не закрыты.

**F09: FIXED IN CODE / AUTOMATED PASS. W1 целиком: NOT CLOSED. FINAL RELEASE VERDICT: BLOCKED.**
