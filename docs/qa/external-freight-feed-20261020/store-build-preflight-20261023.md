# PRE-FLIGHT: магазинные артефакты внешней ленты

- Branch/SHA: release/external-feed-store-prep-20261023 отa30dd65f74e803733457283acda35779df576ca8 (дерево app кода соответствует independently reviewed3fa2afe8; CI3/3). QA2 уже a30dd65f; APK214494470 собирается существующим workflow — не дублировать.
- Known-good: проверены сервер/JS поведенческие сценарии; native новая версия ещё не принята. Старый214494469 не содержит исправление ссылки.
- Scope: deploy-play.yml — явный выключаемый флаг ленты при ручной магазинной сборке, тот же зарегистрированный upload key/quality gates, без изменения треков/автоактивации. Адресный контракт env. Подготовка production overlay отдельным частным артефактом на прочитанном runtime.
- Protected: приложение/дизайн/общие компоненты/auth/chat/deals/GPS, новые зависимости, prod runtime, секреты, store activation.
- Evidence: production external API404; магазины доступны, Apple107 уже есть. Native одобрение и production API обязательны до загрузки/публичной активации. Online backup production и отдельный restore-probe PASS23.10 12:05UTC; свежесть перед фактическим deploy проверить заново.
- Checks: новый workflow контракт, существующие store-config/release tests, lint/diff-check, независимое exact review/CI. Артефакты проверить по signature/API/source/версии/hash.
- Rollback: revert только workflow/документа; артефакты не продвигать. Текущие БД не восстанавливать старыми snapshot.
