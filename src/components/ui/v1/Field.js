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
import { useV1Colors, v1Radius, v1Spacing, v1Typography } from '../../../theme/designV1';

export default function Field(props) {
  if (props.variant === 'dropdown') return <DropdownRow {...props} />;
  return <InputRow {...props} />;
}

function InputRow({
  icon, label, value, onChangeText, placeholder,
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
      <View
        style={[
          s.row,
          { backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border },
        ]}
      >
        {icon ? <Text style={[s.icon, { color: colors.textMuted }]}>{icon}</Text> : null}
        <View style={{ flex: 1 }}>
          {value && label ? <Text style={[v1Typography.small, { color: colors.textDim, marginBottom: 2 }]}>{label}</Text> : null}
          <TextInput
            style={[s.input, { color: colors.text }, !editable && { opacity: 0.7 }]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder || label}
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

function DropdownRow({ icon, label, value, onPress, placeholder, testID }) {
  const colors = useV1Colors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        s.row,
        { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: v1Spacing.sm },
      ]}
      testID={testID}
    >
      {icon ? <Text style={[s.icon, { color: colors.textMuted }]}>{icon}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={[v1Typography.small, { color: colors.textDim, marginBottom: 2 }]}>{label}</Text>
        <Text style={[s.input, { color: value ? colors.text : colors.placeholder }]} numberOfLines={1}>
          {value || placeholder || '—'}
        </Text>
      </View>
      <Text style={[s.caret, { color: colors.textMuted }]}>⌄</Text>
    </TouchableOpacity>
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
