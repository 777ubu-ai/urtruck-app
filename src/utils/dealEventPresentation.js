// Только представление legacy-системных строк. Не определяет статус или права.
const DECORATIONS = [
  ['🤝', 'handshake-outline'], ['🚛', 'truck-outline'], ['🛂', 'map-marker-outline'],
  ['✅', 'clipboard-check-outline'], ['❌', 'close-circle-outline'],
  ['📍', 'map-marker-outline'], ['ℹ', 'information-outline'], ['🔒', 'lock-outline'],
];

export function stripSystemEventDecoration(value) {
  const source = String(value ?? '').trim();
  const decoration = DECORATIONS.find(([prefix]) => source.startsWith(prefix));
  return decoration ? source.slice(decoration[0].length).replace(/^\uFE0F/, '').trimStart() : source;
}

export function dealEventPresentation(value) {
  const source = String(value ?? '').trim();
  const decoration = DECORATIONS.find(([prefix]) => source.startsWith(prefix));
  const clean = stripSystemEventDecoration(source);
  const separator = clean.indexOf(' · ');
  return {
    icon: decoration?.[1] || 'information-outline',
    title: separator > 0 ? clean.slice(0, separator) : clean,
    detail: separator > 0 ? clean.slice(separator + 3) : '',
  };
}
