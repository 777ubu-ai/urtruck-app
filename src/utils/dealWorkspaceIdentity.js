export function dealWorkspaceIdentity(params = {}) {
  return JSON.stringify([params.dealId || null, params.roomId || null, params.cargoId || null, params.tripId || null, params.partner?.id || null]);
}
