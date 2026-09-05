// voiceDeliveryLog — корреляционная диагностика доставки голосового сообщения.
//
// ЗАЧЕМ. Физический отказ 05.09.2026 (QA2 210488270, clientVoiceId
// voice_mtnfgx6s_wjsrtq) не удалось локализовать по коду: у сборки НЕТ
// поэтапной диагностики. Поля, на которые ссылался отчёт QA
// (`uploadStartedAt`, `messageCreatedAt`), в исходниках отсутствуют —
// их не существует ни в одном модуле. Поэтому нельзя было отличить
// «upload завис» от «upload отдал не тот shape» от «send не стартовал».
//
// Этот модуль закрывает именно это: каждый этап доставки помечается ОДНИМ
// clientVoiceId, поэтому в logcat одна запись показывает, где цепочка
// оборвалась, без повторного двухтелефонного прогона.
//
// БЕЗОПАСНОСТЬ: наружу НЕ выходят token, Authorization, signed URL и любые
// секреты. URL хранилища сводится к признаку «ключ получен» + расширение,
// сам ключ не печатается: он является частью подписываемого пути.

const STAGES = Object.freeze({
  FINALIZE_STARTED: 'voice_finalize_started',
  LOCAL_FILE_READY: 'local_file_ready',
  UPLOAD_STARTED: 'upload_started',
  UPLOAD_COMPLETED: 'upload_completed',
  BEFORE_CHAT_SEND: 'before_chat_send',
  CHAT_SEND_STARTED: 'chat_send_started',
  CHAT_SEND_COMPLETED: 'chat_send_completed',
  CHAT_SEND_FAILED: 'chat_send_failed',
  OPTIMISTIC_STATUS_UPDATED: 'optimistic_status_updated',
});

// Кольцевой буфер: диагностика не должна расти без предела в долгой сессии.
const MAX_EVENTS = 200;
const events = [];

/** Класс ошибки без текста пользователя и без секретов. */
export const errorClass = (error) => {
  if (!error) return 'none';
  if (error.isNetwork) return 'network';
  if (error.name === 'AbortError') return 'timeout';
  if (Number.isFinite(error.status)) return `http_${error.status}`;
  return error.name || 'error';
};

/**
 * Записать этап доставки.
 * @param {string} clientVoiceId — сквозной идентификатор одного голосового.
 * @param {string} stage — одно из STAGES.
 * @param {object} data — только несекретные факты (размеры, флаги, статусы).
 */
export const logVoiceStage = (clientVoiceId, stage, data = {}) => {
  if (!clientVoiceId || !stage) return null;
  const entry = { clientVoiceId, stage, at: Date.now(), ...data };
  events.push(entry);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  // console.log попадает в adb logcat на физическом устройстве — именно то,
  // что нужно Codex для точной локализации без доступа к исходникам.
  try {
    console.log(`[voice-delivery] ${stage} ${clientVoiceId} ${JSON.stringify(data)}`);
  } catch {
    console.log(`[voice-delivery] ${stage} ${clientVoiceId}`);
  }
  return entry;
};

/** Все этапы одного голосового — для отчёта/поддержки. */
export const voiceTrace = (clientVoiceId) => events.filter((e) => e.clientVoiceId === clientVoiceId);

/** Последний записанный этап — показывает, где именно оборвалась цепочка. */
export const lastVoiceStage = (clientVoiceId) => {
  const trace = voiceTrace(clientVoiceId);
  return trace.length ? trace[trace.length - 1].stage : null;
};

export const resetVoiceLog = () => { events.length = 0; };

export { STAGES as VOICE_STAGES };
export default logVoiceStage;
