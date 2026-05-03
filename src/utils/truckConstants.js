// Single source of truth for truck-body keys, icons and accent colors used
// across FeedScreen / CreateTripScreen / CreateCargoScreen / DriverDetail.
//
// Order matters — the chip-row in create forms reads keys top-to-bottom.

export const TRUCK_KEYS = [
  'tent', 'ref', 'platform', 'auto', 'izoterm',
  'cont20', 'cont40', 'jumbo', 'mega', 'curtain',
  'lowloader', 'tanker', 'dumptruck', 'grain', 'livestock',
  'logger', 'hazmat', 'open_truck', 'closed', 'longliner', 'microvan',
];

export const TRUCK_ICONS = {
  tent: '🚚', ref: '🧊', platform: '🛻', auto: '🚗', izoterm: '❄️',
  cont20: '📦', cont40: '📦', jumbo: '🚛', mega: '🚛',
  curtain: '🚛', lowloader: '🏗️', tanker: '🛢️', dumptruck: '🚜',
  grain: '🌾', livestock: '🐄', logger: '🪵', hazmat: '☢️',
  open_truck: '🚚', closed: '🚐', longliner: '🚛', microvan: '🚐',
};

// Brand v3: tent (default) → emerald; sky/blue swapped to graphite slate.
// `ref` keeps its semantic cyan because it's a refrigeration cue, not a UI accent.
export const TRUCK_COLORS = {
  tent: '#22C55E', ref: '#0891B2', platform: '#D97706', auto: '#7C3AED', izoterm: '#059669',
  cont20: '#6366F1', cont40: '#4338CA', jumbo: '#EC4899', mega: '#DB2777',
  curtain: '#8B5CF6', lowloader: '#F97316', tanker: '#10B981', dumptruck: '#EAB308',
  grain: '#CA8A04', livestock: '#84CC16', logger: '#65A30D', hazmat: '#DC2626',
  open_truck: '#334155', closed: '#475569', longliner: '#7C3AED', microvan: '#64748B',
};
