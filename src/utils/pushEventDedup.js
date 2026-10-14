// Persistent, bounded client-side deduplication for provider retries.
//
// FCM/APNs acknowledge acceptance, not guaranteed presentation. A gateway can
// therefore legitimately retry after an ambiguous network/process failure.
// This cache protects foreground banners and repeated deeplink handling. It
// cannot suppress a notification delivered to a killed iOS app: that requires
// a native Notification Service Extension and remains a separate platform
// task.
import { storage } from './storage';

const CACHE_KEY = 'ur_push_event_dedup_v1';
const MAX_ENTRIES = 200;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const claimed = new Set();

function normalizeEventId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return id && id.length <= 256 ? id : null;
}

function parseCache(value, now) {
  try {
    const rows = JSON.parse(value || '[]');
    if (!Array.isArray(rows)) return [];
    return rows.filter((row) => (
      row && typeof row.key === 'string' && Number.isFinite(row.at)
      && now - row.at <= RETENTION_MS
    ));
  } catch {
    return [];
  }
}

/**
 * Claim an event once per purpose. Returns false when the same event was
 * already claimed locally. `purpose` is deliberately separate for display and
 * navigation: showing a foreground banner must not make its first tap inert.
 */
export async function claimPushEvent(eventId, purpose = 'display') {
  const id = normalizeEventId(eventId);
  if (!id) return true;
  const key = `${purpose}:${id}`;
  if (claimed.has(key)) return false;
  claimed.add(key);
  const now = Date.now();
  const rows = parseCache(await storage.get(CACHE_KEY), now);
  if (rows.some((row) => row.key === key)) return false;
  rows.push({ key, at: now });
  rows.sort((a, b) => b.at - a.at);
  await storage.set(CACHE_KEY, JSON.stringify(rows.slice(0, MAX_ENTRIES)));
  return true;
}

export async function clearPushEventDedup() {
  claimed.clear();
  await storage.remove(CACHE_KEY);
}

// Test-only reset. Not imported by runtime code and never removes user data.
export function __resetPushEventDedupForTests() {
  claimed.clear();
}
