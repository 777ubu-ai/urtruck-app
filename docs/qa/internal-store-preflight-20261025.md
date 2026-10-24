# Внутренний кандидат Android/iOS — PRE-FLIGHT

Дата:25.10.2026, Алматы. Branch `fix/owned-telegram-feed-share-20261025`, starting HEAD `955b0b90454a4dcfd459c31fff9894915d2f38c9`. Production SHA UNKNOWN. Владелец разрешил предварительные проверки, APK и загрузку в TestFlight/Play для живого тестирования. Массовый rollout не запускается.

## Исходная доказательная база

CI40135865265: все3jobs PASS. Mergec0ff5622 и955 имеют одинаковый tree0e2ba2d09c5e7add813cafd6a2d9fc0d53d09121, что сверено локальнымgit и независимымGitHubcompare. Frontend1536, security135, Push/Bell297, translation/STT220, web43 и replay2. Protected Chat/Push/Translation/FSM/GPS/native/dependencies относительноf00 без прикладных изменений. Это не физическая или серверная приёмка.

## Обнаруженные блокеры сборки

TestFlightRC был привязан кPR561/main/1.0.9/min99, не включал внешнюю ленту и не задавал candidateSHA вEAS. Простой grepQAhost не доказывал встроенную конфигурацию. PlayGradle/storechecks держали1.0.9.

Scope: только TestFlightRC, Playworkflow, runner-only version helper и их tests. Исходные app.json/eas.json/native/SDK/чаты/перевод/push не меняются. Helper меняет только identity в копии наrunner без prebuild, сохраняя остальные поля и пути.

## Подготовленное поведение

TestFlight требует ownedbranch, openPR602 с правильнойbase/headrepo, sourceSHA==workflowSHA==checkoutHEAD и3успешныхCI доnpmci. Берётся последнее выполнение каждого check поid. Версия1.0.12, feedtrue/sourceSHA передаются в EAS и проверяются во встроенном IPA config. Подпись и APNsproduction проверяются, background location отсутствует.

Вход last_verified_ios_build обязателен: свежее значениеASC, не догадка112. Его минимум111 — исторический защитныйfloor. Перед выделением номера read-only EASCLI проверяет remote counter; если он отстал отASC, сборка отказывает и требует синхронизации. Фактический IPA build должен превышать оба значения.

Play ownedbranch допускает только manualQA2/Internal с включённойлентой. Требуется свежий last_verified_play_code, не ниже исторического215024884. Следующий код превышает этот максимум и остаётся в пределахPlay. Version1.0.12 согласуется в config/Gradle наrunner. Остальные ветки сохраняют прежнее поведение. Не ослаблены FCM/signing/16KB/manifest проверки; проверяется actualAABversion/source/feedmarker.

## Проверки

25 адресных testsPASS: identity на копиях реальных native/config; отказ без частичной записи; реальные shellguards EAS/Androidcounter с валидными, отсутствующими, устаревшими и предельными значениями. Полный frontend1539PASS до добавления последнего10-case модуля; этот модуль отдельноPASS. Lint586JS PASS,32shellblocks bash-n PASS, YAML и10-inputlimit PASS, Pythoncompile/diffcheck PASS.

Независимый review APPROVE:15targetedPASS и дополнительные shellсценарии TestFlight(7отказов) / Play(6отказов), без записи при отказах. Дополнительно независимо проверена сортировка последнего check поid: свежиеFAIL/pending/отсутствующийcheck не наследуют старыйPASS. Final reviewAPPROVE,25testsPASS. После коммита обязательны новый CI и tree-equivalence proof для final source.

## Rollback и открытые шаги

Revert узкого buildscriptcommit, без изменения runtime/данных/1324контактов. До exact-finalCI/review сборки не запускать. Actions connection ещё неACTIVE; свежие ASC/Play максимумы, QA2runtime и реальные push/AI credentials не проверены. Не выдавать старые build inputs за актуальные. Живая проверка Android/iPhone выполняется на подготовленных внутренних бинарниках; 10/10 до неё не заявляется.
