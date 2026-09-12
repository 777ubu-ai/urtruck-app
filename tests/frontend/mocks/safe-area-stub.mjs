// Мок react-native-safe-area-context для render-тестов.
const makeEl = (name) => {
  const fn = (props) => ({ $$typeof: 'rn-element', name, props });
  fn.displayName = name;
  return fn;
};

export const SafeAreaView = makeEl('SafeAreaView');
export const SafeAreaProvider = makeEl('SafeAreaProvider');
export const SafeAreaInsetsContext = { Provider: 'insets-provider', Consumer: 'insets-consumer' };
export function useSafeAreaInsets() { return { top: 0, bottom: 0, left: 0, right: 0 }; }
export function useSafeAreaFrame() { return { x: 0, y: 0, width: 390, height: 844 }; }
export const initialWindowMetrics = { insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };
