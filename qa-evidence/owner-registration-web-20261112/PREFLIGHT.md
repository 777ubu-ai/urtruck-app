# PRE-FLIGHT — публичный web-переход и проверка регистрации

- Branch/SHA: `fix/owned-publication-expiry-20261111` / `841660af80d92ea3eca3196064917e1b70195231`.
- PR/base: #705, base branch `fix/vehicle-catalog-count-20261111`, base SHA `a4cd9fbc4587ad7e13e9d975eefc2d93403fa2a0`.
- Рабочее дерево: единственный неотслеживаемый `node_modules` — ранее существовавшая ссылка на соседний worktree; не изменять.
- Known-good: на текущем кандидате CI workflow `43093361644` PASS (backend, frontend/lint/build, mandatory web E2E). Registration без автомобиля выполняет `completeBasic`; профиль водителя сохраняет роль и входит без мастера автомобиля. Недавние registration изменения проверены через mock API и целевые тесты, не на телефонах.
- Scope: публичная статическая web-страница выбора магазинов, подключение её к production web build как build-time option и проверки маршрутов/служебных исключений; повторная проверка уже реализованных optional-полей, загрузки профиля и завершения регистрации без машины. Не менять API/backend, авторизацию, файлы/чаты, данные/БД, мобильные конфигурации/сборки, магазины, production runtime или server routing.
- Защищено: все пользовательские данные и сессии; существующие служебные пути `/api/`, `/security/`, `/storage/`, `/legal/`, `/privacy`, `/terms`, OAuth callback `/?social_auth=1`, платформенные ссылки приложения `/notifications/*`, `/cargos/*`, `/trips/*`, `/driver/*`, сервисный worker и native code без необходимости.
- Проверки: существующие registration frontend/API contract tests, профиль-save E2E на изолированном mock стенде, `npm run lint`, `npm run build:web`, связанные Playwright tests, сборка/проверка правил публичных store links; backend regression только при изменении backend (изменять его не планируется).
- Откат: revert только собственного web landing/build/test commit; для статических файлов восстановить предыдущий проверенный web artifact. Данные и серверные настройки не трогаются.
- Внешние проверки read-only: официальная Google Play страница `com.urtruck.app` отвечает 200 и содержит название UrTruck/пакет; App Store KZ listing `id6764504167` отвечает 200 и содержит UrTruck. В продакшен ничего не записывать.

## Фактический результат этого прогона

- Форма регистрации и backend регистрации не переписывались: активный `ProfileV2` уже вызывает `complete-basic` без автомобиля и переходит на `Main`; серверный `_BASIC_REQUIRED_FIELDS` содержит только `full_name`, а водительские поля автомобиля не входят в блокировку.
- Добавлена страница магазинов только для production web build; normal/QA2 web build остаётся Expo-приложением. Подробные проверки и ограничения — в [RESULTS.md](./RESULTS.md).
- В область backend добавлен только изолированный регрессионный тест сохранности профиля/автомобиля при PATCH; backend логика и база не менялись.
- Перед commit: local unit, lint, normal web build и production-like Playwright — PASS. Новый CI требуется после push.

## Исключения из web-маршрутизации

API и доступ к файлам обслуживаются backend через `/api/`, `/security/`, `/storage/`; OAuth callback использует query `social_auth=1` на `/`; email OTP, восстановление и удаление аккаунта используют API `/api/v1/register/*`, не публичную web-форму; юридические страницы: `/privacy`, `/terms`, `/legal/*`; Android App Links / iOS Universal Links: `/notifications/*`, `/cargos/*`, `/trips/*`, `/driver/*`; файлы ассоциации: `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association`, `/apple-app-site-association`. Публичная страница не должна перехватывать эти URL или API-контракты.

Production SHA остаётся UNKNOWN. Внешний QA2 deploy, нативная приёмка, человеческий review и закрытие файлового P1 остаются вне подтверждённого статуса данной проверки.
