const EARTH_RADIUS_M = 6371000;

const toRadians = (value) => (Number(value) * Math.PI) / 180;

export const distanceBetweenPoints = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  const lat1 = Number(a[0]);
  const lng1 = Number(a[1]);
  const lat2 = Number(b[0]);
  const lng2 = Number(b[1]);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
};
const closestVertexIndex = (route, point) => {
  if (!Array.isArray(route) || !route.length || !Array.isArray(point)) return 0;
  let closest = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  route.forEach((candidate, index) => {
    const distance = distanceBetweenPoints(candidate, point);
    if (distance < closestDistance) {
      closest = index;
      closestDistance = distance;
    }
  });
  return closest;
};

export const routeProgress = (geometry, livePoint) => {
  const route = (geometry || []).filter((point) => Array.isArray(point) && point.length >= 2);
  if (route.length < 2) return { totalMeters: 0, passedMeters: 0, remainingMeters: 0, progressPercent: 0 };

  const segments = route.slice(1).map((point, index) => distanceBetweenPoints(route[index], point));
  const totalMeters = segments.reduce((sum, value) => sum + value, 0);
  if (!Array.isArray(livePoint) || livePoint.length < 2 || totalMeters <= 0) {
    return { totalMeters, passedMeters: 0, remainingMeters: totalMeters, progressPercent: 0 };
  }

  const vertexIndex = closestVertexIndex(route, livePoint);
  const passedMeters = Math.max(0, Math.min(totalMeters, segments.slice(0, vertexIndex).reduce((sum, value) => sum + value, 0)));
  const remainingMeters = Math.max(0, totalMeters - passedMeters);
  return {
    totalMeters,
    passedMeters,
    remainingMeters,
    progressPercent: Math.round((passedMeters / totalMeters) * 100),
  };
};
