# PRE-FLIGHT: Zod блокирует gate перед публикацией каталога

- Ветка: `fix/security-zod-deploy-20261024`, base `af93e4ba02d2f3ce0ef00327cac62f16b3695bec`.
- Production SHA UNKNOWN; production не изменяется этим патчем.
- Причина: GHSA-mrhx-c7xc-m3w5, npm audit отмечает Zod <4.6.6; установлен 3.25.76 через Expo CLI57.0.26. Последняя v3 тоже3.25.76, официального патча3 нет.
- Минимальный кандидат: адресный override Zod4.6.7 только для `@expo/cli`, без обновления Expo57/RN, без ослабления audit gate.
- Проверены два фактических runtime-потребителя CLI: DevToolsPlugin.schema и createMCPDevToolsExtensionSchema. Используют общий поддерживаемый API; нужна поведенческая проверка схем и web export. Прочие зависимости/приложение/сервер/БД не меняются.
- Риск: переход transitive зависимости3→4 меняет семантику части API Zod, потому нельзя считать один audit достаточным.
- Откат: revert package.json/package-lock.json и новых regression/docs; переустановка npm ci. Данные не трогать.
- Источники: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 ; https://github.com/colinhacks/zod/pull/6652 ; https://github.com/colinhacks/zod/releases/tag/v4.6.7 .

## Результат кандидата

- До патча: новый exploit regression FAIL, парсер посещал5000 элементов массива, хотя `.max(1)` уже нарушен.
- После `npm ci`: 20/20 security tests PASS, в том числе bounded array/set/map без посещения элементов и реальные экспортируемые Expo CLI schemas (plugin descriptor, output, MCP strict args).
- `npm run audit:node-forge-exception` PASS: Zod больше не отмечен; сохранено единственное прежнее компенсирующее исключение проверенного node-forge patch. Не добавлены исключения, не изменён security gate.
- `npm run build:web` PASS: реальный Expo export и finalize (1JS bundle,8 обязательных статических источников).
- Lockfile меняет только Zod version/resolved/integrity; число пакетов675 сохраняется. Expo/RN/нативные модули и patch-package patches не меняются.
- Исправление upstream касается bounded containers; не заявляем, что обновление ограничивает все unbounded схемы.
- Native build/device/server/store: не выполнялись. Независимый review и обязательный CI требуются перед merge/deploy.
- Полный `npm run test:unit`: **839/839 PASS**. `npm run lint`: **422 active JS PASS**. `git diff --check`: PASS.
