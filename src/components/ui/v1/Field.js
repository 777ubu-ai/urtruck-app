// Field — input row used in signup / profile-setup forms (macros 02-06).
// Shape: leading icon (emoji) → label-as-placeholder → value, with an
// optional trailing slot (eye toggle, dropdown caret).
//
// Two display modes:
//   variant="input"    — single-line text input
//   variant="dropdown" — read-only label + value, opens a sheet on tap
//
// Stage 6: theme-aware via useV1Colors().

import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, v1Radius, v1Spacing, v1Typography } from '../../../theme/designV1';

export default function Field(props) {
  if (props.variant === 'dropdown') return <DropdownRow {...props} />;
  return <InputRow {...props} />;
}

// Ведущая иконка поля. Приоритет — профессиональная Feather-иконка (монохром,
// серый), эмодзи оставлен как fallback для ещё не мигрированных экранов.
function FieldIcon({ featherIcon, icon, color }) {
  if (featherIcon) {
    return <Feather name={featherIcon} size={18} color={color} style={{ width: 20, textAlign: 'center' }} />;
  }
  if (icon) return <Text style={[s.icon, { color }]}>{icon}</Text>;
  return null;
}

function InputRow({
  icon, featherIcon, label, value, onChangeText, placeholder,
  secureTextEntry, onTogglePassword, isPasswordVisible,
  keyboardType, autoCapitalize = 'sentences', maxLength, error, helper,
  // Stage 21: pass-through editable so callers can render a
  // read-only row (country during the KZ-only pilot) without
  // resorting to the dropdown variant.
  editable = true,
  testID,
}) {
  const colors = useV1Colors();
  return (
    <View style={{ marginBottom: v1Spacing.sm }}>
      {/* Stage 28: label теперь рендерится ВСЕГДА сверху row,
          а не только когда value заполнен. Раньше label исчезал
          в пустом поле и пользователь видел только placeholder
          "Например: 22" — непонятно, где вес, где объём. Теперь
          label «Вес, т» / «Объём, м³» всегда видим, placeholder
          служит подсказкой формата. */}
      {label ? (
        <Text style={[v1Typography.small, { color: colors.textDim, marginBottom: 6, marginLeft: 4 }]}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          s.row,
          { backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border },
        ]}
      >
        <FieldIcon featherIcon={featherIcon} icon={icon} color={colors.textMuted} />
        <View style={{ flex: 1 }}>
          <TextInput
            style={[s.input, { color: colors.text }, !editable && { opacity: 0.7 }]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder || ''}
            placeholderTextColor={colors.placeholder}
            secureTextEntry={!!secureTextEntry && !isPasswordVisible}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            maxLength={maxLength}
            editable={editable}
            testID={testID}
          />
        </View>
        {onTogglePassword ? (
          <TouchableOpacity onPress={onTogglePassword} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[s.eye, { color: colors.textMuted }]}>{isPasswordVisible ? '🙈' : '👁'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {error
        ? <Text style={[s.errText, { color: colors.error }]}>{error}</Text>
        : helper ? <Text style={[s.helperText, { color: colors.textDim }]}>{helper}</Text> : null}
    </View>
  );
}

function DropdownRow({ icon, featherIcon, label, value, onPress, placeholder, testID }) {
  const colors = useV1Colors();
  return (
    <View style={{ marginBottom: v1Spacing.sm }}>
      {/* Stage 28: dropdown тоже выносит label наружу — единый
          паттерн форм. Раньше label был внутри row, сжимался,
          и при пустом value читался как placeholder. */}
      {label ? (
        <Text style={[v1Typography.small, { color: colors.textDim, marginBottom: 6, marginLeft: 4 }]}>
          {label}
        </Text>
      ) : null}
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={[
          s.row,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        testID={testID}
      >
        <FieldIcon featherIcon={featherIcon} icon={icon} color={colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={[s.input, { color: value ? colors.text : colors.placeholder }]} numberOfLines={1}>
            {value || placeholder || '—'}
          </Text>
        </View>
        <Text style={[s.caret, { color: colors.textMuted }]}>⌄</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: v1Radius.field,
  },
  icon: { fontSize: 16, width: 20, textAlign: 'center' },
  input: { fontSize: 14, fontWeight: '500', paddingVertical: 0, margin: 0 },
  eye: { fontSize: 16, paddingHorizontal: 4 },
  caret: { fontSize: 16, paddingHorizontal: 4 },
  errText: { fontSize: 11, marginTop: 4, marginLeft: 6 },
  helperText: { fontSize: 11, marginTop: 4, marginLeft: 6 },
});
