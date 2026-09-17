# OpenAI: проверка после оплаты — 2026-09-17

Ветка: qa/master-hard-qa-20260916.
Source HEAD: 9f0e9fa2b12aff29a2c24dba4012079b7206b7e5.
Production API: https://urtruck.kz/security/api/v1/chat/translate/info.

## Доказано в этом прогоне

- Реальный серверный OpenAI key: успешные вызовы, quota 429 больше не воспроизводится.
- Текст RU→ZH: успешный перевод, 8.11 с; ZH→RU: 1.39 с. Это единичные измерения, не SLA.
- STT provider=openai, model=gpt-transcribe; перевод openai/gpt-4o-mini.
- Сохранённое физическое голосовое Boris, message 1244: непустой русский transcript, STT 2.54 с.
- Сохранённая запись message 1245, 24 с: provider вернул пустой transcript. PASS не присвоен; содержание аудио ещё не прослушано.
- QA fixture ru-natural58.wav: русская речь распознана, определён ru, перевод на китайский; 5.37 с на серверную цепочку.
- QA fixture zh-natural58.wav: китайская речь распознана, определён zh, перевод на русский; 6.89 с на серверную цепочку.
- Указанные длинные файлы — ранее подготовленные QA fixtures, не новая запись с физического телефона. OpenAI usage вернул 56 и 60 секунд соответственно.
- Постоянная translation_memory: перевод сохранён и успешно прочитан новым соединением с БД без повторного provider call.
- На runtime БД таблица translation_memory создана штатным _ensure_translation_schema(). Первый диагностический скрипт пропустил эту инициализацию и получил no such table; endpoint вызывает её сам. Это ошибка диагностического скрипта, а не доказательство ошибки endpoint.

## Что ещё не доказано

- Полный authenticated HTTP /chat/transcribe + сохранение transcript в строке сообщения и повторный tap из приложения.
- Physical voice RU↔ZH one tap, relaunch persistence и две новые записи 55–60 с.
- На Xiaomi BUA6JB99T465Q49X, APK 211040059, при открытии выбранной комнаты показано «Сообщений пока нет». Поэтому physical «В текст» в этом прогоне не засчитан. Требуется отдельная диагностика соответствия room/deal и загрузки сообщений.

Бизнес-код, ключи, конфигурация провайдера, APK и сессии не менялись. Перезапуск для оплаты не потребовался.
Вердикт: OpenAI provider API PASS; полный voice product acceptance остаётся OPEN; общий RELEASE BLOCKED.
