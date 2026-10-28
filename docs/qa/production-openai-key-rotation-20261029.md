# PRE-FLIGHT: замена истёкшего production OpenAI ключа

Владелец создал новый ключ, сохранил OPENAI_API_KEY в GitHub29.10 и подтвердил применение. Branch fix/production-openai-key-rotation-20261029, base04f5bc6f0165b754592ed5a1786676e09cab009b. Исходник приложения88e349531a3cc8777b95e09b65fb6ebfb8dc29cc не меняется. Полный исторический production backend SHA UNKNOWN/mixed;11-file compatibility overlay из88 принят отдельно.

Known-good: работающие production API/Chat/FSM/Push, API-сделка completed и готовые IPA122/AAB215090229; голос фактически FAIL401 expired_secret_key. Баланс по скриншоту владельца37.01USD. Старый ключ не продлевается, применяется уже созданный владельцем секрет.

Scope: отдельный вызов существующего production executor из protected main, только backend.env OPENAI_API_KEY, PM2 API/scheduler и их сохранённые credentials. Прочие настройки, приложение, frontend, БД, каталог1297, QA2 и сборки не меняются. Секрет передаётся закрытым файлом, не аргументом команды и не журналируется.

Checks: полный quality-gate, адресные тесты секретного ввода/отказа провайдера/сохранности настроек/rollback, усиленное review. До первой записи новый ключ проверяется на api.openai.com; после — health, фактические env обоих процессов, сохранённая PM2 конфигурация и hashes кода. Далее реальный QA voice RU↔ZH.

Rollback: закрытый backup исходного env и dump, обратное обновление только изменённых нами credentials и перезапуск двух прежних процессов. БД не откатываются. Чужие конкурентные изменения не затираются.
