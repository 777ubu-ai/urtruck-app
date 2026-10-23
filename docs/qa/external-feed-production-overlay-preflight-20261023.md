# PRE-FLIGHT: защищённая доставка внешней ленты в production

- Branch/SHA: ops/feed-production-overlay-20261023 от protected main d6759c76ca74abc00a09cb210f235f33b55f64c9.
- Known-good: приложение3fa2afe8 / QA2a30dd65f, CI и независимыйreview PASS; фактический production main.py SHA256834e62282b20dc9e3af84a5739cdcfed4631d2432b075b0268322dd0c69ebe5b. Полный runtime имеет смешанное происхождение; единый SHA UNKNOWN. Старый production API ленты404.
- Scope: режим external_feed_overlay существующего production executor, восемь изолированных модулей из проверенного9filemanifest и5строк main.py через patch с хешами до/после.
- Protected: auth/роли, chat/deals/expenses/GPS/push, основная БД и Telegramочередь, вебклиент, сборки/версии приложений. Полный backend и общий envbootstrap не копируются.
- Checks: проверка содержимого пакета, неизменности baseline, onlinebackup актуального DB_PATH из процесса и отдельныйrestoreprobe, адресныйоткат при ошибке, изолированные тесты, полныйCI и независимыйsecurityreview exactSHA.
- Deployment: только существующий санкционированный caller на protectedmain, environmentproduction и общая сериализация. Маркер .production-deploy-mode блокирует автоматический полный deploy подготовительного commit. Узкий режим вызывается вручную и дополнительно требует полный qualitygate; break-glass full остаётся без изменения поведения.
- Rollback: остановить только новый мост, вернуть сохранённые код и .env, рестарт того же PM2; новые БД и пользовательские записи не удалять/не заменять старымsnapshot.
- Авторизация: владелец делегировал решение по конкретному узкому9fileпакету; подготовка не разрешает обход branchpolicy/approvals.
