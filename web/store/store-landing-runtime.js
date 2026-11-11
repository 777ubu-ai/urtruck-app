(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document && root.location) api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORE_URLS = Object.freeze({
    android: 'https://play.google.com/store/apps/details?id=com.urtruck.app',
    ios: 'https://apps.apple.com/kz/app/urtruck/id6764504167',
  });

  function hasAuthCallback(locationLike) {
    const query = new URLSearchParams(String(locationLike?.search || '').replace(/^\?/, ''));
    const hash = new URLSearchParams(String(locationLike?.hash || '').replace(/^#/, ''));
    const params = [query, hash];
    return params.some((p) => (
      (p.has('code') && p.has('state'))
      || (p.get('social_auth') === '1' && (p.has('code') || p.has('error') || p.has('error_description')))
      || (p.has('access_token') && (p.has('refresh_token') || p.has('provider_token')))
      || (p.has('token_hash') && ['signup', 'recovery', 'email_change', 'email'].includes(p.get('type')))
    ));
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
    if (hasAuthCallback(win.location)) {
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
