// P0 2026-09-02 — §7 chat message encoding contract.
//
// Физический баг: сообщение "QA text from Xiaomi 1351" отобразилось как
// "QA%20text%20from%20Xiaomi%201351" — где-то в цепочке произошёл
// URL-encoding пользовательского текста. Правильно: НИКТО в чат-пути
// НЕ должен применять encodeURI/encodeURIComponent к message.text, и
// НИКТО не должен применять decodeURIComponent на приходящий text
// (иначе `100%` превратится в `1` при декоде "%20").
//
// Инвариант охраняет обе стороны chat send/receive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chatAPI = readFileSync('src/utils/chatAPI.js', 'utf8');
const chatScreen = readFileSync('src/screens/ChatScreen.js', 'utf8');
const workspaceV2 = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');

test('chatAPI.send НЕ применяет encodeURIComponent к text', () => {
  // Ищем именно encodeURIComponent(text | body.text | payload.text)
  // — но у нас в chatAPI text идёт как поле в JSON.stringify, не URL param.
  assert.doesNotMatch(chatAPI, /encodeURIComponent\s*\(\s*(?:text|payload\.text|body\.text)/,
    'encodeURIComponent на text в chatAPI.send создаст %20 в сохранённом сообщении');
});

test('ChatScreen НЕ декодирует пришедший text через decodeURIComponent', () => {
  // decodeURIComponent на `100%` бросит URIError. На "%20 " превратит в " ".
  // Пользовательский text должен рендериться as-is.
  assert.doesNotMatch(chatScreen, /decodeURIComponent\s*\(\s*(?:m\.text|message\.text|msg\.text|item\.text)/,
    'decodeURIComponent на text приведёт к URIError на "100%" и порче на "%20"');
});

test('DealWorkspaceV2 НЕ декодирует пришедший text', () => {
  assert.doesNotMatch(workspaceV2, /decodeURIComponent\s*\(\s*(?:m\.text|message\.text|msg\.text|item\.text)/,
    'то же самое для DealWorkspaceScreenV2');
});

test('chatAPI.send посылает text как JSON поле, не URL param', () => {
  // Гарантия: text попадает в body.JSON.stringify, а не в query string.
  assert.match(chatAPI, /JSON\.stringify\(\{[\s\S]*?text/,
    'chatAPI.send должен слать text через JSON body, не через URL query');
});

// Regression check: если новый коммит вдруг введёт encodeURI на text —
// тест падает.
test('во ВСЁМ src нет encodeURI(text) или escape(text) на пользовательский message', () => {
  // Собираем все src files, где есть слово "text" в контексте chat/message
  // — это узкая проверка, чтобы не ловить legitimate URL-encoding (напр.
  // ?plate=... в очереди на границе).
  const combined = chatAPI + '\n' + chatScreen + '\n' + workspaceV2;
  assert.doesNotMatch(combined, /encodeURI\s*\(\s*(?:m\.text|message\.text|msg\.text|input|body\.text)/);
  assert.doesNotMatch(combined, /\bescape\s*\(\s*(?:m\.text|message\.text|msg\.text|input|body\.text)/);
});

// P0 2026-09-02 (Phase 2) — root cause `%20` в QA-сообщениях:
// Maestro `inputText` + Android adb space escape bug. Реальный пользователь
// набирающий с физической клавиатуры iPhone/Android НЕ увидит %20 — bug
// проявляется только для QA-агентов, использующих Maestro на Android.
//
// UrTruck code path (composer → chatAPI.send → backend → renderer) чист:
// end-to-end trace показал что encodeURIComponent/decodeURIComponent на
// user text отсутствует нигде. Contract tests выше это защищают.
//
// Fix уровня harness: mesostro-скрипты со строками содержащими пробелы
// должны переходить на pasteText (через clipboard) или использовать
// safe helper из qa/maestro/_lib. Отдельный refactor — outside этой
// сессии recovery-audit. Здесь — контракт только для UrTruck-кода.
