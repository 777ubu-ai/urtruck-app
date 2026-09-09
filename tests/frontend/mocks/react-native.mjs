// Минимальный мок react-native для запуска "чистой логики" утилит
// (src/utils/outbox.js, storage.js и т.п.) и gray-box render-тестов экранов
// под обычным Node — БЕЗ Metro/Expo рантайма. Реальный react-native не
// парсится plain Node (Flow/JSX), поэтому для узкого набора frontend-тестов
// специфику платформы подменяем здесь. JSX транспилируется load-хуком
// (render-env-hooks.mjs, sucrase) в React.createElement — реальный рендер
// не происходит, компоненты используются как типы элементов.
// Подмена подключается только через resolve-hook в ../loader.mjs —
// исходники проекта не модифицируются.
// OS='android' (не 'web'): storage.js под Platform.OS==='web' пишет в
// window.localStorage, которого в plain Node нет (тихо no-op — ничего не
// падает, но ничего и не сохраняется). Заявляем себя native-платформой,
// чтобы storage.js использовал AsyncStorage-путь → уходит в наш мок
// (mocks/async-storage.mjs), который реально хранит данные in-memory.
export const Platform = {
  OS: 'android',
  select: (obj) => obj[Platform.OS] ?? obj.native ?? obj.default,
  Version: 34,
};

let openSettingsCalls = 0;
export const Linking = {
  openSettings: async () => { openSettingsCalls += 1; },
  openURL: async () => {},
  getInitialURL: async () => null,
  addEventListener: () => ({ remove() {} }),
  __getOpenSettingsCalls: () => openSettingsCalls,
  __resetOpenSettingsCalls: () => { openSettingsCalls = 0; },
};

// ── Элементы-заглушки: используются только как типы в createElement(...) ──
const makeEl = (name) => {
  const fn = (props) => ({ $$typeof: 'rn-element', name, props });
  fn.displayName = name;
  return fn;
};

export const View = makeEl('View');
export const Text = makeEl('Text');
export const FlatList = makeEl('FlatList');
export const SectionList = makeEl('SectionList');
export const ScrollView = makeEl('ScrollView');
export const TouchableOpacity = makeEl('TouchableOpacity');
export const TouchableHighlight = makeEl('TouchableHighlight');
export const TouchableWithoutFeedback = makeEl('TouchableWithoutFeedback');
export const Pressable = makeEl('Pressable');
export const TextInput = makeEl('TextInput');
export const Image = makeEl('Image');
export const ImageBackground = makeEl('ImageBackground');
export const ActivityIndicator = makeEl('ActivityIndicator');
export const RefreshControl = makeEl('RefreshControl');
export const Modal = makeEl('Modal');
export const Switch = makeEl('Switch');
export const SafeAreaView = makeEl('SafeAreaView');
export const KeyboardAvoidingView = makeEl('KeyboardAvoidingView');
export const StatusBar = makeEl('StatusBar');
export const Button = makeEl('Button');
export const CheckBox = makeEl('CheckBox');

export const StyleSheet = {
  create: (styles) => styles,
  flatten: (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean).map((x) => (typeof x === 'object' ? x : {}))) : (s || {})),
  hairlineWidth: 1,
};

export const Animated = {
  View: makeEl('Animated.View'),
  Text: makeEl('Animated.Text'),
  Image: makeEl('Animated.Image'),
  ScrollView: makeEl('Animated.ScrollView'),
  FlatList: makeEl('Animated.FlatList'),
  createAnimatedComponent: (c) => c,
  timing: () => ({ start: (cb) => cb && cb({ finished: true }), stop: () => {} }),
  spring: () => ({ start: (cb) => cb && cb({ finished: true }), stop: () => {} }),
  loop: () => ({ start: () => {}, stop: () => {} }),
  event: () => () => {},
  Value: class { constructor(v) { this._v = v; } setValue(v) { this._v = v; } interpolate() { return this; } addListener() { return ''; } removeListener() {} },
};

export const Dimensions = { get: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }) };
export const PixelRatio = { get: () => 2, getFontScale: () => 1, getPixelSizeForLayoutSize: (n) => n * 2 };
export const Keyboard = { addListener: () => ({ remove() {} }), removeListener: () => {}, dismiss: () => {} };
export const I18nManager = { isRTL: false, allowRTL: () => {}, forceRTL: () => {} };
export const InteractionManager = { runAfterInteractions: (fn) => { fn && fn(); return { cancel() {} }; } };
export const AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
export const Vibration = { vibrate: () => {}, cancel: () => {} };
export const Alert = { alert: () => {} };
export const ToastAndroid = { show: () => {}, SHORT: 0, LONG: 1 };
export const UIManager = { measureInWindow: () => {}, measure: () => {} };
export const NativeModules = {};
export const DeviceEventEmitter = { addListener: () => ({ remove() {} }), removeListener: () => {}, emit: () => {} };
export const Appearance = {
  getColorScheme: () => 'light',
  addChangeListener: () => ({ remove() {} }),
  removeChangeListener: () => {},
};
export const useColorScheme = () => 'light';
export const useWindowDimensions = () => ({ width: 390, height: 844, scale: 2, fontScale: 1 });
export const LogBox = { ignoreLogs: () => {}, ignoreAllLogs: () => {} };

export default {
  Platform, Linking, View, Text, FlatList, SectionList, ScrollView,
  TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback, Pressable,
  TextInput, Image, ImageBackground, ActivityIndicator, RefreshControl, Modal,
  Switch, SafeAreaView, KeyboardAvoidingView, StatusBar, Button, CheckBox,
  StyleSheet, Animated, Dimensions, PixelRatio, Keyboard, I18nManager,
  InteractionManager, AppState, Vibration, Alert, ToastAndroid, UIManager,
  NativeModules, DeviceEventEmitter, Appearance, useColorScheme, useWindowDimensions, LogBox,
};
