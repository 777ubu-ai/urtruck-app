import React, { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, UIManager } from 'react-native';

/** Shared long-form keyboard contract; chat composer remains Track 3. */
export default function KeyboardSafeLayout({ children, style, offset = 0, testID = 'keyboard-safe-layout' }) {
  const layoutRef = useRef(null);
  const [androidImeInset, setAndroidImeInset] = useState(0);

  const measureAndroidImeOverlap = useCallback((keyboardTop) => {
    if (Platform.OS !== 'android' || !Number.isFinite(keyboardTop)) return;

    // `adjustResize` is the first resize owner. Android 15/16 edge-to-edge
    // can nevertheless leave this root at full screen height. Measure its
    // real bottom instead of applying a guessed per-screen offset: when the
    // system resized it, overlap is 0; otherwise padding makes every footer
    // slot end immediately above the actual IME.
    requestAnimationFrame(() => {
      layoutRef.current?.measure?.((_x, _y, _width, height, _pageX, pageY) => {
        const overlap = Math.max(0, pageY + height - keyboardTop);
        setAndroidImeInset(overlap);
      });
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const onShow = (event) => {
      const keyboardTop = event?.endCoordinates?.screenY ?? Keyboard.metrics?.()?.screenY;
      measureAndroidImeOverlap(keyboardTop);
    };
    const onHide = () => setAndroidImeInset(0);
    const showSubscription = Keyboard.addListener('keyboardDidShow', onShow);
    const hideSubscription = Keyboard.addListener('keyboardDidHide', onHide);
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [measureAndroidImeOverlap]);

  // Do not use Android KAV `height`: that would compete with `adjustResize`.
  // The measured inset above is deliberately zero on normal resize devices.
  return (
    <KeyboardAvoidingView
      ref={layoutRef}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={offset}
      style={[s.fill, style, Platform.OS === 'android' && androidImeInset > 0 ? { paddingBottom: androidImeInset } : null]}
      testID={testID}
    >
      {children}
    </KeyboardAvoidingView>
  );
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
 * Canonical bottom-dock contract for the one UI that cannot scroll away from
 * the IME: the deal chat composer. Android 15+ may report a full-height
 * window even with adjustResize set; in that case the dock has to move by
 * the measured IME overlap. When Android did resize the window, the overlap
 * is zero, so this never creates a second keyboard offset.
 */
export function useKeyboardDockInset(viewportHeight, topInset = 0) {
  const [inset, setInset] = React.useState(0);
  const viewportHeightRef = useRef(viewportHeight);

  React.useEffect(() => {
    viewportHeightRef.current = viewportHeight;
  }, [viewportHeight]);

  React.useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (event) => {
      // iOS uses KeyboardAvoidingView padding. Android needs this measured
      // fallback only when the Activity did not actually resize its viewport.
      if (Platform.OS !== 'android') return;
      const keyboardTop = event?.endCoordinates?.screenY ?? Keyboard.metrics?.()?.screenY;
      const height = viewportHeightRef.current;
      // Android 16's edge-to-edge IME reports its touch frame below the
      // visual toolbar. Include the measured safe-area top only there, so the
      // dock stays above the whole rendered IME; older Android keeps its
      // normal coordinate contract and therefore has no artificial gap.
      const visualImeInset = Platform.Version >= 36 ? Math.max(0, topInset) : 0;
      setInset(Number.isFinite(keyboardTop) && Number.isFinite(height)
        ? Math.max(0, height - keyboardTop + visualImeInset)
        : 0);
    };
    const onHide = () => setInset(0);
    const showSubscription = Keyboard.addListener(showEvent, onShow);
    const hideSubscription = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [topInset]);

  return inset;
}

/**
 * Canonical long-form container. ScrollView's native responder knows how to
 * reveal the focused TextInput above the IME on both Android and iOS. Keeping
 * this behavior here avoids per-screen keyboard offsets and duplicate listeners.
 */
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

    // On Android 15+ edge-to-edge, adjustResize can leave the ScrollView
    // viewport unchanged even though the IME covers it. Measure after the IME
    // frame is final, then scroll only by the real overlap. This keeps one
    // shared rule for every form instead of per-screen keyboard offsets.
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
    const onShow = (event) => {
      keyboardTop.current = event?.endCoordinates?.screenY ?? Keyboard.metrics?.()?.screenY ?? null;
      revealFocusedInput();
    };
    const onHide = () => { keyboardTop.current = null; };
    const showSubscription = Keyboard.addListener(showEvent, onShow);
    const hideSubscription = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [revealFocusedInput]);

  const handleFocus = useCallback((event) => {
    const target = event?.nativeEvent?.target;
    if (target) {
      lastFocusedTarget.current = target;
      revealFocusedInput(target);
    }
    onFocus?.(event);
  }, [onFocus, revealFocusedInput]);

  return (
    <KeyboardSafeFocusContext.Provider value={handleFocus}>
      <ScrollView
        ref={ref}
        {...props}
        onFocus={handleFocus}
        onScroll={(event) => {
          scrollY.current = event?.nativeEvent?.contentOffset?.y || 0;
          onScroll?.(event);
        }}
        scrollEventThrottle={props.scrollEventThrottle || 16}
        keyboardShouldPersistTaps={props.keyboardShouldPersistTaps || 'handled'}
        contentContainerStyle={contentContainerStyle}
      >
        {children}
      </ScrollView>
    </KeyboardSafeFocusContext.Provider>
  );
});

const s = StyleSheet.create({ fill: { flex: 1 } });
