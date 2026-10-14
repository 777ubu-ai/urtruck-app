export function createChatHistoryPages(pageSize = 100) {
  const records = new Map();
  let initialized = false, hasOlder = true;
  return {
    offset: () => records.size,
    hasOlder: () => hasOlder,
    merge(messages, older = false) {
      if (!Array.isArray(messages)) throw new Error('Invalid chat history page');
      if (older || !initialized) hasOlder = messages.length === pageSize;
      initialized = true;
      for (const message of messages) records.set(String(message.id), message);
      return [...records.values()].sort((a, b) => (Date.parse(a.created_at) - Date.parse(b.created_at)) || Number(a.id) - Number(b.id));
    },
  };
}
