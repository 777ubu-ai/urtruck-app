# UrTruck — продолжение QA060 и исправления для QA061

Дата: 17.09.2026. Общий verdict: BLOCKED. Это не release acceptance.

## Подтверждённая база

- Ветка `qa/master-hard-qa-20260916`; исходный HEAD `6a0fdca3800ec94bc5a116197d6ad6508b781f0d`.
- RDC снова online с 12:31 UTC. Оба Xiaomi доступны через adb, QA2 1.0.8 / 211040060.
- 4PYDDI4DHIXS5DD6: Boris/shipper; BUA6JB99T465Q49X: Serik/driver.
- OPPO в adb отсутствует; его version/session/push/sound не проверены.
- Сделка `1c26ef04-3b99-4071-aa6f-c650ca11af76`, room `240865c8-a0ed-490d-b540-774e9b973688`: Иу → Москва, $7000, in_progress. Подтверждены UI обеих ролей и read-only production DB.
- Production DB находится в `/home/ubuntu/urtruck/runtime/security.db` (подтверждено конфигурацией). Первое диагностическое чтение устаревшего пути не нашло сделку; записи не выполнялись.
- SHA256 действующего `backend/api/chat.py`: `b5f6fe06a1975f4af2dcc074a416933d0ee1b16f209a251de68c2125b98e34e4` — совпадает с переданным исправлением.

## Physical evidence на 060

1. История открылась на обоих Xiaomi: loading → реальные сообщения/voice. Успешная загрузка не объявляется проверкой искусственного storage failure/retry.
2. Message 1244: сохранённая русская расшифровка открылась. После переключения Serik на ZH одно нажатие показало китайский перевод; исходный русский доступен отдельно. DB: provider=openai, voice_transcribed_at=2026-09-17 10:03:23, target_lang=zh. Списание провайдера и полный process-relaunch cache не проверены.
3. UI-отправка Boris → Serik: `QA060_1238_Shipper_to_Driver`, message 1250, 12:38:19 UTC; сообщение видно у получателя.
4. UI-отправка Serik → Boris: `QA060_1240_Driver_to_Shipper`, сообщение видно после открытия push.
5. Boris был на домашнем экране Android. Получен native FCM notification, channel=urtruck_messages_v2, importance=5, isNoisy=true, mSound=content://settings/system/notification_sound, mLastAudiblyAlertedMs=1789648780986. ОС зафиксировала звуковое оповещение; внешняя слышимость человеком не подтверждена.
6. Нажатие настоящего уведомления открыло ту же сделку с Back и новым сообщением.
7. Native Yandex MapKit открыт на QA060; есть картографическая подложка, GPS truck marker, затем появилась непрямая полилиния и 9063 км, расчётное время 4 д 20 ч, с отдыхом 12 д 8 ч. Первая загрузка медленная: в 12:40:28/47 маршрут строился, к 12:42:17 отображён. ETA/остаток/прогресс остались «—». Полный routing/GPS acceptance не закрыт.

Evidence: `docs/qa/evidence/qa060-resume-20260917/`.

## Найденные и исправляемые дефекты

### Сообщения под клавиатурой

Физически воспроизведено на обеих ролях: composer поднят к IME, но FlatList сохранил высоту всего экрана; отправленное сообщение находилось ниже видимой области (пример y1488 при composer y869).

Исправление: измеренный keyboardDockInset резервируется у всего chat viewport; composer остаётся в обычном flex layout. Удалён абсолютный overlay и искусственный нижний padding списка. onLayout повторяет защищённую прокрутку к последнему сообщению, сохраняя положение читателя старой истории. Общий hook и iOS KAV не менялись.

### Русское системное превью в ZH списке сделок

Чат локализует событие, но DealsScreen выводил сырое last_message. API дополнен last_message_sender_id; все поля последнего сообщения выбираются с одинаковым порядком created_at DESC, id DESC. Frontend локализует только sender=system. Совпадающий пользовательский текст и старый API без автора остаются в оригинале. Миграции БД не нужны.

## Проверки кода

- Frontend: 694/694 PASS. Первый прогон 692/694: два старых static-contract теста требовали прежнюю форму style/absolute dock. Обновлены на новый layout contract, сохранены проверки fixed Back/header и отсутствия draggable sheet.
- Backend: 865/865 PASS в каноническом окружении fastapi 0.136.0 / starlette 1.6.0 / pytest 9.0.3, изолированные DB/storage. Первый прогон в старом venv: 858 PASS / 7 FAIL из-за неподдерживаемого TestClient(client=...), продуктовый код ради него не менялся.
- Lint: PASS, 386 JS-файлов.
- Web build: PASS. i18n: 2006 ключей на каждый язык, missing=0.
- Graphify AST-only до/после; SQL grammar отсутствует, Gradle частично разобран — это не полный анализ SQL.
- QA061 подготовлен как следующий кандидат; установка и физический retest исправлений на момент этой записи ещё не выполнены.

## Открыто

- QA061 build/artifact proof и retest keyboard + ZH preview.
- Новые voice 55–60 секунд в обе стороны, ZH→RU, cache/no repeated provider, relaunch.
- Полная push matrix, killed-process, OPPO sound, badge/token ownership.
- GPS offline FIFO/captured timestamps, Location OFF→ON, terminal stop; gps_lost/restored только по реальному threshold.
- Attachment failure/retry, routing latency, полная безопасность и Android/iOS release gates.

Не выполнялись uninstall, pm clear, DB wipe, очистка логов или удаление QA evidence. QA061 пока не установлен; телефоны остаются на 060.
