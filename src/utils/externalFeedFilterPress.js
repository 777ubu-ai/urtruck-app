export function activateExternalFeedFilter({
  name,
  filters,
  setDraft,
  setPicker,
  setModal,
  schedule = callback => setTimeout(callback, 120),
}) {
  setDraft(filters);
  if (name === 'origin' || name === 'destination') {
    setPicker(name);
    return;
  }

  // Finish the chip press before mounting the full-screen scrim. On Android,
  // a frame callback can still run before touch-up, allowing the new scrim to
  // receive that event and close the sheet immediately.
  schedule(() => setModal(name));
}
