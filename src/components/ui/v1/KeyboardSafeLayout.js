import React, { createContext, forwardRef, useCallback, useContext, useImperativeHandle, useRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

/** Shared long-form keyboard contract; chat composer remains Track 3. */
export default function KeyboardSafeLayout({ children, style, offset = 0, testID = 'keyboard-safe-layout' }) {
  // Android's Activity already owns resizing through adjustResize. Applying
  // KeyboardAvoidingView height there was a second resize owner and made a
  // focused field jump below the IME on physical devices.
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset} style={[s.fill, style]} testID={testID}>{children}</KeyboardAvoidingView>;
}

const KeyboardSafeFocusContext = createContext(null);

/** Lets shared inputs reveal themselves without every screen owning offsets. */
export function useKeyboardSafeFocus(onFocus) {
  const revealFocusedInput = useContext(KeyboardSafeFocusContext);
  return useCallback((event) => {
    revealFocusedInput?.(event);
    onFocus?.(event);
  }, [onFocus, revealFocusedInput]);
}

/**
 * Canonical long-form container. ScrollView's native responder knows how to
 * reveal the focused TextInput above the IME on both Android and iOS. Keeping
 * this behavior here avoids per-screen keyboard offsets and duplicate listeners.
 */
export const KeyboardSafeScrollView = forwardRef(function KeyboardSafeScrollView({ children, contentContainerStyle, onFocus, ...props }, forwardedRef) {
  const ref = useRef(null);
  const lastFocusedTarget = useRef(null);
  useImperativeHandle(forwardedRef, () => ({
    scrollTo: (...args) => ref.current?.scrollTo?.(...args),
    getScrollResponder: () => ref.current?.getScrollResponder?.() || ref.current,
  }), []);
  const handleFocus = useCallback((event) => {
    const target = event?.nativeEvent?.target;
    if (!target || lastFocusedTarget.current === target) {
      onFocus?.(event);
      return;
    }
    lastFocusedTarget.current = target;
    const responder = ref.current?.getScrollResponder?.() || ref.current;
    // Wait for Android's system resize to settle before asking the native
    // responder to reveal the actual TextInput. This is focus-based, not a
    // screen-specific pixel offset.
    const reveal = () => responder?.scrollResponderScrollNativeHandleToKeyboard?.(
      target,
      Platform.OS === 'ios' ? 24 : 12,
      true,
    );
    if (Platform.OS === 'android') setTimeout(reveal, 80);
    else reveal();
    onFocus?.(event);
  }, [onFocus]);

  return (
    <KeyboardSafeFocusContext.Provider value={handleFocus}>
      <ScrollView
        ref={ref}
        {...props}
        onFocus={handleFocus}
        keyboardShouldPersistTaps={props.keyboardShouldPersistTaps || 'handled'}
        contentContainerStyle={contentContainerStyle}
      >
        {children}
      </ScrollView>
    </KeyboardSafeFocusContext.Provider>
  );
});

const s = StyleSheet.create({ fill: { flex: 1 } });
