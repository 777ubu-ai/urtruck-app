// Общие визуальные элементы утверждённых экранов регистрации.
import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { brandLight } from '../../theme/brandV2';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { withAdditionalLanguageTree } from '../../utils/additionalLocales';
import { useI18n } from '../../utils/useI18n';

export const registrationColors = {
  ...brandLight, textPrimary: '#111C2C', textSecondary: '#606F83',
  textTertiary: '#657489', primarySoft: '#E6F4EE', disabled: '#B7DCCB',
  selected: '#EEF8F3', error: '#B85454',
};
const c = registrationColors;
const COPY = withAdditionalLanguageTree({
  RU: { success: 'Вы успешно вошли в UrTruck!', subtitle: 'Профиль сохранён.\nПереходим в приложение…', preparing: 'Подготовка…', error: 'Не удалось войти', errorDesc: 'Профиль сохранён. Попробуйте ещё раз.', retry: 'Попробовать снова' },
  EN: { success: 'You have signed in to UrTruck!', subtitle: 'Profile saved.\nOpening the app…', preparing: 'Getting ready…', error: 'Unable to sign in', errorDesc: 'Your profile is saved. Please try again.', retry: 'Try again' },
  ZH: { success: '您已成功登录 UrTruck！', subtitle: '资料已保存。\n正在进入应用…', preparing: '正在准备…', error: '无法登录', errorDesc: '资料已保存，请重试。', retry: '重试' },
  KK: { success: 'UrTruck жүйесіне сәтті кірдіңіз!', subtitle: 'Профиль сақталды.\nҚолданбаға өтудеміз…', preparing: 'Дайындалуда…', error: 'Кіру мүмкін болмады', errorDesc: 'Профиль сақталды. Қайта көріңіз.', retry: 'Қайталап көру' },
});
export function RegistrationHeader({ navigation, back = true, disabled = false }) {
  const { t } = useI18n();
  return <View style={s.header}>
    {back ? <Pressable onPress={() => navigation.goBack()} disabled={disabled} style={s.back} accessibilityRole="button" accessibilityLabel={t('back')} testID="registration-back"><Feather name="arrow-left" size={24} color={c.textPrimary} /></Pressable> : <View style={s.back} />}
    <LanguageSwitcher forceLight style={s.language} testID="registration-language" />
  </View>;
}
export function RegistrationCompletion({ error = false, onRetry }) {
  const { lang } = useI18n();
  const ui = COPY[lang] || COPY.RU;
  return <View style={s.completion} testID="registration-completion" accessibilityLiveRegion="polite">
    <View style={[s.halo, error && s.errorHalo]}><View style={[s.icon, error && s.errorIcon]}><Feather name={error ? 'alert-circle' : 'check'} size={48} color={error ? c.error : '#FFFFFF'} /></View></View>
    <Text style={s.title}>{error ? ui.error : ui.success}</Text>
    <Text style={s.subtitle}>{error ? ui.errorDesc : ui.subtitle}</Text>
    {error ? <Pressable testID="registration-completion-retry" onPress={onRetry} accessibilityRole="button" style={s.retry}><Text style={s.retryText}>{ui.retry}</Text></Pressable> : <><ActivityIndicator color={c.primary} size="large" /><Text style={s.preparing}>{ui.preparing}</Text></>}
  </View>;
}
const s = StyleSheet.create({
  header: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  language: { minHeight: 48, minWidth: 76 },
  back: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  completion: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 64, backgroundColor: c.bg },
  halo: { width: 116, height: 116, borderRadius: 58, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  icon: { width: 88, height: 88, borderRadius: 44, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
  errorHalo: { backgroundColor: '#FBECEC' }, errorIcon: { backgroundColor: '#FBECEC' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: c.textPrimary, textAlign: 'center', marginBottom: 16 },
  subtitle: { fontSize: 16, lineHeight: 22, color: c.textSecondary, textAlign: 'center', marginBottom: 24 },
  preparing: { fontSize: 16, lineHeight: 22, color: c.textSecondary, marginTop: 16 },
  retry: { minHeight: 56, borderRadius: 14, paddingHorizontal: 24, justifyContent: 'center', backgroundColor: c.primary },
  retryText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
