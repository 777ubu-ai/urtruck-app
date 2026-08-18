let requestHandler = null;

// A visible Deal Workspace host registers exactly one handler while mounted.
// backgroundLocation.js calls this instead of opening an Android permission
// dialog directly. This guarantees the prominent disclosure is shown first.
export function registerLocationPermissionRequestHandler(handler) {
  requestHandler = typeof handler === 'function' ? handler : null;
  return () => {
    if (requestHandler === handler) requestHandler = null;
  };
}

export async function requestLocationPermissionThroughDisclosure(context = {}) {
  if (!requestHandler) {
    return { ok: false, reason: 'disclosure_host_unavailable' };
  }
  try {
    return await requestHandler(context);
  } catch (error) {
    return { ok: false, reason: String(error?.message || error || 'disclosure_flow_failed') };
  }
}
