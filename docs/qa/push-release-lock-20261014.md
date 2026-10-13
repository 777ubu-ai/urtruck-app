# Push и перевод: защита от регрессий и подмены установленной версии

Владелец14.10.2026 разрешил усилить защиту push/badge и изоляцию изменений. Base47c88169734f3d31ae73b62d7bc5046a63168349. Scope: CI и проверка deploy, без переписывания приложения.

Наблюдаемый пробел: CI уже проверяет unread/read-to-zero, поздние сообщения, дубли и registry. Production writer проверяет health, но не фактические backend sourcefiles. Поэтому QA2 PASS сосуществует со старым/смешанным production; последняя ложная единица возникла именно так. Одни отдельные папки этого не исправляют.

Файлы: scripts/ops/runtime_release_manifest.py, backend/tests/test_push_release_manifest.py, quality-gate-reusable.yml, production-deploy-execute.yml и этот журнал. Auth/FSM/chat/translation/push businesscode, DB/env/dependencies/native/ASC/review защищены и не изменялись.

Новая защита: чистый exact Git checkout создаёт SHA256 manifest tracked backend Python/SQL/requirements и qa_ai_service/translation_memory/data/*.jsonl. Проверка read-only, без импорта app/startup. Неверный sourceSHA/environment, отсутствующие/лишние/изменённые runtimefiles, unsafepaths и чужой cwd/PID live listener блокируют результат. QA2 не принимается как доказательство production.

Общий PR/release CI содержит блокирующую сверку manifest и отдельные push delivery/unread/read-to-zero и translation/STT subsets. Полный canonical backend/frontend/security/E2E сохранён. Provider/device delivery не выводится из CI PASS.

Production writer проверяет текущую доверенную базу ДО копирования source/frontend/env. Проверяет candidate до restart, затем его files и cwd/PID listener8001 после restart; PID должен совпадать с named PM2 process; только после этого сохраняет новыйmanifest. Одного backend200 недостаточно. Новый writer/force/bypass не добавлены.

Условие миграции: текущий production backend fullSHA UNKNOWN/смешанный и не имеет доверенного runtimemanifest. Новый workflow должен остановиться до любых productionwrites. Нельзя придумывать полныйSHA или автоматически принимать неизвестныйкод. Нужна отдельно проверенная миграция на known-source baseline через QA2 rehearsal/backup/физическую приёмку. До merge в активный writer новаязащита deploy НЕвключена.

Rollback этой правки: откатить только helper/guard/CI изменения workingbranch; production badgehotfix47c не трогать. Ошибка полного deploy всё ещё может требовать операторского rollback: эта правка не реализует атомарный deployment или автоматический полный rollback.

Локально33 stdlib tests PASS: cleanGit/dirtycode/ложныйSHA, смешанныйpush/перевод, неверноеокружение, missing/extrafiles, path/symlink, сохранениеenv/data, неверный/отсутствующий/неоднозначныйlistener и порядокCI/deploygate. YAML parsing PASS. CI первого head444637a поймал переименование обязательного Push/Bell step: прежнее название восстановлено, существующий guard не ослаблен. Независимый review444637a нашёл P1: отсутствующий hash translation-memory JSONL и неподтверждённый PID PM2 listener. Оба закрыты кодом и пятью дополнительными регрессиями. Новый exacthead требует свежих FullCI/independentreview.

Mac был offline при старте, затем доступ восстановлен. Read-only rehearsal444637a на QA2:151 runtimefiles совпали, listener8002 cwd подтверждён; deployment остаётсяa1fa282, не444637a. После расширения JSONL/PID нужна свежая сверка. OPPO/Huawei/iPhone, реальные foreground/background/locked/sound/deeplink/0→1→0 остаются не закрыты. Серверы не менялись, платные сборки не запускались. 10/10 не заявляется.

Review324237d6 выявил P1 удаления/rename: существующий scp overlay оставляет obsolete runtimefile и проваливает post-copy gate уже после writes. Новый preflight сравнивает manifest базы и candidate и отказывает removal/rename ДО всех production writes. Live файлы автоматически не удаляются; такие release transitions требуют отдельного staged migration. Это намеренное ограничение overlay, а не утверждение атомарного deploy. Добавлены4 регрессии: removal, rename, безопасное addition, неверное environment.
