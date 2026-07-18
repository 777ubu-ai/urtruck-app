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

// Современные line-иконки (MaterialCommunityIcons) вместо мультяшных эмодзи —
// единый стиль, один акцентный цвет. Имена сверены с глифмапом установленной
// версии @expo/vector-icons (все существуют). Рендерится через
// components/TruckTypeIcon (замечание владельца 13.06: эмодзи выглядят
// «сказочно/мультяшно»).
export const TRUCK_MCI = {
  tent: 'truck', ref: 'snowflake', platform: 'truck-flatbed', auto: 'car-multiple',
  izoterm: 'fridge-outline', cont20: 'truck-cargo-container', cont40: 'truck-cargo-container',
  jumbo: 'truck-trailer', mega: 'truck-trailer', curtain: 'truck-trailer',
  lowloader: 'truck-flatbed', tanker: 'tanker-truck', dumptruck: 'dump-truck',
  grain: 'truck', livestock: 'cow', logger: 'pine-tree', hazmat: 'radioactive',
  open_truck: 'truck-flatbed', closed: 'van-utility', longliner: 'truck-trailer',
  microvan: 'van-passenger',
};

// Brand v3: tent (default) → emerald; sky/blue swapped to graphite slate.
// `ref` keeps its semantic cyan because it's a refrigeration cue, not a UI accent.
export const TRUCK_COLORS = {
  tent: '#22C55E', ref: '#0891B2', platform: '#E06D00', auto: '#7C3AED', izoterm: '#059669',
  cont20: '#6366F1', cont40: '#4338CA', jumbo: '#EC4899', mega: '#DB2777',
  curtain: '#8B5CF6', lowloader: '#F97316', tanker: '#10B981', dumptruck: '#EAB308',
  grain: '#CA8A04', livestock: '#84CC16', logger: '#65A30D', hazmat: '#DC2626',
  open_truck: '#334155', closed: '#475569', longliner: '#7C3AED', microvan: '#64748B',
};

// ──────────────────────────────────────────────────────────────────────
// ТЗ онбординг §5 (п.3 чек-листа) — справочник ГРУЗОВЫХ марок (не легковых).
// Поиск по началу строки (см. searchTruckBrands). Модели — по выбранной марке.
// ──────────────────────────────────────────────────────────────────────
export const TRUCK_BRANDS = [
  { name: 'MAN',            models: ['TGX', 'TGS', 'TGM', 'TGL', 'F2000'] },
  { name: 'Scania',         models: ['R', 'S', 'G', 'P', 'R450', 'R500'] },
  { name: 'Volvo',          models: ['FH', 'FH16', 'FM', 'FMX', 'FE'] },
  { name: 'DAF',            models: ['XF', 'XG', 'CF', 'LF'] },
  { name: 'Mercedes-Benz',  models: ['Actros', 'Arocs', 'Atego', 'Axor'] },
  { name: 'Renault Trucks', models: ['T', 'C', 'K', 'Magnum', 'Premium'] },
  { name: 'Iveco',          models: ['S-Way', 'Stralis', 'Trakker', 'Eurocargo'] },
  { name: 'КАМАЗ',          models: ['5490', '54901', '65116', '6520', '43118'] },
  { name: 'МАЗ',            models: ['5440', '6430', '5340', '4371'] },
  { name: 'Howo (Sinotruk)',models: ['A7', 'T7H', 'TX', 'Sitrak C7H'] },
  { name: 'Shacman',        models: ['X3000', 'F3000', 'X6000', 'H3000'] },
  { name: 'FAW',            models: ['J6', 'J7', 'JH6'] },
  { name: 'Dongfeng',       models: ['KX', 'KL', 'GX', 'Tianlong'] },
  { name: 'JAC',            models: ['K7', 'Gallop', 'N-Series'] },
  { name: 'Foton',          models: ['Auman', 'EST', 'GTL'] },
  { name: 'Isuzu',          models: ['Giga', 'Forward', 'FVR', 'NQR'] },
  { name: 'Hyundai',        models: ['Xcient', 'Trago', 'Mighty'] },
  { name: 'Hino',           models: ['500', '700', '300'] },
  { name: 'Kenworth',       models: ['T680', 'T880', 'W900'] },
  { name: 'Freightliner',   models: ['Cascadia', 'Coronado', 'Columbia'] },
];

// Поиск марок по началу строки (как в текущем компоненте «Марка авто»).
// Пустой запрос → весь список. Регистр и пробелы игнорируются.
export function searchTruckBrands(query = '') {
  const q = String(query).trim().toLowerCase();
  if (!q) return TRUCK_BRANDS;
  return TRUCK_BRANDS.filter((b) => b.name.toLowerCase().startsWith(q));
}

// Модели по точному имени марки (для зависимого пикера «Модель»).
export function modelsForBrand(brandName) {
  const b = TRUCK_BRANDS.find((x) => x.name === brandName);
  return b ? b.models : [];
}

// ТЗ §6 — Тип ТС (шаг 5 «Параметры фуры»). Ключи идут через i18n t('vt_*').
export const VEHICLE_TYPES = [
  'tractor_semitrailer', // Тягач с полуприцепом
  'rigid_truck',         // Грузовик (одиночка)
  'refrigerator',        // Рефрижератор
  'tipper',              // Самосвал
  'flatbed',             // Бортовой
  'tented',              // Тентованный
  'container_carrier',   // Контейнеровоз
];

// Тип кузова/прицепа (приказ §1: Тент, Рефрижератор, Термос, Бортовой,
// Самосвал, Шаланда). Ключи через i18n t('bt_*').
export const BODY_TYPES = [
  'tent', 'ref', 'izoterm', 'board', 'tipper', 'lowboy',
];

// Типы ТС, при которых открывается доп. блок прицепа (госномер + техпаспорт).
export const TYPES_WITH_TRAILER = ['tractor_semitrailer', 'container_carrier'];
