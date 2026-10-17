/**
 * Temporary UI-only cargo seeded after publish while the owner list refetches.
 * A successful authoritative response must end this overlay even when the
 * cargo is absent (for example, it has already been accepted into a deal).
 */
export function reconcileCreatedCargoOverlay(items, overlay, { authoritative = false } = {}) {
  const rows = Array.isArray(items) ? items : [];
  if (authoritative || !overlay) return { items: rows, overlay: null };
  if (rows.some((item) => item?.id === overlay.id)) return { items: rows, overlay };
  return { items: [overlay, ...rows], overlay };
}
