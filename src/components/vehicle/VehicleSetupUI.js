import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import BottomSheet from '../ui/v1/BottomSheet';
import BackButton from '../ui/v1/BackButton';
import CountryFlag from '../ui/v1/CountryFlag';
import { useI18n } from '../../utils/useI18n';
import { ALL_COUNTRIES, getCountryName, searchAllCountries } from '../../utils/countries';
import { brand, radius, typography } from '../../theme/brandV2';
import { getVehicleCopy } from '../../utils/vehicleSetupCopy';

export const STEPS = 4;
export const useVehicleCopy = () => {
  const { lang } = useI18n();
  return { lang, c: getVehicleCopy(lang) };
};

export function ProgressHeader({ navigation, step, c }) {
  return <View style={styles.header}>
    <BackButton onPress={() => navigation.goBack()} label={c.back} />
    <View style={styles.progress}>{Array.from({ length: STEPS }).map((_, i) => <View key={i} style={[styles.segment, i < step && styles.segmentActive]} />)}</View>
    <Text style={styles.step}>{c.step} {step} {c.of} {STEPS}</Text>
  </View>;
}

export function SelectRow({ icon, value, placeholder, onPress, testID }) {
  return <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.select, pressed && { opacity: 0.75 }]} accessibilityRole="button">
    <View style={styles.iconBox}><Feather name={icon} size={22} color={brand.textSecondary} /></View>
    <Text style={[styles.selectText, !value && styles.empty]} numberOfLines={1}>{value || placeholder || ''}</Text>
    <Feather name="chevron-down" size={22} color={brand.textSecondary} />
  </Pressable>;
}

export function Label({ children, optional }) { return <View style={styles.labelRow}><Text style={styles.label}>{children}</Text>{optional ? <Text style={styles.optional}> ({optional})</Text> : null}</View>; }

export function CountrySheet({ visible, onClose, onSelect, title }) {
  const { lang } = useI18n();
  const [query, setQuery] = useState('');
  const list = useMemo(() => searchAllCountries(query, lang), [query, lang]);
  return <BottomSheet visible={visible} onClose={() => { setQuery(''); onClose(); }} title={title}>
    <View style={styles.search}><Feather name="search" size={18} color={brand.textTertiary} /><TextInput value={query} onChangeText={setQuery} placeholder={getVehicleCopy(lang).search} placeholderTextColor={brand.textTertiary} style={styles.searchInput} autoCapitalize="none" autoCorrect={false} /></View>
    {list.length ? list.map((country) => <Pressable key={country.iso} style={styles.option} onPress={() => { onSelect(country.iso); setQuery(''); onClose(); }}><CountryFlag code={country.iso} width={26} /><Text style={styles.optionText}>{getCountryName(country, lang)}</Text><Text style={styles.iso}>{country.iso}</Text></Pressable>) : <Text style={styles.emptyState}>{getVehicleCopy(lang).noCountries}</Text>}
  </BottomSheet>;
}

export function OptionSheet({ visible, onClose, title, options, value, onSelect, search = false, searchPlaceholder }) {
  const [query, setQuery] = useState('');
  const filtered = options.filter((item) => !query || item.label.toLowerCase().includes(query.toLowerCase()));
  return <BottomSheet visible={visible} onClose={() => { setQuery(''); onClose(); }} title={title}>
    {search ? <View style={styles.search}><Feather name="search" size={18} color={brand.textTertiary} /><TextInput value={query} onChangeText={setQuery} placeholder={searchPlaceholder || title} placeholderTextColor={brand.textTertiary} style={styles.searchInput} /></View> : null}
    {filtered.map((item) => <Pressable key={item.value} style={[styles.option, value === item.value && styles.optionSelected]} onPress={() => { onSelect(item.value); setQuery(''); onClose(); }}><Feather name={item.icon || 'truck'} size={21} color={brand.textSecondary} /><Text style={styles.optionText}>{item.label}</Text>{value === item.value ? <Feather name="check" size={20} color={brand.primary} /> : null}</Pressable>)}
  </BottomSheet>;
}

export const countryLabel = (iso, lang) => iso ? `${getCountryName({ iso }, lang)}` : '';

export const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  progress: { flex: 1, flexDirection: 'row', gap: 7 }, segment: { flex: 1, height: 6, borderRadius: 4, backgroundColor: '#E3EAF0' }, segmentActive: { backgroundColor: brand.primary }, step: { ...typography.bodySmall, color: brand.textSecondary, minWidth: 64, textAlign: 'right' },
  safe: { flex: 1, backgroundColor: brand.bg }, scroll: { paddingHorizontal: 20, paddingBottom: 120 }, title: { ...typography.h1, color: brand.textPrimary, marginTop: 20, marginBottom: 8 }, subtitle: { ...typography.bodyLarge, color: brand.textSecondary, marginBottom: 24 }, labelRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8, marginTop: 16 }, label: { ...typography.bodyLarge, color: brand.textPrimary, fontWeight: '700' }, optional: { ...typography.bodySmall, color: brand.textSecondary }, select: { minHeight: 58, borderWidth: 1, borderColor: brand.borderStrong, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', paddingRight: 16, backgroundColor: brand.surface }, iconBox: { width: 58, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: brand.divider }, selectText: { flex: 1, paddingHorizontal: 16, ...typography.bodyLarge, color: brand.textPrimary, fontWeight: '600' }, empty: { color: 'transparent' }, input: { minHeight: 56, borderWidth: 1, borderColor: brand.borderStrong, borderRadius: radius.lg, paddingHorizontal: 16, ...typography.bodyLarge, color: brand.textPrimary, backgroundColor: brand.surface }, row: { flexDirection: 'row', gap: 12 }, footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: brand.bg, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, borderTopWidth: 1, borderTopColor: brand.divider }, cta: { minHeight: 58, borderRadius: radius.lg, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' }, ctaDisabled: { backgroundColor: '#D8E0DC' }, ctaText: { ...typography.button, color: brand.textOnPrimary }, disabledText: { color: brand.textTertiary }, search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: brand.surfaceMuted, borderRadius: radius.md, paddingHorizontal: 12, marginBottom: 8 }, searchInput: { flex: 1, minHeight: 46, ...typography.body, color: brand.textPrimary }, option: { minHeight: 52, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: brand.divider }, optionSelected: { backgroundColor: brand.primarySoft }, optionText: { flex: 1, ...typography.bodyLarge, color: brand.textPrimary }, iso: { ...typography.caption, color: brand.textTertiary }, emptyState: { ...typography.body, color: brand.textSecondary, padding: 20, textAlign: 'center' }, error: { color: brand.errorText, ...typography.bodySmall, marginTop: 8 }, reviewCard: { backgroundColor: brand.surfaceSoft, borderRadius: radius.lg, padding: 16, marginBottom: 14 }, reviewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 }, reviewTitle: { flex: 1, ...typography.h2, fontSize: 18, color: brand.textPrimary }, edit: { color: brand.primary, fontWeight: '700' }, reviewRow: { flexDirection: 'row', marginTop: 8 }, reviewKey: { width: '48%', ...typography.bodySmall, color: brand.textSecondary }, reviewValue: { flex: 1, ...typography.body, color: brand.textPrimary, fontWeight: '600' }, successCircle: { width: 92, height: 92, borderRadius: 46, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 12, borderColor: brand.primarySoft }, benefit: { flex: 1, minHeight: 92, backgroundColor: brand.surfaceSoft, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', padding: 8 }, benefitText: { ...typography.caption, color: brand.textSecondary, textAlign: 'center', marginTop: 6 }, secondary: { minHeight: 54, borderRadius: radius.lg, borderWidth: 1, borderColor: brand.primary, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, secondaryText: { ...typography.button, color: brand.primary },
});
