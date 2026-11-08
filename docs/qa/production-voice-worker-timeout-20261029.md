# PRE-FLIGHT: production STT worker timeout

Branch fix/production-voice-worker-timeout-20261029, base72d7f33f3952d1c16abdd4492207ae9d2b74e791. Ключ восстановлен защищённым run40765479471, provider200, API/scheduler используют новый key. Runtime source UNKNOWN/mixed,11-module overlay88 принят отдельно; приложение88 и бинарники122/215090229 не меняются.

Новый фактический блокер: scheduler получает TRANSCRIPTION_UNAVAILABLE до HTTP-запроса. QA2_OPENAI_STT_TIMEOUT_SECONDS отсутствует; это имя параметра существующего STT service даже в production. API main выставляет8 при startup, scheduler — нет. Read-only subprocess с реальным scheduler env: FAIL; с единственным override8: PASS. Модель gpt-4o-mini-transcribe и новый ключ корректны.

Scope: только этот несекретный параметр scheduler PM2 env=8 и его сохранённые dump/dump.bak, через адресный RPC с одним полем. Scheduler/jobs.py не читает .env, поэтому изменение только файла отклонено review до применения. API не перезапускается. Секреты, модели, прочие настройки, код, БД, каталог, QA2 и бинарники защищены.

Checks: полный CI, усиленное review, тесты сохранности прочих байтов env, отказ при PM2 override, exact rollback/concurrent-owner edit. После применения health и оба реальные production voice58s RU↔ZH, включая повтор старой неуспешной задачи.

Rollback: закрытый backup dump/dump.bak, точное восстановление только своих файлов при CAS. В живом scheduler вернуть прежнее значение одного timeout; для первоначально отсутствующего параметра PM2 merge RPC допускает только пустую строку (сервис одинаково отклоняет отсутствие и пустую строку до HTTP). Это семантическое восстановление отсутствовавшего параметра, не ложное утверждение точного удаления переменной. Третье чужое значение сохранить, сообщить rollback_failed. Прочие env, ключ, API, backend.env, код и БД не менять.
