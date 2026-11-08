# PRE-FLIGHT: публикация подготовленного каталога перевозчиков

- Branch: `fix/carrier-production-overlay-20261024`; base `af93e4ba02d2f3ce0ef00327cac62f16b3695bec`.
- Задача владельца: опубликовать контакты перевозчиков для грузоотправителей. Авторизация на серверный deploy дана явно; магазины не затрагиваются.
- Root read-only inspection: production router не содержит `/directory`/`include_carriers`, модуль carrier отсутствует;1297 готовых записей существуют только в QA2 каталоге. Full production SHA UNKNOWN; устанавливаемая overlay baseline фиксируется хешами.
- Scope: существующий единственный writer, manifest, синтетические регрессии. API/service уже review/CI в merged PR589/596; бизнес-код не меняется.
- Protected: main.py, все остальные Python-модули, primary DB, feed/adapter/collector DB, текущие bridge units/env, push/auth/chat/deals/GPS, QA2 каталог и реальные записи в Git.
- Risks: подмена baseline/каталога, потеря runtime после restart, несовместимый старый клиент. Exact checksums, read-only source snapshot, отдельная production DB, backup+restore probe primary, rollback только кода/env. Старые клиенты остаются opt-in: без include_carriers формат прежний.
- Проверки перед deploy: targeted writer tests + existing contracts; независимый review; полный CI. Физический iPhone отдельно, наличие контактов в API не доказывает работу опубликованного бинарника.
- Откат: восстановить router и backend.env из созданного backup, убрать новый module из импортов восстановлением router, restart существующего API. Ни одну базу поверх текущей не восстанавливать; новая carrier DB остаётся сохранённой.
- Статус: PREPARED_NOT_DEPLOYED. Production/native acceptance PENDING.

## Локальная проверка

- 61 writer regression tests PASS: прежний install/source switch сохранён; реальный bundle сверяет все хеши; синтетические activation/repeat/rollback/rollback failure; private payload/incorrect count/symlinks/hardlinks/env overrides/baseline drift отклоняются до live write.
- Существующая production DB каталога не заменяется QA2 снимком, включая скрытые записи; повтор не создаёт дубли и не перезапускает процесс.
- Primary backup и QA snapshot имеют отдельные restore-probe файлы. Код/env откатываются; primary/feed/adapter/QA и созданный каталог не откатываются.
- `py_compile`, `git diff --check`: PASS. Полный CI и authenticated production/client/native smoke остаются PENDING.
