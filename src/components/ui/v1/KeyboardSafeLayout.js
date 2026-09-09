import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

/** Shared long-form keyboard contract; chat composer remains Track 3. */
export default function KeyboardSafeLayout({ children, style, offset = 0, testID = 'keyboard-safe-layout' }) {
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={offset} style={[s.fill, style]} testID={testID}>{children}</KeyboardAvoidingView>;
}

/**
 * Canonical long-form container. ScrollView's native responder knows how to
 * reveal the focused TextInput above the IME on both Android and iOS. Keeping
 * this behavior here avoids per-screen keyboard offsets and duplicate listeners.
 */
export const KeyboardSafeScrollView = forwardRef(function KeyboardSafeScrollView({ children, contentContainerStyle, onFocus, ...props }, forwardedRef) {
  const ref = useRef(null);
  useImperativeHandle(forwardedRef, () => ({
    scrollTo: (...args) => ref.current?.scrollTo?.(...args),
    getScrollResponder: () => ref.current?.getScrollResponder?.() || ref.current,
  }), []);
  const handleFocus = useCallback((event) => {
    const responder = ref.current?.getScrollResponder?.() || ref.current;
    responder?.scrollResponderScrollNativeHandleToKeyboard?.(
      event.nativeEvent.target,
      24,
      true,
    );
    onFocus?.(event);
  }, [onFocus]);

  return (
    <ScrollView
      ref={ref}
      {...props}
      onFocus={handleFocus}
      keyboardShouldPersistTaps={props.keyboardShouldPersistTaps || 'handled'}
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </ScrollView>
  );
});

const s = StyleSheet.create({ fill: { flex: 1 } });
