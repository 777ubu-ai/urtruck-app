// Field — input row used in signup / profile-setup forms (macros 02-06).
// Shape: leading icon (emoji) → label-as-placeholder → value, with an
// optional trailing slot (eye toggle, dropdown caret).
//
// Two display modes:
//   variant="input"    — single-line text input
//   variant="dropdown" — read-only label + value, opens a sheet on tap

import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { v1Colors, v1Radius, v1Spacing, v1Typography } from '../../../theme/designV1';

export default function Field(props) {
  if (props.variant === 'dropdown') return <DropdownRow {...props} />;
  return <InputRow {...props} />;
}

function InputRow({
  icon, label, value, onChangeText, placeholder,
  secureTextEntry, onTogglePassword, isPasswordVisible,
  keyboardType, autoCapitalize = 'sentences', maxLength, error, helper,
  testID,
}) {
  return (
    <View style={{ marginBottom: v1Spacing.sm }}>
      <View style={[s.row, error && s.rowError]}>
        {icon ? <Text style={s.icon}>{icon}</Text> : null}
        <View style={{ flex: 1 }}>
          {value && label ? <Text style={s.label}>{label}</Text> : null}
          <TextInput
            style={s.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder || label}
            placeholderTextColor={v1Colors.placeholder}
            secureTextEntry={!!secureTextEntry && !isPasswordVisible}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            maxLength={maxLength}
            testID={testID}
          />
        </View>
        {onTogglePassword ? (
          <TouchableOpacity onPress={onTogglePassword} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.eye}>{isPasswordVisible ? '🙈' : '👁'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={s.errText}>{error}</Text> : helper ? <Text style={s.helperText}>{helper}</Text> : null}
    </View>
  );
}

function DropdownRow({ icon, label, value, onPress, placeholder, testID }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[s.row, { marginBottom: v1Spacing.sm }]} testID={testID}>
      {icon ? <Text style={s.icon}>{icon}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{label}</Text>
        <Text style={[s.input, !value && { color: v1Colors.placeholder }]} numberOfLines={1}>
          {value || placeholder || '—'}
        </Text>
      </View>
      <Text style={s.caret}>⌄</Text>
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
    backgroundColor: v1Colors.surface,
    borderColor: v1Colors.border,
    borderWidth: 1,
    borderRadius: v1Radius.field,
  },
  rowError: { borderColor: v1Colors.error },
  icon: { fontSize: 16, color: v1Colors.textMuted, width: 20, textAlign: 'center' },
  label: { ...v1Typography.small, marginBottom: 2 },
  input: {
    color: v1Colors.text,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
    margin: 0,
  },
  eye: { fontSize: 16, color: v1Colors.textMuted, paddingHorizontal: 4 },
  caret: { fontSize: 16, color: v1Colors.textMuted, paddingHorizontal: 4 },
  errText: { color: v1Colors.error, fontSize: 11, marginTop: 4, marginLeft: 6 },
  helperText: { color: v1Colors.textDim, fontSize: 11, marginTop: 4, marginLeft: 6 },
});
