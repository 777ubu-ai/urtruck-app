// Роль остаётся локальным выбором до успешного сохранения профиля.
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { RegistrationHeader, registrationColors as c } from './RegistrationPresentation';

function RoleCard({ icon, title, description, selected, onPress, testID }) {
  return <Pressable onPress={onPress} testID={testID} accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked: selected, selected }} style={({ pressed }) => [s.card, selected && s.cardSelected, pressed && s.pressed]}>
    <Feather name={icon} size={32} color={selected ? c.primary : c.textSecondary} />
    <View style={s.copy}><Text style={s.cardTitle}>{title}</Text><Text style={s.description}>{description}</Text></View>
    <View style={[s.indicator, selected && s.indicatorSelected]}>{selected ? <Feather name="check" size={15} color="#FFFFFF" /> : null}</View>
  </Pressable>;
}
export default function RoleScreenV2({ navigation, route }) {
  const { t } = useI18n();
  const signupIdentity = route?.params?.phone || '';
  const [selected, setSelected] = useState(null);
  const onContinue = () => {
    if (!selected) return;
    navigation.navigate('ProfileV2', { phone: signupIdentity, role: selected });
  };
  return <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="role-v2-screen">
    <RegistrationHeader navigation={navigation} back={false} />
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>{t('role_v2_title')}</Text>
      <View style={s.cards}>
        <RoleCard icon="truck" title={t('role_v2_driver')} description={t('role_v2_driver_desc')} selected={selected === 'driver'} onPress={() => setSelected('driver')} testID="role-v2-driver" />
        <RoleCard icon="package" title={t('shipper_label')} description={t('role_v2_client_desc')} selected={selected === 'client'} onPress={() => setSelected('client')} testID="role-v2-client" />
      </View>
    </ScrollView>
    <View style={s.ctaWrap}><Pressable onPress={onContinue} disabled={!selected} accessibilityRole="button" accessibilityState={{ disabled: !selected }} testID="role-v2-cta" style={({ pressed }) => [s.cta, !selected && s.disabled, pressed && s.pressed]}><Text style={s.ctaText}>{t('role_v2_continue')}</Text></Pressable></View>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 40, paddingBottom: 24 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: c.textPrimary, marginBottom: 28, maxWidth: 340 },
  cards: { gap: 12 },
  card: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  cardSelected: { borderColor: c.primary, backgroundColor: c.selected },
  copy: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
  description: { fontSize: 14, lineHeight: 19, color: c.textSecondary },
  indicator: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  indicatorSelected: { backgroundColor: c.primary, borderColor: c.primary },
  ctaWrap: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 12 },
  cta: { minHeight: 56, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary },
  ctaText: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: '#FFFFFF' },
  disabled: { backgroundColor: c.disabled },
  pressed: { opacity: 0.8 },
});
