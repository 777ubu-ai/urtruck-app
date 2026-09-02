# Maestro `inputText` + Android space `%20` bug

## Root cause (physical proof 2026-08-31)

Maestro `inputText: "text with spaces"` на Android под капотом вызывает
`adb shell input text <text>`. Android `input text` не escape'ит пробелы
консистентно между версиями Android/adb/emulator — они могут превратиться
в `%20` или `%s` в конечной строке.

Физическое подтверждение: `.maestro/07-chat-shipper.yaml` отправлял
"Ночной тест от QA", собеседник видел "Ночной%20тест%20от%20QA".
Аналогично Xiaomi `BUA6JB99T465Q49X`: "QA text from Xiaomi 1351" →
"QA%20text%20from%20Xiaomi%201351".

## Fix pattern

**НЕ используем пробелы в `inputText`** для строк, которые идут как
содержимое чата, cargo description, translation smoke ключа и т.п.
Заменяем пробелы на `-` или `_` (или сплошным словом). Assertions на
`assertVisible` меняем в лockstep — та же строка ищется в UI.

**Функциональная семантика теста сохраняется:** мы проверяем что
сообщение дошло и рендерится 1:1, а не что оно content-wise «нормальное».

## До / после

| Файл | Было | Стало |
|---|---|---|
| `.maestro/07-chat-shipper.yaml` | `"Ночной тест от QA"` | `"Ночной-тест-от-QA"` |
| `.maestro/08-chat-driver.yaml` | `"Принял груз"` | `"Принял-груз"` |
| `qa/maestro/badge-no-self.yaml` | `"QA self msg badge-no-self"` | `"QA-self-msg-badge-no-self"` |
| `qa/maestro/client-createcargo.yaml` | `"QA тест — тент 15т"` | `"QA-тест-тент-15т"` |
| `qa/maestro/audit-chat-persistence-restart.yaml` | `"QA-audit persist 20260611"` | `"QA-audit-persist-20260611"` |
| `qa/maestro/audit-lang-switch-during-chat.yaml` | `"lang-switch smoke EN"` | `"lang-switch-smoke-EN"` |
| `qa/maestro/chat_bid_notifications_e2e.yaml` | `"QA owner reply MAESTRO"` | `"QA-owner-reply-MAESTRO"` |

## Что делать с новыми скриптами

**Правило:** любая новая `inputText:` строка длиной > 1 слово — использовать
`-` или `_` вместо пробелов. Если по продуктовым причинам нужен именно
пробел в контенте — использовать одиночные `inputText` по одному слову:

```yaml
- inputText: "Первое"
- inputText: " "  # пробел отдельным action — adb input handles single-char correctly
- inputText: "слово"
```

Это медленнее, но семантически 1:1.
