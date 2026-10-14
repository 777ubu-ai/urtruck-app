const SHOW_NOTIFICATION = {
  shouldShowAlert: true,
  shouldShowBanner: true,
  shouldShowList: true,
  shouldPlaySound: true,
  shouldSetBadge: true,
};

const SUPPRESS_NOTIFICATION = {
  shouldShowAlert: false,
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
};

function scheduleTelemetry(acknowledge, eventId, options) {
  if (!eventId || typeof acknowledge !== 'function') return;
  // Receipt telemetry is diagnostic. Never put network latency on the native
  // presentation or deeplink critical path. Server timestamps are idempotent,
  // so duplicate callbacks may safely retry a failed/offline ACK.
  Promise.resolve()
    .then(() => acknowledge(eventId, options))
    .catch(() => {});
}

export async function decideForegroundPresentation({
  data = {},
  activeRoom = null,
  acknowledge,
  claimDisplay,
} = {}) {
  const eventId = typeof data.event_id === 'string' ? data.event_id : data.event_key;
  scheduleTelemetry(acknowledge, eventId, { opened: false });

  if (
    (data.type === 'chat_message' || data.type === 'chat_attachment')
    && data.room_id
    && data.room_id === activeRoom
  ) {
    return SUPPRESS_NOTIFICATION;
  }
  if (eventId && typeof claimDisplay === 'function' && !(await claimDisplay(eventId))) {
    return SUPPRESS_NOTIFICATION;
  }
  return SHOW_NOTIFICATION;
}

export async function handlePushTap({
  eventId,
  acknowledge,
  claimNavigation,
  refreshBadge,
  url,
  route,
} = {}) {
  scheduleTelemetry(acknowledge, eventId, { opened: true });
  try { refreshBadge?.(); } catch {}
  if (eventId && typeof claimNavigation === 'function' && !(await claimNavigation(eventId))) {
    return false;
  }
  if (!url || typeof route !== 'function') return false;
  route(url);
  return true;
}
