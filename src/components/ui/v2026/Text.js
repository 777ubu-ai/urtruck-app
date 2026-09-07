// Design System 2026 — Text primitive.
// Rules: semantic type tokens only; ZH gets +2 lineHeight (§3);
// font scaling stays ON (§65), badge/caption levels are capped instead.
import React from 'react';
import { Text as RNText } from 'react-native';
import { useTokens, type2026, withZhLeading } from '../../theme/tokens2026';
import { useI18n } from '../../utils/useI18n';

const CAP = { badge: 1.15, timestamp: 1.15, caption: 1.2 };

export default function Text2026({
  variant = 'body',
  color = 'text.primary',
  zhLeading = true,
  maxFontSizeMultiplier,
  style,
  children,
  ...rest
}) {
  const tokens = useTokens();
  const { lang } = useI18n();
  const base = type2026[variant] || type2026.body;
  const resolved = zhLeading ? withZhLeading(base, lang === 'ZH') : base;
  const cap = maxFontSizeMultiplier ?? CAP[variant];
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={cap}
      style={[resolved, { color: tokens[color] || color }, style]}
    >
      {children}
    </RNText>
  );
}
