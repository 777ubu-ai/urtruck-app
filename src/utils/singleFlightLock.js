export function acquireSingleFlight(lockRef, key) {
  if (!lockRef || lockRef.current != null) return false;
  lockRef.current = key;
  return true;
}

export function releaseSingleFlight(lockRef, key) {
  if (lockRef?.current === key) lockRef.current = null;
}
