export function activateExternalFeedFilter({
  name,
  filters,
  setDraft,
  setPicker,
  setModal,
  schedule = callback => requestAnimationFrame(callback),
}) {
  setDraft(filters);
  if (name === 'origin' || name === 'destination') {
    setPicker(name);
    return;
  }

  // Finish the chip press before mounting the full-screen scrim. Android can
  // otherwise send the same touch-up to the new scrim and close it at once.
  schedule(() => setModal(name));
}
