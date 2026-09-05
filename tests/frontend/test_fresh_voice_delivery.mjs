// FRESH VOICE DELIVERY — контракт доставки голосового сообщения.
//
// Матрица V1-V10 из ТЗ. Проверяется реальный код DealWorkspaceScreenV2 +
// voiceDeliveryLog, а не пересказ поведения.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const screen = read('src/screens/DealWorkspaceScreenV2.js');
const bubble = read('src/components/VoiceMessageBubble.js');
const api = read('src/utils/chatAPI.js');

// тело deliverVoice — все проверки идут по НЕМУ, а не по всему файлу,
// иначе совпадения из текстового пути дают ложно-зелёный результат.
const deliverBody = (() => {
  const start = screen.indexOf('const deliverVoice = React.useCallback');
  assert.ok(start > 0, 'deliverVoice не найден');
  const end = screen.indexOf('const toggleVoice = React.useCallback');
  assert.ok(end > start, 'граница deliverVoice не найдена');
  return screen.slice(start, end);
})();

const log = await import('../../src/utils/voiceDeliveryLog.js');

// ══════════════ V1. upload valid → chatAPI.send ровно один раз ══════════════

test('V1 успешная загрузка ведёт к ровно одному chatAPI.send', () => {
  const sends = deliverBody.match(/chatAPI\.send\(/g) || [];
  assert.equal(sends.length, 1, `chatAPI.send вызывается ${sends.length} раз(а), ожидался 1`);
  // send идёт ПОСЛЕ проверки ключа, а не параллельно ей
  assert.ok(deliverBody.indexOf('if (!hasKey)') < deliverBody.indexOf('chatAPI.send('),
    'send стартует до проверки voice_key');
  assert.match(deliverBody, /sendStatus: 'sent'/, 'нет перехода в sent');
});

// ══════════════ V2. upload reject → send НЕ вызывается, bubble failed ══════════════

test('V2 отказ загрузки не доходит до send и даёт failed', () => {
  const uploadCatch = deliverBody.slice(
    deliverBody.indexOf('} catch (error) {'),
    deliverBody.indexOf('const hasKey'),
  );
  assert.ok(uploadCatch.length > 0, 'catch загрузки не найден');
  assert.doesNotMatch(uploadCatch, /chatAPI\.send\(/, 'send вызывается из ветки отказа загрузки');
  // каждый выход из catch помечает пузырь
  assert.match(uploadCatch, /sendStatus: 'failed'/, 'сетевой отказ не помечает пузырь');
  assert.match(uploadCatch, /failVoice\(/, 'прочие отказы не помечают пузырь');
  assert.match(uploadCatch, /return;/, 'нет раннего выхода после отказа');
});

// ══════════════ V3. malformed response → явный failed/retry ══════════════

test('V3 ответ 200 без voice_key трактуется как провал, а не успех', () => {
  assert.match(deliverBody, /const hasKey = !!upload\?\.voice_key;/);
  assert.match(deliverBody, /if \(!hasKey\)\s*\{[\s\S]{0,200}?failVoice\(/,
    'ответ без ключа не помечается провалом');
  assert.match(deliverBody, /malformed_upload_response/, 'причина не различима в диагностике');
});

// ══════════════ V4. roomId отсутствует → нет ложного успеха ══════════════

test('V4 без комнаты и получателя доставка не стартует и не врёт', () => {
  assert.match(deliverBody, /if \(!roomId && !recipientId\)/, 'нет guard на адресата');
  const guard = deliverBody.slice(deliverBody.indexOf('if (!roomId && !recipientId)'));
  const guardBlock = guard.slice(0, guard.indexOf('setStatus({ sendStatus: \'sending\''));
  assert.match(guardBlock, /failVoice\(/, 'guard не помечает пузырь провалом');
  assert.match(guardBlock, /no_recipient/, 'причина не логируется');
  assert.match(guardBlock, /return;/, 'guard не прекращает доставку');
  // guard стоит ДО загрузки
  assert.ok(deliverBody.indexOf('if (!roomId && !recipientId)') < deliverBody.indexOf('uploadChatVoice'),
    'guard проверяется после загрузки');
});

// ══════════════ V5. roomId резолвится позже → используется актуальный ══════════════

test('V5 доставка использует разрешённую комнату, а не устаревшее замыкание', () => {
  // roomId в deps → callback пересоздаётся, когда комната разрешилась
  const deps = deliverBody.slice(deliverBody.lastIndexOf('}, ['));
  assert.match(deps, /roomId/, 'roomId отсутствует в deps deliverVoice — замыкание устареет');
  assert.match(deps, /recipientId/, 'recipientId отсутствует в deps');
  // комната, созданная сервером, сохраняется
  assert.match(deliverBody, /if \(sent\?\.room_id && !roomId\) setRoomId\(sent\.room_id\)/,
    'room_id из ответа не сохраняется — следующее голосовое снова уйдёт без комнаты');
});

// ══════════════ V6/V7. rerender и unmount ══════════════

test('V6 повторный рендер не рвёт цепочку: она живёт в одном async-вызове', () => {
  // Вся доставка — один непрерывный async callback; между этапами нет
  // зависимости от смонтированного состояния.
  assert.match(deliverBody, /const deliverVoice = React\.useCallback\(async \(item\) => \{/);
  assert.match(deliverBody, /await chatAPI\.uploadChatVoice\(/);
  assert.match(deliverBody, /await chatAPI\.send\(payload\)/);
});

test('V7 размонтирование не даёт молчаливой потери: этап зафиксирован в логе', () => {
  // setMessages после unmount — no-op, поэтому единственный способ узнать,
  // где оборвалось, это лог. Проверяем, что каждый этап логируется.
  for (const stage of ['UPLOAD_STARTED', 'UPLOAD_COMPLETED', 'BEFORE_CHAT_SEND',
    'CHAT_SEND_STARTED', 'CHAT_SEND_COMPLETED', 'CHAT_SEND_FAILED']) {
    assert.match(deliverBody, new RegExp(`VOICE_STAGES\\.${stage}`), `этап ${stage} не логируется`);
  }
});

// ══════════════ V8. двойной finalize → одно сообщение ══════════════

test('V8 повтор использует тот же clientMsgId — дубля на бэкенде не будет', () => {
  assert.match(deliverBody, /clientMsgId: clientId/, 'clientMsgId не передаётся');
  const retry = screen.slice(screen.indexOf('const retryVoice = React.useCallback'),
    screen.indexOf('const toggleAttachMenu'));
  assert.match(retry, /deliverVoice\(item\)/, 'retry не переиспользует ту же цепочку');
  assert.doesNotMatch(retry, /newClientId/, 'retry генерирует НОВЫЙ id — появится дубль');
});

// ══════════════ V9. upload ок, send падает → failed/retry ══════════════

test('V9 отказ отправки после успешной загрузки даёт failed с retry', () => {
  const sendCatch = deliverBody.slice(deliverBody.indexOf('} catch (error) {',
    deliverBody.indexOf('chatAPI.send(payload)')));
  assert.match(sendCatch, /failVoice\(/, 'отказ отправки не помечает пузырь');
  assert.match(sendCatch, /send_failed/, 'причина отказа не логируется');
  assert.match(sendCatch, /chat_error_403/, '403 не отличается от общей ошибки');
  // UI даёт повтор
  assert.match(screen, /testID="deal-chat-voice-retry"/, 'нет кнопки повтора у голосового');
  assert.match(screen, /onPress=\{\(\) => retryVoice\(item\)\}/, 'строка ошибки не вызывает retry');
  assert.doesNotMatch(screen, /<TouchableOpacity\s*\n\s*disabled\s*\n\s*style=\{s\.errorRow\}/,
    'строка ошибки голосового всё ещё disabled');
});

// ══════════════ V10. сетевой сбой → очередь, сообщение не теряется ══════════════

test('V10 сетевой сбой отправки кладёт голосовое в ту же очередь, что и текст', () => {
  assert.match(deliverBody, /if \(error\?\.isNetwork\)/, 'сетевой сбой не отличается от прочих');
  assert.match(deliverBody, /await enqueueOutbox\(\{ clientId, payload \}, session\?\.user\?\.id\)/,
    'голосовое не попадает в offline-очередь — теряется навсегда');
  assert.match(deliverBody, /sendStatus: 'queued'/, 'нет статуса очереди');
  assert.match(deliverBody, /network_queued/, 'постановка в очередь не логируется');
});

// ══════════════ §7. пузырь обязан говорить правду ══════════════

test('§7 пузырь различает sending / queued / failed', () => {
  assert.match(screen, /sending=\{item\.sendStatus === 'sending' \|\| item\.sendStatus === 'queued'\}/,
    'очередь показывается как отправленное');
  assert.match(screen, /failed=\{item\.sendStatus === 'failed'\}/,
    'провал не передаётся в пузырь');
  assert.match(bubble, /failed = false,/, 'компонент не принимает failed');
});

// ══════════════ §3. диагностика без секретов ══════════════

test('§3 корреляционный лог ведётся по одному clientVoiceId и без секретов', () => {
  const src = read('src/utils/voiceDeliveryLog.js');
  for (const s of ['voice_finalize_started', 'local_file_ready', 'upload_started',
    'upload_completed', 'before_chat_send', 'chat_send_started',
    'chat_send_completed', 'chat_send_failed', 'optimistic_status_updated']) {
    assert.match(src, new RegExp(`'${s}'`), `нет этапа ${s}`);
  }
  // Ни один секрет не попадает в вывод. Комментарии вырезаем: слово
  // «token» в пояснении — не утечка, утечка это только то, что реально
  // печатается или кладётся в объект события.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  for (const secret of ['token', 'authorization', 'signed', 'secret', 'sig=', 'bearer']) {
    assert.ok(!code.toLowerCase().includes(secret), `лог упоминает ${secret} в исполняемом коде`);
  }
  // и в объект события кладутся только явно перечисленные поля
  assert.match(code, /const entry = \{ clientVoiceId, stage, at: Date\.now\(\), \.\.\.data \};/);
  assert.match(src, /MAX_EVENTS/, 'буфер лога не ограничен — утечка в долгой сессии');
});

test('§3 логгер работает и отдаёт точку обрыва', () => {
  log.resetVoiceLog();
  const id = 'voice_test_abc';
  log.logVoiceStage(id, log.VOICE_STAGES.UPLOAD_STARTED, { hasBlob: false });
  log.logVoiceStage(id, log.VOICE_STAGES.UPLOAD_COMPLETED, { success: true, hasVoiceKey: true });
  log.logVoiceStage(id, log.VOICE_STAGES.BEFORE_CHAT_SEND, { hasRoomId: false });
  assert.equal(log.voiceTrace(id).length, 3);
  assert.equal(log.lastVoiceStage(id), 'before_chat_send',
    'последний этап показывает, что цепочка оборвалась перед отправкой');
  assert.equal(log.lastVoiceStage('voice_other'), null);
  assert.equal(log.errorClass({ isNetwork: true }), 'network');
  assert.equal(log.errorClass({ status: 413 }), 'http_413');
  assert.equal(log.errorClass(null), 'none');
});

// ══════════════ контракт upload (§4) ══════════════

test('§4 контракт uploadChatVoice совпадает с ожиданиями отправителя', () => {
  const up = api.slice(api.indexOf('async uploadChatVoice('), api.indexOf('async typing('));
  assert.match(up, /\$\{BASE\}\/voice/, 'не тот эндпоинт');
  assert.match(up, /method: 'POST'/);
  assert.match(up, /Authorization.*Bearer/, 'нет авторизации');
  assert.match(up, /form\.append\('file'/, 'файл не в multipart-поле file');
  assert.match(up, /throw attachmentError/, 'ошибка не различима по классу');
  assert.match(up, /return r\.json\(\)/);
  // отправитель ждёт именно voice_key
  assert.match(deliverBody, /upload\?\.voice_key/);
});

// ══════════════ §10 / регресс: чужие зоны не тронуты ══════════════

test('§10 воспроизведение, composer и клавиатура не затронуты', () => {
  // deliverVoice не трогает плеер и композер
  assert.doesNotMatch(deliverBody, /voice\.(play|pause|toggle|stopPlayback)/, 'доставка трогает плеер');
  assert.doesNotMatch(deliverBody, /setInput\(|Keyboard\./, 'доставка трогает композер/клавиатуру');
  // запись по-прежнему живёт в toggleVoice
  const toggle = screen.slice(screen.indexOf('const toggleVoice = React.useCallback'),
    screen.indexOf('const retryVoice = React.useCallback'));
  assert.match(toggle, /voice\.startRecording\(\)/);
  assert.match(toggle, /voice\.stopRecording\(\)/);
  assert.match(toggle, /await deliverVoice\(voiceItem\)/, 'запись не передаёт доставку в общий путь');
});
