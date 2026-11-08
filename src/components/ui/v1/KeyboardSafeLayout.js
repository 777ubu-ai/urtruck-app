import React, { createContext, forwardRef, useCallback, useContext, useImperativeHandle, useRef } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, UIManager } from 'react-native';

/** Shared long-form keyboard contract; chat composer remains Track 3. */
export default function KeyboardSafeLayout({ children, style, offset = 0, testID = 'keyboard-safe-layout' }) {
  // Android 15/16 edge-to-edge can bypass the Activity's `adjustResize` for
  // a React root. KAV `height` measures its own native frame against the IME:
  // it lifts the footer when the root is full height, but calculates zero
  // extra offset when `adjustResize` already reduced that frame. This keeps
  // a single shared contract for sticky CTAs and long-form scrolling.
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={offset}
      style={[s.fill, style]}
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
    // viewport unchanged even though the IME covers it. A sticky footer also
    // shortens the actual scroll viewport above the IME. Measure both frames
    // after the IME is final, then use their nearest bottom edge. This keeps
    // one shared rule for every form instead of per-screen keyboard offsets.
    requestAnimationFrame(() => {
      UIManager.measure(target, (_x, _y, _width, height, _pageX, pageY) => {
        if (lastFocusedTarget.current !== target || keyboardTop.current == null) return;
        const revealAbove = (visibleBottom) => {
          if (lastFocusedTarget.current !== target || keyboardTop.current == null) return;
          const overlap = pageY + height + 16 - visibleBottom;
          if (overlap <= 0) return;

          const nextY = Math.max(0, scrollY.current + overlap);
          ref.current?.scrollTo?.({ y: nextY, animated: true });
          scrollY.current = nextY;
        };

        const scrollNode = ref.current;
        if (!scrollNode?.measure) {
          revealAbove(keyboardTop.current);
          return;
        }
        scrollNode.measure((_sx, _sy, _scrollWidth, scrollHeight, _scrollPageX, scrollPageY) => {
          const scrollBottom = scrollPageY + scrollHeight;
          const visibleBottom = Number.isFinite(scrollBottom) && scrollHeight > 0
            ? Math.min(keyboardTop.current, scrollBottom)
            : keyboardTop.current;
          revealAbove(visibleBottom);
        });
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
