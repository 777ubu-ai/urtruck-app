# Гайд по скриншотам/видео для теста чата

Складывай файлы в **`qa/screenshots/chat-proof/`** с ТОЧНО такими именами:

| Файл | Что на нём |
|---|---|
| `phoneA_owner_bid_notification.png` | Телефон A: уведомление о новой ставке (колокольчик/пуш) |
| `phoneA_owner_bid_visible.png` | Телефон A: видна ставка на карточке груза |
| `phoneB_driver_chat_sent.png` | Телефон B: чат с отправленным `driver-live-test-001` |
| `phoneA_owner_chat_received.png` | Телефон A: чат, видно сообщение водителя |
| `phoneA_owner_chat_replied.png` | Телефон A: чат с отправленным `owner-live-test-001` |
| `phoneB_driver_chat_received_reply.png` | Телефон B: чат, виден ответ владельца |
| `phoneA_owner_chats_badge.png` | Телефон A: красная точка/счётчик на вкладке «Чаты» |
| `phoneB_driver_chats_badge.png` | Телефон B: красная точка/счётчик на вкладке «Чаты» |
| `phoneA_lockscreen_push.png` | Телефон A: пуш на заблокированном экране (только TestFlight) |
| `phoneB_lockscreen_push.png` | Телефон B: пуш на заблокированном экране (только TestFlight) |

## Правила
- Один файл = один шаг чек-листа.
- Если шаг FAIL — всё равно приложи скрин того, что увидел (важнее всего!).
- Видео можно: `.mp4`/`.mov` с тем же именем (например `phoneB_driver_chat_sent.mov`).
- Lock-screen-скрины (`*_lockscreen_push.png`) делаются **только** на TestFlight/реальном
  iPhone — в Expo Go их не будет (это нормально, отметь N/A).
