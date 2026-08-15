export const GPS_LIVE_MAX_AGE_SECONDS = 180;
export const GPS_MAX_SPEED_MPS = 70;

const optionalBounded = (value, min, max) => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// Converts an Expo LocationObject (or raw coords + timestamp) into the exact
// backend contract. Invalid coordinates fail closed instead of sending NaN.
export function normalizeLocationPayload(position, now = Date.now()) {
  const coords = position?.coords || position || {};
  const lat = Number(coords.latitude ?? coords.lat);
  const lng = Number(coords.longitude ?? coords.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  const capturedMs = Number(position?.timestamp ?? position?.capturedAt ?? now);
  const safeCapturedMs = Number.isFinite(capturedMs) ? capturedMs : now;
  return {
    lat,
    lng,
    heading: optionalBounded(coords.heading, 0, 360),
    speed: optionalBounded(coords.speed, 0, GPS_MAX_SPEED_MPS),
    accuracy: optionalBounded(coords.accuracy, 0, 5000),
    captured_at: new Date(safeCapturedMs).toISOString(),
  };
}

export function classifyDealLocation(response, now = Date.now()) {
  const location = response?.location;
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  const hasPoint = Boolean(response?.has_location && Number.isFinite(lat) && Number.isFinite(lng));
  const terminal = ['awaiting_confirmation', 'completed', 'cancelled'].includes(response?.deal_status);
  const serverAge = Number(response?.age_seconds);
  let ageSeconds = Number.isFinite(serverAge) ? Math.max(0, serverAge) : null;
  if (ageSeconds == null && location) {
    const raw = location.received_at || location.updated_at;
    const parsed = raw ? Date.parse(String(raw).replace(' ', 'T') + (/Z$|[+\-]\d\d:?\d\d$/.test(String(raw)) ? '' : 'Z')) : NaN;
    if (Number.isFinite(parsed)) ageSeconds = Math.max(0, Math.floor((now - parsed) / 1000));
  }
  const isLive = Boolean(
    hasPoint && response?.is_live === true && !terminal
    && response?.tracking_status === 'active'
    && ageSeconds != null && ageSeconds <= GPS_LIVE_MAX_AGE_SECONDS
  );
  return {
    hasPoint,
    isLive,
    isStale: hasPoint && !isLive,
    terminal,
    ageSeconds,
    freshness: isLive ? 'live' : (response?.freshness || (hasPoint ? 'stale' : 'missing')),
  };
}
