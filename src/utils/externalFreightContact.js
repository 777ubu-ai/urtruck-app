// Только явно указанный номер; без угадывания страны и без tel-параметров.
export function externalPhoneURL(value) {
  const text = String(value ?? '').trim();
  if (!/^\+?[0-9][0-9 ()-]*$/.test(text)) return null;
  const digits = text.replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return `tel:${text.startsWith('+') ? '+' : ''}${digits}`;
}

// Только явно переданный контакт. Ссылки на посты/приглашения не становятся личным контактом.
export function externalTelegramContactURL(value) {
  const text = String(value ?? '').trim();
  const match = /^(?:@|https:\/\/t\.me\/)([A-Za-z][A-Za-z0-9_]{4,31})$/.exec(text);
  return match ? `https://t.me/${match[1]}` : null;
}

// WhatsApp chat links require an explicitly international number. Never infer
// a country code from a local number or from the user's locale.
export function externalWhatsAppURL(value, message = '') {
  const text = String(value ?? '').trim();
  if (!/^\+[1-9][0-9 ()-]*$/.test(text)) return null;
  const digits = text.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  const body = String(message ?? '').trim();
  return `https://wa.me/${digits}${body ? `?text=${encodeURIComponent(body)}` : ''}`;
}
