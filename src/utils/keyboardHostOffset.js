// KAV uses a local frame, while iOS keyboard.screenY is absolute.
// Account only for the measured parent origin, never its changing height.
export function keyboardHostOffset(pageY) {
  return Number.isFinite(pageY) ? Math.max(0, pageY) : 0;
}
