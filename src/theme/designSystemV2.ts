// designSystemV2 — Phase 1 of UrTruck design system refactor.
//
// Owner ТЗ от 2026-05-12:
//   "UrTruck должен выглядеть как международная логистическая платформа,
//    а не как игрушечная доска объявлений. Светло-серый фон, белые
//    карточки, тёмно-синий текст, серый вторичный, оранжевый акцент.
//    Иконки только outline, без эмодзи."
//
// Это файл с design tokens — пока что НЕ wired into components (это будет
// Phase 3 после Figma). Здесь зафиксированы константы которые дизайнер
// может ссылаться, и которыми мы постепенно заменим текущие designV1.
//
// Phase 1 (этот PR): только фиксы которые гарантированно улучшают UX
// (статусы, tech-leak в чатах, outline-icons в bottom nav). Полная
// миграция designV1 → designV2 — Phase 3 с дизайнером.

// ─── Colors ────────────────────────────────────────────────────────

export const colors = {
  // Фоны
  background: '#F4F6FA',          // основной фон приложения
  surface:    '#FFFFFF',           // карточки
  surfaceLift:'#FAFBFD',          // hover/pressed карточек

  // Текст
  textPrimary:   '#0F172A',        // тёмно-синий, основной
  textSecondary: '#64748B',        // серый, подписи
  textTertiary:  '#94A3B8',        // placeholder, подсказки
  textInverse:   '#FFFFFF',        // на акценте/тёмном

  // Границы
  border:       '#D8DEE9',         // обычная
  borderStrong: '#B6C0CF',         // hover/focus

  // Акценты
  accent:        '#F59E0B',        // основной оранжевый
  accentHover:   '#EA8A00',        // pressed
  accentSoft:    '#FEF3C7',        // светлый фон с акцентом
  accentGradient: ['#F59E0B', '#F97316'] as const,

  // Состояния
  success:    '#22C55E',
  warning:    '#F59E0B',
  error:      '#EF4444',
  info:       '#3B82F6',
  inactive:   '#CBD5E1',

  // Статусы (для cargo/trip/bid карточек)
  statusActive:    '#22C55E',
  statusInProgress:'#F59E0B',
  statusPending:   '#F59E0B',
  statusCompleted: '#22C55E',
  statusDelivered: '#22C55E',
  statusCancelled: '#94A3B8',      // 👈 серый, не зелёный!
  statusRejected:  '#EF4444',
  statusExpired:   '#94A3B8',
  statusDraft:     '#CBD5E1',
} as const;

// ─── Typography ────────────────────────────────────────────────────

export const typography = {
  hero:        { fontSize: 34, lineHeight: 40, fontWeight: '800' as const },
  h1:          { fontSize: 28, lineHeight: 34, fontWeight: '800' as const },
  h2:          { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  h3:          { fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  bodyLarge:   { fontSize: 17, lineHeight: 24, fontWeight: '500' as const },
  body:        { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodySmall:   { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  caption:     { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  micro:       { fontSize: 10, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 1 },
  button:      { fontSize: 17, lineHeight: 24, fontWeight: '700' as const },
};

// ─── Spacing ───────────────────────────────────────────────────────

export const spacing = {
  xxs: 2,
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
  xxxl: 48,
};

// ─── Radius ────────────────────────────────────────────────────────

export const radius = {
  sm:    6,
  md:    10,
  card:  14,
  large: 20,
  pill:  999,
};

// ─── Icons (Feather library) ────────────────────────────────────────
// Owner ТЗ: outline icons, 22-24 px, 2 px stroke. Все из @expo/vector-icons/Feather.

export const icons = {
  // Navigation
  feed:       'truck',
  myWork:     'clipboard',
  publish:    'plus-circle',
  chats:      'message-circle',
  profile:    'user',
  notifications: 'bell',

  // Entities
  cargo:      'package',
  vehicle:    'truck',
  route:      'map-pin',
  date:       'calendar',
  price:      'tag',
  weight:     'package',
  volume:     'box',
  documents:  'file-text',
  finance:    'credit-card',
  security:   'shield',
  settings:   'settings',
  support:    'life-buoy',
} as const;

// ─── Shadows ───────────────────────────────────────────────────────

export const shadows = {
  card: {
    shadowColor:  '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  modal: {
    shadowColor:  '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 8,
  },
};

export default {
  colors,
  typography,
  spacing,
  radius,
  icons,
  shadows,
};
