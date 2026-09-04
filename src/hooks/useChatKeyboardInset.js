// useChatKeyboardInset — ЕДИНЫЙ канонический контракт «клавиатура ↔ composer».
//
// Проблема (физически подтверждена на Android 15/16, 04.09.2026): клавиатура
// открывалась, а composer (input + send + mic + plus) оставался ПОД ней —
// писать и отправлять было невозможно.
//
// ROOT CAUSE: приложение собирается с targetSdkVersion = 36. Начиная с
// Android 15 (API 35) приложения принудительно работают edge-to-edge, и
// `android:windowSoftInputMode="adjustResize"` БОЛЬШЕ НЕ ресайзит окно под
// IME — приложение обязано само учитывать ime-инсеты. При этом в чате
// KeyboardAvoidingView был отключён именно на Android
// (`behavior={Platform.OS === 'ios' ? 'padding' : undefined}`), а composer
// получал статический `insets.bottom` навбара, что при открытой клавиатуре
// давало ещё и двойной отступ.
//
// КАНОН (§7): CHAT HISTORY → COMPOSER → KEYBOARD. Composer всегда
// непосредственно над клавиатурой, без hardcoded offset'ов под конкретный
// телефон.
//
// Контракт хука:
//   keyboardHeight — фактическая высота клавиатуры (0 когда закрыта).
//   isKeyboardVisible — открыта ли клавиатура.
//   bottomInset — сколько отступа снизу должен взять composer:
//       * клавиатура закрыта → безопасный инсет системного навбара;
//       * клавиатура открыта  → 0. Подъём делает KeyboardAvoidingView
//         (Android: behavior="height", iOS: behavior="padding"), поэтому
//         сам composer остаётся компактной accessory-строкой прямо над IME.
//     Это убирает и «composer под клавиатурой», и double-inset/пустую полосу.
//
// Почему не библиотека: react-native-keyboard-controller в проекте нет, а
// добавление нативной зависимости требует пересборки и выходит за рамки
// точечного фикса. Здесь достаточно публичного Keyboard API RN.

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Минимальный отступ, чтобы composer не прилипал к краю экрана,
// когда системный навбар нулевой (кнопочная навигация/жесты).
const MIN_BOTTOM_GAP = 12;

export default function useChatKeyboardInset() {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // Android надёжно отдаёт высоту только в *Did* событиях; iOS даёт
    // *Will*, что позволяет анимировать синхронно с клавиатурой.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event) => {
      const height = event?.endCoordinates?.height;
      setKeyboardHeight(Number.isFinite(height) && height > 0 ? height : 0);
    };
    const onHide = () => setKeyboardHeight(0);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    // Android может менять высоту без hide/show (смена раскладки RU↔ZH,
    // эмодзи-панель системной клавиатуры) — держим значение актуальным.
    const frameSub = Platform.OS === 'android'
      ? Keyboard.addListener('keyboardDidChangeFrame', onShow)
      : null;

    return () => {
      showSub?.remove?.();
      hideSub?.remove?.();
      frameSub?.remove?.();
    };
  }, []);

  const isKeyboardVisible = keyboardHeight > 0;

  // Закрытая клавиатура — обычный безопасный инсет. Открытая клавиатура не
  // должна превращаться в margin/padding внутри composer: экран уже ресайзит
  // KeyboardAvoidingView, а нижняя строка должна сидеть у верхнего края IME,
  // как нативный chat accessory bar.
  const bottomInset = !isKeyboardVisible
    ? Math.max(insets.bottom + 8, MIN_BOTTOM_GAP)
    : 0;

  return { keyboardHeight, isKeyboardVisible, bottomInset, safeBottom: insets.bottom };
}
