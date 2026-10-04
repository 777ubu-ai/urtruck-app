// Polling must preserve object identity for an unchanged chat history.  Apart
// from avoiding needless FlatList work this keeps a focused native TextInput
// outside the list stable on iOS.
const fields = [
  'id', 'clientMsgId', 'mine', 'system', 'text', 'photo', 'attachmentUnavailable',
  'voice', 'voiceScope', 'mediaUrl', 'voiceDuration', 'transcript', 'transcriptLang',
  'transcriptProvider', 'time', 'createdAt', 'read', 'kind', 'docName', 'docSize',
  'docUrl', 'docStatus', 'optimistic', 'sendStatus', 'sendError', 'clientUploadId',
];

export function sameChatMessage(a, b) {
  return !!a && !!b && fields.every((field) => a[field] === b[field]);
}

export function reconcileChatMessages(previous, serverMessages, serverDocuments) {
  const server = [...serverMessages, ...serverDocuments].sort((a, b) => {
    const left = Date.parse(a.createdAt || '') || 0;
    const right = Date.parse(b.createdAt || '') || 0;
    return left - right;
  });
  const optimistic = previous.filter((item) => item.optimistic && !server.some((remote) => (
    item.kind === 'document'
      ? remote.clientUploadId === item.id
      : (remote.clientMsgId ? remote.clientMsgId === item.id : (remote.mine && item.text && remote.text === item.text))
  )));
  const oldById = new Map(previous.map((item) => [item.id, item]));
  const next = [...server, ...optimistic].map((item) => {
    const old = oldById.get(item.id);
    return sameChatMessage(old, item) ? old : item;
  });
  return next.length === previous.length && next.every((item, index) => item === previous[index])
    ? previous
    : next;
}

export function normalizeComposerHeight(input, reportedHeight, minimum, maximum, verticalPadding = 0) {
  if (!String(input || '').trim()) return minimum;
  const raw = Number(reportedHeight);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const next = Math.ceil(raw + verticalPadding);
  return Math.max(minimum, Math.min(maximum, next));
}

export function composerHeightForLineCount({
  lineCount,
  minimum,
  maximum,
  lineHeight = 20,
}) {
  const maxLines = Math.max(1, Math.ceil((maximum - minimum) / lineHeight) + 1);
  const boundedLines = Math.max(1, Math.min(maxLines, Math.round(Number(lineCount) || 1)));
  return Math.max(minimum, Math.min(maximum, minimum + ((boundedLines - 1) * lineHeight)));
}

// Это детерминированный контракт для зеркала, учитывающего ширину. Нативный
// <Text onTextLayout> остаётся источником истины в runtime: только он знает
// правила начертания и переноса конкретной платформы. Чистая модель здесь
// позволяет регрессиям проверить soft-wrap и явные переводы строки.
export function countComposerSoftWrapLines({ input, usableWidth, measureText }) {
  const width = Number(usableWidth);
  const text = String(input || '');
  if (!text || !Number.isFinite(width) || width <= 0) return 1;
  const measure = typeof measureText === 'function' ? measureText : (value) => String(value).length;

  return text.split('\n').reduce((total, paragraph) => {
    if (!paragraph) return total + 1;
    let lines = 1;
    let currentLine = '';
    for (const glyph of Array.from(paragraph)) {
      const nextLine = `${currentLine}${glyph}`;
      if (currentLine && measure(nextLine) > width) {
        lines += 1;
        currentLine = glyph;
      } else {
        currentLine = nextLine;
      }
    }
    return total + lines;
  }, 0);
}

// Одно измерение нативного TextInput не является layout-контрактом iOS: один
// и тот же visual line count может кратко вернуть соседние высоты во время
// reconciliation polling. Поэтому iOS composer получает число строк от
// нативного Text-зеркала той же ширины. Helper переводит его в устойчивые
// канонические bucket и отбрасывает поздние измерения прежнего текста, не
// блокируя позднее валидное измерение для неизменившегося текста.
export function stableComposerHeightFromLineCount({
  input,
  previousInput,
  currentHeight,
  lineCount,
  minimum,
  maximum,
  lineHeight = 20,
}) {
  const text = String(input || '');
  const previous = String(previousInput || '');
  if (!text.trim()) return minimum;
  const candidate = composerHeightForLineCount({ lineCount, minimum, maximum, lineHeight });

  if (text.length > previous.length) return Math.max(currentHeight, candidate);
  if (text.length < previous.length) return Math.min(currentHeight, candidate);
  return candidate;
}

// Android и fallback до первого layout по-прежнему сообщают content height.
// Он переводится в те же канонические bucket; iOS использует зеркало выше,
// как только известна фактическая ширина input.
export function stableComposerHeight({
  input,
  previousInput,
  currentHeight,
  reportedHeight,
  minimum,
  maximum,
  lineHeight = 20,
}) {
  const text = String(input || '');
  const previous = String(previousInput || '');
  if (!text.trim()) return minimum;
  const raw = Number(reportedHeight);
  if (!Number.isFinite(raw) || raw <= 0) return currentHeight;
  const lineCount = Math.max(1, Math.round(raw / lineHeight));
  return stableComposerHeightFromLineCount({
    input: text,
    previousInput: previous,
    currentHeight,
    lineCount,
    minimum,
    maximum,
    lineHeight,
  });
}

export function selectVoiceDurationSeconds({ elapsedMs, durationMillis, durationSeconds, maximum = 60 }) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0) / 1000;
  const fileMillis = Math.max(0, Number(durationMillis) || 0) / 1000;
  const fileSeconds = Math.max(0, Number(durationSeconds) || 0);
  const candidate = fileMillis || fileSeconds;
  // Native codecs sometimes return samples/timestamps as a wildly wrong
  // duration.  Accept their value only when it is close to the monotonic wall
  // clock; the latter is available for every recording.
  const plausible = candidate > 0 && elapsed > 0 && Math.abs(candidate - elapsed) <= Math.max(2, elapsed * 0.35);
  const selected = plausible ? candidate : elapsed;
  return Math.min(maximum, Math.max(1, Math.round(selected)));
}
