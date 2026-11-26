import { storage } from './storage';

const memory = new Map();

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function marketFeedCacheKey(role, userId, filters) {
  return `ur_market_feed_v1_${role}_${hash(String(userId || 'anonymous'))}_${hash(JSON.stringify(filters || {}))}`;
}

export async function readMarketFeedCache(key) {
  if (memory.has(key)) return memory.get(key);
  const raw = await storage.get(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value?.items) || !Number.isInteger(value?.nextOffset) && value?.nextOffset !== null) return null;
    memory.set(key, value);
    return value;
  } catch {
    return null;
  }
}

export async function writeMarketFeedCache(key, value) {
  if (!key || !Array.isArray(value?.items)) return;
  memory.set(key, value);
  await storage.set(key, JSON.stringify(value));
}
