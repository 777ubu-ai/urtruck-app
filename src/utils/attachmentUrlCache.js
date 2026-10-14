// Memory only. The server owns signing; an opaque signature is never decoded
// or extended here. Unknown expiry has a short, bounded reuse window.
export function cacheIssuedAttachmentUrl(cache, key, issuedUrl, now = Date.now()) {
  if (!issuedUrl) { cache.delete(key); return issuedUrl; }
  const cached = cache.get(key);
  if (cached?.url && cached.reuseUntil > now) return cached.url;
  const exp = /[?&]exp=(\d+)(?:&|$)/.exec(issuedUrl);
  const expiresAt = exp ? Number(exp[1]) * 1000 : NaN;
  const reuseUntil = Number.isFinite(expiresAt)
    ? Math.max(now, expiresAt - 60000)
    : now + 240000;
  cache.set(key, { url: issuedUrl, reuseUntil });
  return issuedUrl;
}
