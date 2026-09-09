import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

/** Shared long-form keyboard contract; chat composer remains Track 3. */
export default function KeyboardSafeLayout({ children, style, offset = 0, testID = 'keyboard-safe-layout' }) {
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={offset} style={[s.fill, style]} testID={testID}>{children}</KeyboardAvoidingView>;
}

const s = StyleSheet.create({ fill: { flex: 1 } });
