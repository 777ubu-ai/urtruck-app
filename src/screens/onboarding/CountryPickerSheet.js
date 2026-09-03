// CountryPickerSheet — bottom-sheet модал для выбора страны (dial code).
//
// Open from PhoneV2Screen через navigation.navigate('CountryPicker',
// { onSelect }). При выборе вызывает onSelect(country) и закрывает sheet.
//
// UX:
//   - Заголовок "Выберите страну" + кнопка крестик слева.
//   - Поле поиска (по имени или dial-code).
//   - Секция "Популярные" — ключевые рынки UrTruck.
//   - Секция "Все страны" — остальные алфавитом.
//   - Футер-хинт о различиях операторов связи.

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { brandLight as brand, radius, space, typography } from '../../theme/brandV2';
import { COUNTRIES, POPULAR_ISO } from '../../utils/countries';

const Row = ({ s, country, label, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      s.row,
      pressed && { backgroundColor: brand.surfaceMuted },
    ]}
    testID={`country-row-${country.iso}`}
  >
    <Text style={s.flag}>{country.flag}</Text>
    <Text style={s.countryName}>{label}</Text>
    <Text style={s.dial}>+{country.dial}</Text>
    <Feather name="chevron-right" size={18} color={brand.textTertiary} />
  </Pressable>
);

export default function CountryPickerSheet({ navigation, route }) {
  const s = React.useMemo(() => makeStyles(brand), []);
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const onSelect = route?.params?.onSelect;

  const countryLabel = React.useCallback((country) => {
    const translated = t(`country_${country.iso}`);
    return translated && translated !== `country_${country.iso}` ? translated : country.name;
  }, [t, lang]);

  // Search against both the visible translation and the canonical name, so a
  // Chinese driver can find 中国 while an operator can still enter "China".
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    const qDigits = q.replace(/[^\d]/g, '');
    return COUNTRIES.filter((country) =>
      countryLabel(country).toLowerCase().includes(q)
      || country.name.toLowerCase().includes(q)
      || country.iso.toLowerCase().includes(q)
      || (!!qDigits && country.dial.startsWith(qDigits))
    );
  }, [query, countryLabel]);

  // Когда юзер ищет — показываем плоский список без секций.
  const isSearching = query.trim().length > 0;

  const popular = useMemo(
    () => POPULAR_ISO.map((iso) => COUNTRIES.find((c) => c.iso === iso)).filter(Boolean),
    [],
  );
  const others = useMemo(
    () => [...COUNTRIES.filter((c) => !POPULAR_ISO.includes(c.iso))].sort((a, b) =>
      countryLabel(a).localeCompare(countryLabel(b), lang === 'ZH' ? 'zh-CN' : lang === 'KK' ? 'kk-KZ' : lang === 'EN' ? 'en-US' : 'ru-RU'),
    ),
    [countryLabel, lang],
  );

  const handlePick = (country) => {
    if (typeof onSelect === 'function') {
      onSelect(country);
    }
    navigation.goBack();
  };

  const close = () => navigation.goBack();

  const sections = isSearching
    ? [{ key: 'search', data: filtered, title: null }]
    : [
        { key: 'popular', data: popular, title: t('country_picker_popular') },
        { key: 'all',     data: others,  title: t('country_picker_all') },
      ];

  // Уплощаем секции с заголовками для FlatList: title-row + data rows.
  const flat = [];
  sections.forEach((sec) => {
    if (sec.title) flat.push({ type: 'header', key: `h-${sec.key}`, title: sec.title });
    sec.data.forEach((c) => flat.push({ type: 'row', key: `c-${c.iso}`, country: c }));
  });

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Drag handle сверху — визуальный маркер bottom-sheet */}
      <View style={s.handleWrap}>
        <View style={s.handle} />
      </View>

      <View style={s.header}>
        <TouchableOpacity
          onPress={close}
          style={s.closeBtn}
          accessibilityLabel="close"
          testID="country-picker-close"
        >
          <Feather name="x" size={22} color={brand.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>{t('country_picker_title')}</Text>
        <View style={s.closeBtn} />
      </View>

      <View style={s.searchWrap}>
        <Feather name="search" size={18} color={brand.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('country_picker_search')}
          placeholderTextColor={brand.textTertiary}
          style={s.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          testID="country-picker-search"
        />
      </View>

      <FlatList
        data={flat}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <Text style={s.sectionTitle}>{item.title}</Text>
          ) : (
            <Row s={s} country={item.country} label={countryLabel(item.country)} onPress={() => handlePick(item.country)} />
          )
        }
        ItemSeparatorComponent={null}
        contentContainerStyle={{ paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
      />

      <View style={s.footer}>
        <Feather name="globe" size={16} color={brand.textSecondary} />
        <Text style={s.footerText}>{t('country_picker_footer_hint')}</Text>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (brand) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: brand.bg,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: brand.borderStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: {
    width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    ...typography.h2,
    color: brand.textPrimary,
    textAlign: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    backgroundColor: brand.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: brand.textPrimary,
    paddingVertical: 0,
  },
  sectionTitle: {
    ...typography.caption,
    color: brand.textSecondary,
    fontWeight: '700',
    textTransform: 'capitalize',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: brand.divider,
    gap: 12,
  },
  flag: {
    fontSize: 24,
  },
  countryName: {
    flex: 1,
    ...typography.bodyLarge,
    color: brand.textPrimary,
    fontWeight: '600',
  },
  dial: {
    ...typography.body,
    color: brand.textSecondary,
    fontWeight: '600',
    marginRight: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: brand.surfaceMuted,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  footerText: {
    flex: 1,
    ...typography.bodySmall,
    color: brand.textSecondary,
  },
});
