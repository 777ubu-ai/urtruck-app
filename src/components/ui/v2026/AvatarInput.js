// Design System 2026 — Avatar (§16/§55) and Input (§8).
import React from 'react';
import { View, Text, Image, TextInput, StyleSheet } from 'react-native';
import { useTokens, type2026, radius2026, metrics2026, space2026 } from '../../../theme/tokens2026';

export function Avatar2026({ uri, name = '', size = metrics2026.avatarList, role, style }) {
  const t = useTokens();
  const [failed, setFailed] = React.useState(false);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
  const dim = { width: size, height: size, borderRadius: size / 2 };

  // Never a broken image (§55): fallback = initials on muted surface.
  if (!uri || failed) {
    return (
      <View style={[s.avatar, dim, { backgroundColor: t['surface.muted'] }, style]}>
        <Text maxFontSizeMultiplier={1.2}
          style={[type2026.bodySmall, { color: t['text.secondary'], fontWeight: '600', fontSize: Math.max(12, size * 0.36) }]}>
          {initials || '·'}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      onError={() => setFailed(true)}
      accessibilityLabel={name || undefined}
      style={[dim, { backgroundColor: t['surface.muted'] }, style]}
    />
  );
}

export function Input2026({
  label, error, success, disabled = false, multiline = false,
  value, onChangeText, placeholder, accessibilityLabel, style, inputStyle, ...rest
}) {
  const t = useTokens();
  const [focused, setFocused] = React.useState(false);

  const borderColor = error ? t['status.danger.main']
    : success ? t['status.success.main']
    : focused ? t['border.focus']
    : t['border.default'];

  return (
    <View style={[s.wrap, style]}>
      {label ? (
        <Text maxFontSizeMultiplier={1.3} style={[type2026.bodySmall, { color: t['text.secondary'], marginBottom: 6 }]}>
          {label}
        </Text>
      ) : null}
      <TextInput
        {...rest}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t['text.muted']}
        editable={!disabled}
        multiline={multiline}
        maxFontSizeMultiplier={1.3}
        accessibilityLabel={accessibilityLabel || label || placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[s.input, {
          minHeight: multiline ? 96 : metrics2026.inputHeight,
          backgroundColor: disabled ? t['surface.muted'] : t['surface.card'],
          borderColor, borderRadius: radius2026.md,
          color: t['text.primary'],
          opacity: disabled ? 0.6 : 1,
          textAlignVertical: multiline ? 'top' : 'center',
        }, inputStyle]}
      />
      {error ? (
        <Text maxFontSizeMultiplier={1.2} style={[type2026.caption, { color: t['status.danger.main'], marginTop: 4 }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  input: {
    borderWidth: 1,
    paddingHorizontal: space2026[4],
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 22,
  },
});
