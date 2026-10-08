// Polling must preserve object identity for an unchanged chat history.  Apart
// from avoiding needless FlatList work this keeps a focused native TextInput
// outside the list stable on iOS.
const fields = [
  'id', 'clientMsgId', 'mine', 'system', 'text', 'photo', 'attachmentUnavailable',
  'voice', 'voiceScope', 'mediaUrl', 'voiceDuration', 'voiceProcessingStatus', 'voiceTranscriptReady', 'transcript', 'transcriptLang',
  'transcriptProvider', 'time', 'createdAt', 'read', 'kind', 'docName', 'docSize',
  'docUrl', 'docDownloadUrl', 'docStatus', 'optimistic', 'sendStatus', 'sendError', 'clientUploadId',
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
