const TITLE_KEYS = {
  in_progress: 'notif_event_deal_in_progress_title',
  at_border: 'notif_event_deal_at_border_title',
  awaiting_confirmation: 'notif_event_deal_awaiting_confirmation_title',
  completed: 'notif_event_deal_completed_title',
  cancelled: 'notif_event_deal_cancelled_title',
};

export function interpolateNotification(template, params = {}) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const value = params?.[key];
    return value == null ? match : String(value);
  });
}

// Backend persists stable semantic event identifiers and server-derived
// payload. The viewer's current locale decides the rendered copy. Legacy
// rows without semantic fields keep their stored title/body unchanged.
export function localizeNotification(item, translate) {
  const type = item?.event_type;
  const params = item?.event_payload || {};
  let titleKey = null;
  let bodyKey = null;
  if (type === 'deal.status_changed') {
    titleKey = TITLE_KEYS[params.status] || 'notif_event_deal_status_title';
    bodyKey = 'notif_event_deal_route_body';
  } else if (type === 'bid.accepted') {
    titleKey = 'notif_event_bid_accepted_title';
    bodyKey = 'notif_event_bid_accepted_body';
  } else if (type === 'deal.created') {
    titleKey = 'notif_event_deal_created_title';
    bodyKey = 'notif_event_deal_created_body';
  }
  if (!titleKey) return { title: item?.title || '', body: item?.body || '' };
  return {
    title: interpolateNotification(translate(titleKey), params),
    body: interpolateNotification(translate(bodyKey), params),
  };
}
