// Минимальный мок пакета 'react' для gray-box render-тестов экранов под
// plain Node: компонент вызывается как обычная функция, хуки возвращают
// стаб-значения, JSX-фабрика возвращает plain-объекты. Позволяет выполнить
// тело компонента (включая ветки рендера, недостижимые без рантайм-данных)
// без Metro/рендерера. Подмена подключается только через resolve-hook
// (mocks/render-env-hooks.mjs) из тестов — исходники не модифицируются.

const noop = () => {};

function createElement(type, props, ...children) {
  return { $$typeof: 'element', type, props: props || {}, children };
}

export const createElementFn = createElement;

// useState всегда возвращает [false, setter] — тесты целенаправленно
// проваливаются в post-loading ветку рендера (где живут найденные баги
// вида `x || undefinedVar`). Если тесту нужно другое начальное состояние,
// он может переопределить через __setUseStateValue.
let useStateValue = false;
export function __setUseStateValue(v) { useStateValue = v; }

export function useState(initial) {
  void initial;
  return [useStateValue, noop];
}
export function useReducer(_reducer, initial) {
  return [initial, noop];
}
export function useEffect() {}
export function useLayoutEffect() {}
export function useMemo(fn) { return fn(); }
export function useCallback(fn) { return fn; }
export function useRef(initial) { return { current: initial }; }
export function useContext() { return {}; }
export function useImperativeHandle() {}
export function useTransition() { return [false, noop]; }
export function useId() { return 'stub-id'; }
export function useSyncExternalStore() { return false; }

export const Fragment = 'fragment';
export const StrictMode = 'strict-mode';
export const Suspense = 'suspense';
export const memo = (c) => c;
export const forwardRef = (c) => c;
export const createContext = () => ({ Provider: 'context-provider', Consumer: 'context-consumer' });

export default {
  createElement,
  useState,
  useReducer,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useRef,
  useContext,
  useImperativeHandle,
  useTransition,
  useId,
  useSyncExternalStore,
  Fragment,
  StrictMode,
  Suspense,
  memo,
  forwardRef,
  createContext,
  __setUseStateValue,
};
