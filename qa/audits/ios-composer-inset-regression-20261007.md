# iOS composer: повторное добавление отступа

PRE-FLIGHT: ветка fix/ios-composer-content-inset-20261007; база
0e3334c44adad722ae3cc6fdcd172027e341c4c9, QA2 iOS 1.0.9 (89).
Production SHA для этого изменения UNKNOWN. Физическое отсутствие мигания
на этой базе не подтверждено: видео владельца показывает скачки высоты
при неизменном коротком тексте. devicectl подтвердил установленный build 89.

## Подтверждённая ошибка и границы вывода

React Native 0.86.3, ios/Podfile.properties.json: newArchEnabled=true.
RCTTextInputComponentView.mm: updateLayoutMetrics передаёт
_backedTextInputView.contentSize в onContentSizeChange.
RCTUITextView.mm: contentSize включает textContainerInset.
В приложении paddingTop/paddingBottom равны 8, но callback дополнительно
передавал 8 в normalizeComposerHeight. На iOS отступ учитывался повторно.

Патч передаёт нулевой дополнительный отступ только для iOS.
Android/Web сохраняют прежний расчёт. Минимум 44 и максимум 104,
multiline, scrollEnabled, focus, draft, keyboard и история не изменены.
Убрана неточная подпись о фильтрации stale-событий: callback не содержит
такой фильтрации. Изменены только screen, runtime-тест и этот журнал.

Повторное измерение заданного frame — модель устойчивости callback,
не записанная последовательность native-событий телефона. Полное объяснение
всех скачков и физический эффект патча требуют повторной записи на iPhone.

## Проверки

- Новые 2 runtime-регрессии на базе: FAIL (64 вместо 56; 52 вместо 44).
- После патча 5 связанных test modules: 48 PASS, 0 FAIL, 0 SKIP.
- Полный frontend/unit набор: 1042 PASS, 0 FAIL, 0 SKIP.
- Lint: PASS, 472 active JavaScript files; git diff --check PASS.
- Graphify update . --no-cluster: AST-only; 10240 nodes, 23165 edges.
  Ограничения extractor: SQL parser отсутствует, 2 Gradle syntax warnings;
  связи изменённого JS callback и его тестов извлечены.
- Backend не изменён; вручную успешный backend gate не повторялся.
- Физическая проверка патча: НЕ ВЫПОЛНЕНА, установленный build 89 без патча.

Нужная физическая матрица: короткий неизменный текст, набор/удаление 1–4
строк, длинная вставка с прокруткой, входящее сообщение во время набора,
background/foreground; запись экранной клавиатуры, курсора и кнопки отправки.

Rollback: revert отдельного fix commit. Данные, история, cache и настройки
устройства не менялись. Merge, mobile build, deploy и rollout не выполнены.
FINAL STATUS: исправлен подтверждённый расчёт в исходниках; physical pending.
