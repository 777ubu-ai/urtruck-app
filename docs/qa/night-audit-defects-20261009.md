# UrTruck — реестр ночного аудита 8–9 октября 2026

Статусы: FIXED_CODE — исправлено и автоматизировано, ждёт устройства; VERIFIED — проверено в указанном объёме; OPEN — нужен сценарий/доступ; CI_OPEN — отдельная облачная проверка ещё не завершена.

| ID | Приоритет | Дефект / риск | Причина или граница знания | Решение / проверка | Статус |
|---|---|---|---|---|---|
| N-01 | P1 | iPhone composer ограничен двумя строками по сообщению владельца | Старый расчёт зависит от native contentSize уже ограниченного frame; точная UIKit-причина физически не трассирована | Независимое измерение строк и межстрочного шага, cap 4, scroll 5+, защиты от stale callbacks; 6 регрессий + существующие composer checks | FIXED_CODE |
| N-02 | P1 | Только STT readiness/status меняется, строка чата может остаться старой | sameChatMessage не сравнивал voiceProcessingStatus и voiceTranscriptReady | Добавлены сравнения; pending/ready/failed/expired regressions | FIXED_CODE |
| N-03 | P2 | Обновлённая docDownloadUrl может остаться старой в UI | Поле отсутствовало в сравнении reconciliation | Добавлено сравнение, проверена смена URL и identity неизменённой коллекции | FIXED_CODE |
| N-04 | P2 | Падает qa:zh через прямой Node-import | geography импортировал countries без .js | Исправлен импорт; полный QA Center PASS | VERIFIED |
| N-05 | P2 | Две ошибки history regression harness | Новый обязательный callback cleanup не был включён в изолированный тест | Harness расширен с проверкой комнаты/readBefore/isCurrent; не объявлено production-багом истории | VERIFIED |
| N-06 | P1 | Полная физическая push-матрица не закрыта | iPhone banner/sound/reset не подтверждены; Huawei старый, OPPO заблокирован | Владелец подтвердил доставку и icon badge 3; read-only provider sent; нужен физический прогон каждой строки | OPEN |
| N-07 | P1 | Настоящие RU↔ZH голосовые ещё не получили полную приёмку | Рабочие серверные модели и прошлое подтверждение голоса не доказывают каждый смысловой кейс | Проверить обе стороны, числовые параметры, отрицания, города; синтетическую речь не засчитывать | OPEN |
| N-08 | P1 | Новый composer и полный справочник отсутствуют в iPhone 91 | Изменения сохранены только в следующих commits | Подготовить одну новую TestFlight-сборку с номером >91, source SHA и manifest | OPEN |
| N-09 | P1 | Huawei не содержит новую native badge policy | Установлен 213640023, обновление остановлено на Huawei ID | Только штатное обновление с данными; затем launcher grow/reset и доставка | OPEN |
| N-10 | P2 | Автоматические PR gates не запускаются на stacked base #508 | Workflow branch filters main/qa2 не совпадают с рабочей цепочкой | Явный full-qa-audit 37845188843 на b9e301bc: 5/5 jobs PASS; автоматические branch filters не менялись | VERIFIED (manual CI) |
| N-11 | P2 | Graphify не покрывает SQL полностью | Нет tree_sitter_sql для 19 SQL файлов; два Gradle warnings | AST использовать как карту связей; DB/API проверены изолированным каноническим runner, native manifest требует сборки | OPEN |
| N-12 | P2 | Семантика EN freight → RU «груз» на старом снимке | Цена сохранена, но контекст freight может означать стоимость перевозки | Включить терминологию freight/ставка/фрахт и реальные RU↔ZH фразы в ручную приёмку; не менять prompt без воспроизведения | OPEN |
| N-13 | P2 | Документы/GPS/карта и полный FSM требуют native acceptance | Автоматический общий прогон не покрывает все фоновые и физические сценарии | Выполнить живую матрицу по ночному ТЗ; не переносить web PASS на native | OPEN |
| N-14 | P1 | Текст рейса/профиля интерпретируется как HTML внутри ТТН | Непроверенные динамические значения вставлялись в f-string HTML, в том числе перед WeasyPrint | html.escape, тест img/script payload; a4e05b20, target 7/7 + canonical backend PASS | FIXED_CODE, production не применено |
| N-15 | P1 | В ТТН вымышленные цена и перевозчик; HTML/PDF расходятся | POST price=1500 / get_driver(caller), PDF placeholder driver / volume_m3 вместо available_m3 | Проверенные поля рейса и его carrier, единый payload HTML/PDF, неизвестные данные — прочерк; отдельно требуется приёмка реквизитов/цены согласованной сделки | FIXED_CODE, production не применено |
| N-16 | P1 | Справочник и прошлые отчёты ошибочно считали 249 | Реально 248: нет AX; прежний test допускал >=248 / совпадение неполных наборов | f241f855: AX + 4 bundled names, strict 249, 996 name/search checks без Intl.DisplayNames; frontend 1108/1108, target 11/11; старые builds отменены до submit | FIXED_CODE, native pending |
| N-17 | P1 | Чтение теряло unread нового сообщения и более новой страницы | Неограниченный UPDATE после SELECT; подтверждён тот же runtime SQL | 08f1d467: message-ID boundary, 3 новых race/page regressions; 28/28 target + canonical 130 modules PASS | FIXED_CODE, production pending отдельное разрешение |
| N-18 | P1 | Поздний Bell event очищался до показа | Общая URL-очистка после истории без snapshot ceiling / message ID | Snapshot notification IDs и chat event-key message boundary; prepared guarded runtime diff, 4/4 ops safety, compile-only на Python 3.12.3 | FIXED_CODE, production pending |

| N-19 | P1 | Вкладка Сделки принимает устаревший badge, отклонённый native handler | Оба callbacks BottomNav принимали любой finite badge, включая reason=superseded; не отсеивали late response после cleanup | Настоящие effect callbacks: до patch 4 FAIL / 2 PASS; после 14/14 с appBadge runtime, scope account и cleanup guards; следующий native candidate необходим | FIXED_CODE, следующий native pending |

## Правила закрытия
- Для каждого физического дефекта указать SHA приложения, build/versionCode, устройство/OS, аккаунты и комнату, шаги, ожидаемое/фактическое поведение, timestamp и доказательство.
- FIXED_CODE не превращать в VERIFIED только по компиляции или unit-тестам.
- Отсутствие доступа к устройству отмечать как OPEN/BLOCKED, а не PASS.
- Внезапный сбой повторить на том же кандидате с логом; после исправления прогнать соответствующий regression и зависимые сценарии.
- Не назначать оценку 10/10, пока остаются P1 и непроверенные обязательные строки.
