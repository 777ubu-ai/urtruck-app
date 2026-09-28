import { localizeSystemMessage } from './places';

// Пользовательский текст сохраняется даже при совпадении с системной фразой.
export function dealMessagePreview(deal, language) {
  const text = deal?.last_message || '';
  return deal?.last_message_sender_id === 'system'
    ? localizeSystemMessage(text, language)
    : text;
}
