let requestHandler = null;
let handlerWaiters = new Set();

// A visible Deal Workspace host registers exactly one handler while mounted.
// Map/Start-trip callers may mount a child effect a few milliseconds before
// the parent registration effect. Wait briefly for the canonical host instead
// of incorrectly treating that normal React mount ordering as "no host".
export function registerLocationPermissionRequestHandler(handler) {
  requestHandler = typeof handler === 'function' ? handler : null;
  if (requestHandler && handlerWaiters.size) {
    for (const resolve of handlerWaiters) resolve(requestHandler);
    handlerWaiters.clear();
  }
  return () => {
    if (requestHandler === handler) requestHandler = null;
  };
}

const waitForRequestHandler = (timeoutMs = 180) => {
  if (requestHandler) return Promise.resolve(requestHandler);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (handler) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handlerWaiters.delete(finish);
      resolve(handler || null);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    handlerWaiters.add(finish);
  });
};

export async function requestLocationPermissionThroughDisclosure(context = {}) {
  const handler = requestHandler || await waitForRequestHandler();
  if (!handler) {
    return { ok: false, reason: 'disclosure_host_unavailable' };
  }
  try {
    return await handler(context);
  } catch (error) {
    return { ok: false, reason: String(error?.message || error || 'disclosure_flow_failed') };
  }
}
