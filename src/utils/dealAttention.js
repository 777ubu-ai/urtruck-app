// Каждое событие серверного badge назначается ровно одной видимой карточке.
export function attentionTarget(value) {
  let raw = String(value || '').trim();
  try {
    const u = new URL(raw);
    raw = `${['urtruck:', 'com.urtruck.app:'].includes(u.protocol) ? '/' + u.hostname : ''}${u.pathname}${u.search}`;
  } catch { /* относительный путь */ }
  const [path, query = ''] = raw.split('#')[0].split('?');
  const parts = path.split('/').filter(Boolean);
  // URLSearchParams.get is not implemented in every supported RN runtime.
  const params = {};
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=');
    try { params[decodeURIComponent(key)] = decodeURIComponent(value); } catch { /* malformed parameter */ }
  }
  return { kind: parts[0], id: parts[1], bid: params.bid || params.bid_id };
}

export function partitionDealAttention(snapshot, groups) {
  if (!snapshot || !Array.isArray(snapshot.notifications) || !Array.isArray(snapshot.rooms)) return null;
  const entries = ['offers', 'active', 'archive'].flatMap(tab => (groups[tab] || []).map(item => ({ ...item, tab, key: `${item.kind}:${item.data.id}` })));
  const counts = {}; const tabs = { offers: 0, active: 0, archive: 0 }; const fallback = [];
  function assign(entry, count, signal) {
    if (entry) { counts[entry.key] = (counts[entry.key] || 0) + count; tabs[entry.tab] += count; }
    else { tabs.archive += count; fallback.push({ kind: 'attention', data: signal, count, sortAt: signal.created_at || '' }); }
  }
  for (const n of snapshot.notifications) {
    const target = attentionTarget(n.url);
    const bidId = target.bid || /^bid:([^:]+):/.exec(String(n.event_key || ''))?.[1];
    const closed = ['bid_rejected', 'bid_cancelled', 'bid_expired'].includes(n.type) || /:(rejected|cancelled|expired|withdrawn)$/.test(String(n.event_key || ''));
    const accepted = n.type === 'bid_accepted' || /:accepted$/.test(String(n.event_key || ''));
    let entry;
    if (bidId) entry = entries.find(e => e.kind === 'bid' && String(e.data.id) === bidId);
    if (!entry && !bidId && target.kind === 'bids') entry = entries.find(e => e.kind === 'bid' && String(e.data.id) === target.id);
    if (!entry && target.kind === 'deals') entry = entries.find(e => e.kind === 'deal' && String(e.data.id) === target.id);
    if (!entry && (!bidId || accepted) && target.id && ['cargos', 'trips'].includes(target.kind)) {
      const field = target.kind === 'cargos' ? 'cargo_id' : 'trip_id';
      const candidates = entries.filter(e => String(e.data[field]) === target.id);
      entry = (accepted ? candidates.find(e => e.tab === 'active') : null) || candidates.find(e => e.kind === 'bid' && (closed ? e.tab === 'archive' : e.tab === 'offers')) || candidates.find(e => e.tab === 'active') || candidates[0];
    }
    assign(entry, 1, { ...n, id: `notification:${n.id}`, notificationId: n.id });
  }
  for (const room of snapshot.rooms) {
    const count = Math.max(0, Number(room.unread_count) || 0);
    const entry = entries.find(e => e.kind === 'deal' && String(e.data.chat_room_id) === String(room.room_id));
    assign(entry, count, { id: `room:${room.room_id}`, roomId: room.room_id });
  }
  if (tabs.offers + tabs.active + tabs.archive !== snapshot.badge) return null;
  return { counts, tabs, fallback };
}
