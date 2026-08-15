const validCoordinates = (latitude, longitude) => (
  Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && Math.abs(latitude) <= 90
  && Math.abs(longitude) <= 180
);

export const formatUrTruckLocationMessage = (label, rawLatitude, rawLongitude) => {
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (!validCoordinates(latitude, longitude)) return null;
  return `📍 ${label}: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
};

// Historical messages used a localized prefix, so only the numeric suffix is
// parsed. This utility deliberately returns coordinates, never a map URL.
export const parseUrTruckLocationMessage = (text) => {
  const match = String(text || '').match(/^📍\s.+?:\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/u);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return validCoordinates(latitude, longitude) ? { latitude, longitude } : null;
};
