// Мок @react-navigation/* для render-тестов.
const noop = () => {};
const fakeNavigation = {
  navigate: noop,
  goBack: noop,
  push: noop,
  pop: noop,
  replace: noop,
  reset: noop,
  setOptions: noop,
  addListener: () => () => {},
  removeListener: noop,
  isFocused: () => true,
  canGoBack: () => true,
  getId: () => 'stub',
  getParent: () => undefined,
  getState: () => ({ routes: [], index: 0 }),
  dispatch: noop,
};

export function useNavigation() { return fakeNavigation; }
export function useRoute() { return { params: {} }; }
export function useFocusEffect() {}
export function useIsFocused() { return true; }
export function useNavigationState() { return { routes: [], index: 0 }; }
export function useScrollToTop() {}
export function useTheme() { return { dark: false, colors: {} }; }

export function createNavigationContainerRef() {
  return { navigate: noop, goBack: noop, isReady: () => true, current: null };
}

const el = (name) => ({ $$typeof: 'element-factory', name });
export const NavigationContainer = el('NavigationContainer');
export const createNativeStackNavigator = () => ({
  Navigator: el('Stack.Navigator'),
  Screen: el('Stack.Screen'),
  Group: el('Stack.Group'),
});
export const createStackNavigator = createNativeStackNavigator;
export const createBottomTabNavigator = () => ({
  Navigator: el('Tabs.Navigator'),
  Screen: el('Tabs.Screen'),
});
export const CommonActions = { navigate: noop, goBack: noop, reset: noop };
export const StackActions = { push: noop, replace: noop, pop: noop };
export const TabActions = { jumpTo: noop };

export default {
  NavigationContainer,
  useNavigation,
  useRoute,
  useFocusEffect,
  useIsFocused,
  useNavigationState,
  useScrollToTop,
  useTheme,
  createNavigationContainerRef,
  createNativeStackNavigator,
  createStackNavigator,
  createBottomTabNavigator,
  CommonActions,
  StackActions,
  TabActions,
};
