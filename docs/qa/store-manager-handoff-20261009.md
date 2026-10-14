# UrTruck — актуальная передача менеджеру магазинов, 9 октября 2026

Основной реестр: [urtruck-recovery-status-20261009.md](urtruck-recovery-status-20261009.md).
Этот файл обновлён после завершения native build и CI; прежние pending состояния заменены фактами.

| Канал | Фактическое состояние | Следующее действие |
|---|---|---|
| App Store 1.0.9 (94) | ASC API WAITING_FOR_REVIEW, AFTER_APPROVAL | Ждать Apple; не отправлять повторно ту же submission |
| TestFlight 1.0.9 (95) | Actions 37910804163 SUCCESS; ASC API VALID / not expired; source c5be008 | Установить и проверить. #512–514 здесь отсутствуют |
| Android 213702394 | Actions 37913349782 SUCCESS; source b7e218b; 48 ELF PASS + ZIP PASS; production draft upload job SUCCESS | Console: выбран ли этот номер, исчез ли 16 KB blocker; native map/GPS/push. #512–514 здесь отсутствуют |
| Android validation 213701165 | Actions 37911102249 SUCCESS, upload disabled | Только доказательство native compatibility; не выбирать вместо общего кандидата |
| Последняя объединённая ветка #514 | source 06526f4, full CI 37916840560 SUCCESS | Нового native из этого SHA пока нет; включает read confirmation, route no-repeat и gates |

Google Play: открыть production draft, сверить именно 213702394; не публиковать старый 213660672 с 16 KB blocker.
Проверить App Bundle Explorer, Publishing overview, Background location / FGS location declarations, disclosure, privacy/listing/demo-video и app-access login.
Не убирать GPS permissions для обхода формы. Не копировать секреты в release notes.
Draft upload не доказывает публикацию или успешную проверку Google. Текущий интерфейс Console и его оставшиеся blocking errors ещё требуют фактического осмотра.
Ранее автоматический переход в cloud Console отклонил approval review; обхода не выполнялось.

iOS 94 на review и 95 VALID — разные объекты. 95 не заменяет review build автоматически. Последние #512–514 отсутствуют в обеих загруженных версиях; для их выпуска нужен один новый согласованный native кандидат после gates/physical acceptance.
Ни публичная iOS 1.0.9, ни публичный rollout Android 213702394 не подтверждены.

По уведомлениям: у проверенного driver account 13 = reminder10 + no_bids3, chat unread0. ☰ → Уведомления возвращено в #511; #512 отдельно исправляет ложное UI чтение при HTTP/API ошибке. Проверить успешное чтение → badge, а не считать посещение Сделок автоматическим read-all.

Ссылки:
- https://github.com/777ubu-ai/urtruck-app/pull/514
- https://github.com/777ubu-ai/urtruck-app/actions/runs/37913349782
- https://github.com/777ubu-ai/urtruck-app/actions/runs/37910804163
- https://appstoreconnect.apple.com/apps/6764504167/distribution/reviewsubmissions
