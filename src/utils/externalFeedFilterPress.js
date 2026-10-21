// Все фильтры внешней ленты используют собственное окно; общий picker не нужен.
export function activateExternalFeedFilter({ name, filters, setDraft, setModal }) {
  if (!['origin', 'destination', 'body', 'date', 'price'].includes(name)) return;
  setDraft({ ...filters });
  setModal(name);
}
