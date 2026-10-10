// OneSignal foreground event -> existing UrTruck presentation policy.
// SDK default must be prevented synchronously before async dedup completes.
export function createOneSignalForegroundHandler({ decide, readActiveRoom, acknowledge, claimDisplay }) {
  return async (event) => {
    if (!event?.notification || typeof event.preventDefault !== 'function') return false;
    try {
      event.preventDefault();
      const policy = await decide({
        data: event.notification.additionalData || {},
        activeRoom: readActiveRoom(),
        acknowledge,
        claimDisplay,
      });
      if (!policy.shouldShowBanner && !policy.shouldShowAlert) return false;
      event.notification.display();
      return true;
    } catch {
      // Never let an SDK callback reject or expose a payload/token in logs.
      return false;
    }
  };
}
