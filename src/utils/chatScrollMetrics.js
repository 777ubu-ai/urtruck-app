const isFiniteMetric = (value) => typeof value === 'number' && Number.isFinite(value);

// A native scroll callback is not guaranteed to contain all measurements
// while a list mounts, unmounts, or its layout is being recalculated.
// Returning null lets the caller retain the last trustworthy scroll state.
export function nearBottomFromScrollEvent(event, threshold = 80) {
  const nativeEvent = event?.nativeEvent;
  const contentOffsetY = nativeEvent?.contentOffset?.y;
  const contentHeight = nativeEvent?.contentSize?.height;
  const viewportHeight = nativeEvent?.layoutMeasurement?.height;

  if (
    !isFiniteMetric(contentOffsetY)
    || !isFiniteMetric(contentHeight)
    || !isFiniteMetric(viewportHeight)
    || contentHeight < 0
    || viewportHeight < 0
    || !isFiniteMetric(threshold)
  ) {
    return null;
  }

  return contentHeight - (contentOffsetY + viewportHeight) < threshold;
}
