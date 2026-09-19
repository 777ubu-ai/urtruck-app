# STT без внешнего OpenAI API: экспериментальный вариант

Авторизация владельца: проверить и запустить альтернативу, сохранить OpenAI. Добавлен TRANSCRIBE_PROVIDER=local_whisper через существующий speech_to_text_service. Возвращает прежний contract; original/persistence/translation cache остаются прежними. OpenAI selectable и default не изменён. Новая ветка переводчика не внедрена.

## Конфигурация QA

Установить backend/requirements.txt и дополнительно requirements-local-voice.txt. Заранее скачать Systran/faster-whisper-small через hf download; указать абсолютный LOCAL_WHISPER_MODEL_PATH. Runtime local_files_only=True, CPU int8, два потока, одна обработка на процесс; busy — retryable. Нет автоматического скачивания или платного fallback. Число серверных workers умножает расход RAM; production sizing/timeout ещё требует измерения. Модель Whisper исходно разработана OpenAI, но локальный inference не использует аккаунт, API или баланс OpenAI.

## Реальные вызовы

В isolated Mac QA без API-ключа распознаны синтезированные RU 8.57 s и ZH 9.34 s записи: 4.9 s / 4.18 s, язык ru/zh определён автоматически; 7800 сохранено. Это не запись с телефона.

58-секундные fixtures из повторов этих записей прошли через настоящий новый adapter: RU 59.53 s, ZH 55.82 s. RU добавил лишнее «ПОЗИТИВАЮЩАЯ МУЗЫКА» на обрезанном конце. Это quality FAIL, а не production acceptance. Длинные естественные записи, шум и серверные timeout ещё не закрыты.

Argos Translate 1.11.0 с моделями 1.9 ru/en/zh: RU→ZH сохранил сумму; ZH→RU исказил Иу в Италию и пропустил подтверждение документов. Поэтому Argos НЕ подключён к приложению.

OpenAI на работающем backend реально вернул HTTP429 credit_balance_exhausted для STT и translation. Этот статус не исправляется GitHub billing. Credentials не раскрывались; .env и production provider не изменены.

21/21 adapter+STT contract tests PASS. Smoke с настоящей моделью проведён только в isolated QA. Полностью голос→текст→качественный перевод без API OpenAI пока НЕ закрыт; OpenAI сохранён. Статус experimental, RELEASE BLOCKED.

Evidence: /private/tmp/urtruck-voice-live-20260916/{local-stt.json,local-translation.json,local-adapter-58s.json,adapter-tests.log}. Исходные RU/ZH и результаты сохранены там; QA-данные не удалялись.

Источники: https://github.com/SYSTRAN/faster-whisper ; https://github.com/argosopentech/argos-translate .
