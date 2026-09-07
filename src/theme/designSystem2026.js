// URTRUCK DESIGN SYSTEM 2026 — canonical tokens
// Docs: docs/URTRUCK_DESIGN_SYSTEM_2026.md
//
// Правила:
// 1. Новый UI-код берёт значения ТОЛЬКО отсюда (или через useDS2026()).
// 2. Локальные HEX/fontSize-литералы в новых правках запрещены.
// 3. Палитра — candidate v1.0, до visual validation не масштабировать
//    на всё приложение; старые theme-файлы пока остаются для legacy-экранов.
// 4. role.* — цвета РОЛЕЙ (driver/shipper), status.* — цвета СТАТУСОВ.
//    Не путать. Смысл элемента никогда не кодируется только цветом.

export const ds2026 = {
  color: {
    brand: {
      primary: '#F97316',
      soft: '#FFF3E8',
      pressed: '#EA6A0A', // candidate, проверить по WCAG/visual test
      onBrand: '#FFFFFF',
    },
    role: {
      driver: {
        primary: '#16A34A',
        alt: '#22A559',
        soft: '#EAF7EE',
        onRole: '#FFFFFF',
      },
      shipper: {
        primary: '#F97316',
        soft: '#FFF3E8',
        onRole: '#FFFFFF',
      },
    },
    status: {
      success: { main: '#16A34A', soft: '#EAF7EE' },
      warning: { main: '#F79009', soft: '#FEF0E1' },
      danger: { main: '#D92D20', soft: '#FDECEA' },
      info: { main: '#2E6CE6', soft: '#EAF1FD' },
    },
    surface: {
      background: '#F7F8FA',
      default: '#FFFFFF',
      secondary: '#F1F3F5',
      overlay: 'rgba(23, 25, 28, 0.45)',
    },
    text: {
      primary: '#17191C',
      secondary: '#667085',
      muted: '#98A2B3',
      onAccent: '#FFFFFF',
    },
    border: {
      default: '#E4E7EC',
      strong: '#D0D5DD',
    },
    chat: {
      background: '#F2F4F5', // мягкий спокойный фон, без белых дыр
      bubbleOutgoing: '#DFF7E4', // мягкий светло-зелёный, НЕ кислотный (candidate)
      bubbleIncoming: '#FFFFFF',
      bubbleOutgoingText: '#17191C',
      timestamp: '#98A2B3',
      composerBackground: '#FFFFFF',
      composerBorder: '#E4E7EC',
      divider: '#E4E7EC',
    },
  },

  dark: {
    // Dark-варианты — candidate, проходят тот же visual test.
    surface: {
      background: '#101214',
      default: '#1A1D21',
      secondary: '#24282E',
      overlay: 'rgba(0, 0, 0, 0.6)',
    },
    text: {
      primary: '#F2F4F5',
      secondary: '#A8B0BC',
      muted: '#6B7280',
      onAccent: '#FFFFFF',
    },
    border: {
      default: '#2C3138',
      strong: '#3A4048',
    },
    chat: {
      background: '#101214',
      bubbleOutgoing: '#1F4D33', // тихий тёмно-зелёный (candidate)
      bubbleIncoming: '#24282E',
      bubbleOutgoingText: '#F2F4F5',
      timestamp: '#6B7280',
      composerBackground: '#1A1D21',
      composerBorder: '#2C3138',
      divider: '#2C3138',
    },
  },

  typography: {
    display: { fontSize: 30, fontWeight: '700' },
    h1: { fontSize: 24, fontWeight: '600' },
    h2: { fontSize: 20, fontWeight: '600' },
    h3: { fontSize: 18, fontWeight: '600' },
    bodyLarge: { fontSize: 17, fontWeight: '400' },
    body: { fontSize: 16, fontWeight: '400' },
    bodySmall: { fontSize: 14, fontWeight: '400' },
    caption: { fontSize: 12, fontWeight: '400' },
    timestamp: { fontSize: 11.5, fontWeight: '400' },
    button: { fontSize: 15, fontWeight: '600' },
    badge: { fontSize: 11, fontWeight: '600' },
    // Чат — отдельные канонические пары (size/lineHeight)
    chatBody: { fontSize: 16, lineHeight: 21.5 },
    chatTimestamp: { fontSize: 11.5, lineHeight: 14 },
    chatDateSeparator: { fontSize: 12.5, lineHeight: 16 },
    // ZH: иероглифы требуют ≥1.35 lineHeight, проверять clipping
    zhLineHeightFactor: 1.4,
  },

  spacing: (n) => 4 * n, // 1→4, 2→8, 3→12, 4→16, 5→20, 6→24, 8→32, 10→40, 12→48
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    base: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    xxxl: 40,
    huge: 48,
    screenPadding: 16,
    cardPadding: 16,
  },

  radius: {
    sm: 8,
    md: 12,
    lg: 14,
    xl: 16,
    pill: 999,
  },

  touch: {
    minTarget: 44, // iOS pt; Android ориентир 48dp
    minTargetAndroid: 48,
    icon: { ui: 22, header: 24, contextual: 18, map: 24 },
  },

  chat: {
    bubbleMaxWidth: 0.76, // 76–80% доступной ширины
    voice: {
      collapsedHeight: 68, // диапазон 64–72
      playIcon: 22, // в target ≥44/48
      rowMinWidth: 240,
    },
    composer: {
      buttonSize: 44, // touch target кнопок композера
      plusIcon: 22,
      emojiIcon: 21,
      micIcon: 22,
      sendIcon: 22,
      maxHeight: 120, // далее текст scrollable
    },
  },

  buttons: {
    height: 48,
    primaryCtaHeight: 54,
    compactHeight: 42,
    radius: 12,
  },

  inputs: {
    height: 50,
    radius: 12,
    labelSize: 14,
    textSize: 16,
    errorSize: 12.5,
  },

  cards: {
    radius: 16,
    padding: 16,
    borderWidth: 1,
  },

  chips: {
    height: 30, // диапазон 28–32
    textSize: 12.5,
    paddingH: 11,
    radius: 999,
  },

  badges: {
    height: 18,
    textSize: 11,
    minWidth: 18,
  },

  notifications: {
    rowMinHeight: 68,
    iconSize: 42,
    titleSize: 15,
    bodySize: 14,
    timestampSize: 11.5,
    padding: 14,
  },
};

// Хелпер: тема под isDark
export function getDS2026(isDark = false) {
  if (!isDark) return ds2026;
  return {
    ...ds2026,
    color: {
      ...ds2026.color,
      surface: { ...ds2026.color.surface, ...ds2026.dark.surface },
      text: { ...ds2026.color.text, ...ds2026.dark.text },
      border: { ...ds2026.color.border, ...ds2026.dark.border },
      chat: { ...ds2026.color.chat, ...ds2026.dark.chat },
    },
  };
}

export default ds2026;
