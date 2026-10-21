export function activateExternalFeedFilter({
  name,
  filters,
  setDraft,
  setPicker,
  setModal,
}) {
  setDraft(filters);
  if (name === 'origin' || name === 'destination') {
    setPicker(name);
    return;
  }

  setModal(name);
}
