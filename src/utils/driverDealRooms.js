// Only rooms returned by the authenticated /chat/rooms endpoint are candidates.
// That endpoint is the authorization boundary; this helper narrows its result
// to deal-linked rooms with the requested counterparty.
export function findPartnerDealRooms(payload, partnerId) {
  if (!Array.isArray(payload?.rooms)) throw new Error('invalid_rooms_response');
  if (partnerId == null) return [];
  const seen = new Set();
  return payload.rooms.filter((room) => {
    if (!room?.id || !room?.deal_id || room.is_support) return false;
    if (String(room.partner_id) !== String(partnerId)) return false;
    const key = String(room.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Fetch every page of the authenticated partner-filtered endpoint. We do not
// infer "no deal" from the first 50-room window or from a legacy server that
// ignored the filter parameter.
export async function fetchPartnerDealRooms(fetchPage, partnerId) {
  const roomsById = new Map();
  let offset = 0;
  while (true) {
    const payload = await fetchPage(offset);
    if (payload?.partner_filter_applied !== true
      || String(payload.partner_id) !== String(partnerId)
      || !Array.isArray(payload.rooms)) {
      throw new Error('partner_rooms_contract_unavailable');
    }
    for (const room of findPartnerDealRooms(payload, partnerId)) {
      roomsById.set(String(room.id), room);
    }
    if (payload.has_more !== true) return [...roomsById.values()];
    const nextOffset = Number(payload.next_offset);
    if (!Number.isInteger(nextOffset) || nextOffset <= offset) {
      throw new Error('partner_rooms_cursor_invalid');
    }
    offset = nextOffset;
  }
}
