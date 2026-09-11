import React, { createContext, forwardRef, useCallback, useContext, useImperativeHandle, useRef } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, UIManager } from 'react-native';

export default function KeyboardSafeLayout({ children, style, offset = 0, testID = 'keyboard-safe-layout' }) {
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset} style={[s.fill, style]} testID={testID}>{children}</KeyboardAvoidingView>;
}

const KeyboardSafeFocusContext = createContext(null);

export function useKeyboardSafeFocus(onFocus) {
  const revealFocusedInput = useContext(KeyboardSafeFocusContext);
  return useCallback((event) => {
    revealFocusedInput?.(event);
    onFocus?.(event);
  }, [onFocus, revealFocusedInput]);
}

export function useKeyboardDockInset(viewportHeight, topInset = 0) {
  const [inset, setInset] = React.useState(0);
  const viewportHeightRef = useRef(viewportHeight);
  React.useEffect(() => { viewportHeightRef.current = viewportHeight; }, [viewportHeight]);
  React.useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (event) => {
      if (Platform.OS !== 'android') return;
      const keyboardTop = event?.endCoordinates?.screenY ?? Keyboard.metrics?.()?.screenY;
      const height = viewportHeightRef.current;
      const visualImeInset = Platform.Version >= 36 ? Math.max(0, topInset) : 0;
      setInset(Number.isFinite(keyboardTop) && Number.isFinite(height)
        ? Math.max(0, height - keyboardTop + visualImeInset) : 0);
    };
    const onHide = () => setInset(0);
    const showSubscription = Keyboard.addListener(showEvent, onShow);
    const hideSubscription = Keyboard.addListener(hideEvent, onHide);
    return () => { showSubscription.remove(); hideSubscription.remove(); };
  }, [topInset]);
  return inset;
}

export const KeyboardSafeScrollView = forwardRef(function KeyboardSafeScrollView({ children, contentContainerStyle, onFocus, onScroll, ...props }, forwardedRef) {
  const ref = useRef(null);
  const lastFocusedTarget = useRef(null);
  const keyboardTop = useRef(null);
  const scrollY = useRef(0);
  useImperativeHandle(forwardedRef, () => ({
    scrollTo: (...args) => ref.current?.scrollTo?.(...args),
    getScrollResponder: () => ref.current?.getScrollResponder?.() || ref.current,
  }), []);
  const revealFocusedInput = useCallback((target = lastFocusedTarget.current) => {
    if (!target || keyboardTop.current == null) return;
    requestAnimationFrame(() => {
      UIManager.measure(target, (_x, _y, _width, height, _pageX, pageY) => {
        if (lastFocusedTarget.current !== target || keyboardTop.current == null) return;
        const overlap = pageY + height + 16 - keyboardTop.current;
        if (overlap <= 0) return;
        const nextY = Math.max(0, scrollY.current + overlap);
        ref.current?.scrollTo?.({ y: nextY, animated: true });
        scrollY.current = nextY;
      });
    });
  }, []);
  React.useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (event) => { keyboardTop.current = event?.endCoordinates?.screenY ?? Keyboard.metrics?.()?.screenY ?? null; revealFocusedInput(); };
    const onHide = () => { keyboardTop.current = null; };
    const showSubscription = Keyboard.addListener(showEvent, onShow);
    const hideSubscription = Keyboard.addListener(hideEvent, onHide);
    return () => { showSubscription.remove(); hideSubscription.remove(); };
  }, [revealFocusedInput]);
  const handleFocus = useCallback((event) => {
    const target = event?.nativeEvent?.target;
    if (target) { lastFocusedTarget.current = target; revealFocusedInput(target); }
    onFocus?.(event);
  }, [onFocus, revealFocusedInput]);
  return (
    <KeyboardSafeFocusContext.Provider value={handleFocus}>
      <ScrollView ref={ref} {...props} onFocus={handleFocus} onScroll={(event) => { scrollY.current = event?.nativeEvent?.contentOffset?.y || 0; onScroll?.(event); }} scrollEventThrottle={props.scrollEventThrottle || 16} keyboardShouldPersistTaps={props.keyboardShouldPersistTaps || 'handled'} contentContainerStyle={contentContainerStyle}>
        {children}
      </ScrollView>
    </KeyboardSafeFocusContext.Provider>
  );
});

const s = StyleSheet.create({ fill: { flex: 1 } });
