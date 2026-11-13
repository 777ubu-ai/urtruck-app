(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document && root.location) api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PENDING_PROVIDER_KEY = 'ur_social_pending_provider';
  const PENDING_PROVIDER_MAX_AGE_MS = 10 * 60 * 1000;
  const STORE_URLS = Object.freeze({
    android: 'https://play.google.com/store/apps/details?id=com.urtruck.app',
    ios: 'https://apps.apple.com/kz/app/urtruck/id6764504167',
  });

  function hasAuthCallback(locationLike, storageLike, now = Date.now()) {
    const query = new URLSearchParams(String(locationLike?.search || '').replace(/^\?/, ''));
    const hash = new URLSearchParams(String(locationLike?.hash || '').replace(/^#/, ''));
    // Public landing must not restore the web app from URL parameters alone.
    // The web OAuth flow writes this same-origin marker before leaving for the
    // provider; mobile OAuth returns through urtruck://auth-social instead.
    let pending;
    try { pending = JSON.parse(storageLike?.getItem(PENDING_PROVIDER_KEY) || 'null'); } catch { return false; }
    const age = Number(now) - Number(pending?.startedAt);
    if (!['google', 'apple'].includes(pending?.provider)
      || !Number.isFinite(age) || age < 0 || age > PENDING_PROVIDER_MAX_AGE_MS) return false;

    // A cancelled/failed provider response must stay on the store landing.
    if (query.has('error') || query.has('error_description') || hash.has('error') || hash.has('error_description')) return false;
    const hasSocialRedirectMarker = query.get('social_auth') === '1';
    if (!hasSocialRedirectMarker) return false;
    return Boolean(query.get('code') || (hash.get('access_token') && hash.get('refresh_token')));
  }

  function targetStore(userAgent = '', platform = '', maxTouchPoints = 0) {
    const ua = `${userAgent} ${platform}`;
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)) return 'ios';
    return null;
  }

  function decodeAppShell(base64) {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function mount(win) {
    if (hasAuthCallback(win.location, win.localStorage)) {
      try {
        const appShell = decodeAppShell(win.__URTRUCK_APP_SHELL_BASE64__ || '');
        if (appShell.includes('<html') && appShell.includes('</html>')) {
          win.document.open();
          win.document.write(appShell);
          win.document.close();
        }
      } catch (error) {
        // Keep store choices visible if a browser cannot restore the OAuth shell.
      }
      return;
    }

    const store = targetStore(win.navigator.userAgent, win.navigator.platform, win.navigator.maxTouchPoints);
    if (!store) return;
    win.document.documentElement.dataset.urtruckPlatform = store;
    const primary = win.document.querySelector(`[data-store-link="${store}"]`);
    if (primary) primary.setAttribute('aria-label', `Открыть UrTruck в ${store === 'android' ? 'Google Play' : 'App Store'}`);

    let attempted = false;
    try {
      attempted = win.sessionStorage.getItem('urtruck-store-redirect-attempted') === '1';
      if (!attempted) win.sessionStorage.setItem('urtruck-store-redirect-attempted', '1');
    } catch (error) {
      // Private browsing may disable sessionStorage; one attempt still works.
    }
    if (attempted) return;
    win.setTimeout(() => {
      if (win.document.visibilityState === 'hidden') return;
      try { win.location.assign(STORE_URLS[store]); } catch (error) { /* Visible links remain available. */ }
    }, 450);
  }

  return Object.freeze({ STORE_URLS, hasAuthCallback, targetStore, decodeAppShell, mount });
});
