const normalizePermission = (permission) => (
  typeof permission === 'string' && permission.trim() ? permission : 'unknown'
);

/**
 * Re-read the OS/notification SDK permission when an app returns active.
 * A granted transition can repair push registration once; repeated active
 * events with an unchanged permission do not re-register the token.
 */
export function createPushPermissionMonitor({ appState, getPermission, onPermission, onGranted }) {
  let mounted = true;
  let permission = 'loading';
  let inFlight = null;
  let refreshAgain = false;

  const setPermission = (nextPermission) => {
    permission = normalizePermission(nextPermission);
    if (mounted) onPermission(permission);
    return permission;
  };

  const refresh = (force = false) => {
    if (!mounted) return Promise.resolve(permission);
    if (inFlight) {
      if (force) refreshAgain = true;
      return inFlight;
    }

    inFlight = Promise.resolve()
      .then(async () => {
        do {
          refreshAgain = false;
          if (!mounted) return permission;
          let result;
          try { result = await getPermission(); } catch { result = 'unknown'; }
          if (!mounted) return permission;
          const previous = permission;
          const current = setPermission(result);
          if (current === 'granted' && previous !== 'granted') {
            try { Promise.resolve(onGranted()).catch(() => {}); } catch {}
          }
        } while (mounted && refreshAgain);
        return permission;
      })
      .finally(() => { inFlight = null; });
    return inFlight;
  };

  const subscription = appState.addEventListener('change', (nextState) => (
    nextState === 'active' ? refresh(true) : undefined
  ));

  // Start the initial check after listener registration so an early foreground
  // transition coalesces with it instead of starting a second permission read.
  void refresh();

  return {
    refresh,
    setPermission,
    remove() {
      if (!mounted) return;
      mounted = false;
      subscription?.remove?.();
    },
  };
}
