const FIELDS = ['company_name', 'country', 'city', 'messenger_type', 'messenger_id'];

export function optionalProfileFields(profile = {}) {
  return Object.fromEntries(FIELDS.map(key => [key, String(profile[key] ?? '')]));
}

export function changedOptionalProfileFields(initial, current, dirty = Object.keys(current)) {
  const changes = {};
  for (const key of FIELDS) {
    if (!dirty.includes(key)) continue;
    const value = String(current[key] ?? '').trim();
    if (value !== String(initial[key] ?? '').trim()) changes[key] = value;
  }
  return changes;
}
