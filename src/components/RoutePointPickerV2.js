// RoutePointPickerV2 — выбор маршрутной точки: СТРАНА → ВСЯ СТРАНА / ГОРОД /
// ПОГРАНПЕРЕХОД (Main Route Filter V2, Task 3).
//
// Одна модель для обеих ролей (§2): driver→Loads и shipper→Trucks
// используют ЭТОТ ЖЕ компонент, «Откуда» и «Куда» симметричны (§3).
//
// Навигация (§10):
//   Все страны → Китай → город/КПП
//   Back: город → Китай → Все страны
// Выбранное значение при back НЕ сбрасывается — сбрасывает только явная
// кнопка очистки (§19).
//
// «Весь Китай» (§4) — не fake city: это scope { countryId, locationId: null }.
//
// Сердечки избранного сохранены (§10) и работают на location_id, а не на
// русском названии — раньше избранное ломалось при смене языка.

import React from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, SectionList,
  StyleSheet, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, v1Radius } from '../theme/designV1';
import { storage } from '../utils/storage';
import {
  COUNTRIES, LOCATION_TYPES, countryFlag, getCountry, getLocation,
  locationsForCountry, localizedName, makeRoutePoint, routePointLabel,
  searchGeo, wholeCountryLabel,
} from '../utils/geoCatalog';
import { routeStrings, SCOPE_LABELS } from '../utils/routeFilterStrings';

const FAV_KEY = 'ur_fav_locations_v2';
const SEARCH_DEBOUNCE_MS = 220;

const TYPE_ICON = {
  [LOCATION_TYPES.CITY]: '🏙',
  [LOCATION_TYPES.BORDER_CROSSING]: '🛂',
  [LOCATION_TYPES.LOGISTICS_HUB]: '🏗',
};

const loadFavs = async () => {
  try {
    const raw = await storage.get(FAV_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export default function RoutePointPickerV2({
  visible,
  onClose,
  onSelect,          // (point | null) — null означает «очистить»
  value = null,      // { countryId, locationId } | null
  title = '',
  lang = 'ru',
  testIDPrefix = 'route-picker',
}) {
  const colors = useV1Colors();
  const t = routeStrings(lang);

  // Стадия: null = список стран, иначе код выбранной страны (§10).
  const [stageCountry, setStageCountry] = React.useState(value?.countryId || null);
  const [rawQuery, setRawQuery] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [favs, setFavs] = React.useState([]);

  // При каждом открытии возвращаемся на стадию уже выбранной страны, а не
  // на «Все страны» — иначе пользователь, открывший пикер второй раз, терял
  // контекст и начинал с нуля (§10: не сбрасывать выбранное неожиданно).
  React.useEffect(() => {
    if (!visible) return;
    setStageCountry(value?.countryId || null);
    setRawQuery('');
    setQuery('');
    loadFavs().then(setFavs);
  }, [visible, value?.countryId]);

  // §6: debounce. Поиск идёт по индексу в памяти, но на каждое нажатие
  // пересобирать список из 200 строк и ре-рендерить SectionList не нужно.
  React.useEffect(() => {
    const id = setTimeout(() => setQuery(rawQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [rawQuery]);

  const toggleFav = React.useCallback((locationId) => {
    setFavs((prev) => {
      const next = prev.includes(locationId)
        ? prev.filter((x) => x !== locationId)
        : [locationId, ...prev].slice(0, 40);
      storage.set(FAV_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const pick = React.useCallback((countryId, locationId) => {
    const point = makeRoutePoint(countryId, locationId);
    if (!point) return;              // невалидная пара — молча не выбираем
    onSelect?.(point);
    onClose?.();
  }, [onSelect, onClose]);

  // ── данные для списка ────────────────────────────────────────────────
  const sections = React.useMemo(() => {
    const trimmed = query.trim();

    // Режим поиска (§6): страны + города + КПП + хабы одним списком.
    if (trimmed) {
      const hits = searchGeo(trimmed, { limit: 40, countryId: stageCountry });
      if (!hits.length) return [];
      return [{
        key: 'search',
        title: null,
        data: hits.map((h) => ({
          kind: h.kind,
          countryId: h.countryId,
          locationId: h.locationId,
          type: h.type,
        })),
      }];
    }

    // Стадия 1 — страны.
    if (!stageCountry) {
      const favLocations = favs
        .map((id) => getLocation(id))
        .filter(Boolean)
        .map((l) => ({ kind: 'location', countryId: l.country_id, locationId: l.id, type: l.type }));
      const out = [];
      if (favLocations.length) {
        out.push({ key: 'favs', title: '★', data: favLocations });
      }
      out.push({
        key: 'countries',
        title: t.route_pick_country,
        data: COUNTRIES.map((c) => ({ kind: 'country', countryId: c.id, locationId: null })),
      });
      return out;
    }

    // Стадия 2 — внутри страны: сначала WHOLE COUNTRY, затем по типам (§5/§9).
    const out = [{
      key: 'whole',
      title: null,
      data: [{ kind: 'whole', countryId: stageCountry, locationId: null }],
    }];
    const groups = [
      [LOCATION_TYPES.CITY, t.route_type_city],
      [LOCATION_TYPES.BORDER_CROSSING, t.route_type_border],
      [LOCATION_TYPES.LOGISTICS_HUB, t.route_type_hub],
    ];
    for (const [type, label] of groups) {
      const list = locationsForCountry(stageCountry, type);
      if (!list.length) continue;
      out.push({
        key: type,
        title: label,
        data: list.map((l) => ({ kind: 'location', countryId: l.country_id, locationId: l.id, type: l.type })),
      });
    }
    return out;
  }, [query, stageCountry, favs, t]);

  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const renderRow = ({ item }) => {
    // Страна на стадии 1 → уходим внутрь страны, а не выбираем сразу:
    // выбрать «всю страну» можно первой строкой следующего экрана. Так
    // «Китай» никогда не означает случайно «только весь Китай».
    if (item.kind === 'country') {
      const country = getCountry(item.countryId);
      return (
        <TouchableOpacity
          style={styles.row}
          onPress={() => setStageCountry(item.countryId)}
          accessibilityRole="button"
          testID={`${testIDPrefix}-country-${item.countryId}`}
        >
          <Text style={styles.rowIcon}>{country?.flag || '📍'}</Text>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {localizedName(country, lang)}
          </Text>
          <Feather name="chevron-right" size={18} color={colors.muted} />
        </TouchableOpacity>
      );
    }

    if (item.kind === 'whole') {
      return (
        <TouchableOpacity
          style={[styles.row, styles.rowWhole]}
          onPress={() => pick(item.countryId, null)}
          accessibilityRole="button"
          testID={`${testIDPrefix}-whole-${item.countryId}`}
        >
          <Text style={styles.rowIcon}>{countryFlag(item.countryId) || '🌍'}</Text>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitleStrong} numberOfLines={1}>
              {wholeCountryLabel(item.countryId, lang, SCOPE_LABELS)}
            </Text>
            <Text style={styles.rowHint} numberOfLines={1}>{t.route_whole_country_hint}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    const loc = getLocation(item.locationId);
    if (!loc) return null;
    const isFav = favs.includes(loc.id);
    return (
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.rowMain}
          onPress={() => pick(item.countryId, item.locationId)}
          accessibilityRole="button"
          testID={`${testIDPrefix}-location-${loc.id}`}
        >
          <Text style={styles.rowIcon}>{TYPE_ICON[loc.type] || '📍'}</Text>
          <View style={styles.rowTextWrap}>
            {/* §9: КПП и хаб визуально отличаются от города суффиксом. */}
            <Text style={styles.rowTitle} numberOfLines={1}>
              {routePointLabel({ countryId: item.countryId, locationId: loc.id }, lang, SCOPE_LABELS)}
            </Text>
            <Text style={styles.rowHint} numberOfLines={1}>
              {countryFlag(item.countryId)} {localizedName(getCountry(item.countryId), lang)}
            </Text>
          </View>
        </TouchableOpacity>
        {/* Favorites hearts оставлены (§10). */}
        <TouchableOpacity
          onPress={() => toggleFav(loc.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={loc.names.ru}
          testID={`${testIDPrefix}-fav-${loc.id}`}
        >
          <Feather name="heart" size={18} color={isFav ? colors.accent : colors.muted} />
        </TouchableOpacity>
      </View>
    );
  };

  const goBack = () => {
    // §10: город → страна → все страны. Пикер закрывается только со стадии 1.
    if (query.trim()) { setRawQuery(''); setQuery(''); return; }
    if (stageCountry) { setStageCountry(null); return; }
    onClose?.();
  };

  const headerTitle = stageCountry
    ? localizedName(getCountry(stageCountry), lang)
    : (title || t.route_all_countries);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={goBack}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={goBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            testID={`${testIDPrefix}-back`}
          >
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          {value ? (
            <TouchableOpacity
              onPress={() => { onSelect?.(null); onClose?.(); }}
              accessibilityRole="button"
              testID={`${testIDPrefix}-clear`}
            >
              <Text style={styles.headerClear}>{t.route_any_where}</Text>
            </TouchableOpacity>
          ) : <View style={styles.headerSpacer} />}
        </View>

        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            value={rawQuery}
            onChangeText={setRawQuery}
            placeholder={t.route_search_placeholder}
            placeholderTextColor={colors.placeholder || colors.muted}
            autoCorrect={false}
            returnKeyType="search"
            testID={`${testIDPrefix}-search`}
          />
          {rawQuery ? (
            <Pressable
              onPress={() => { setRawQuery(''); setQuery(''); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID={`${testIDPrefix}-search-clear`}
            >
              <Feather name="x" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(item, i) => `${item.kind}:${item.countryId}:${item.locationId || 'whole'}:${i}`}
          renderItem={renderRow}
          renderSectionHeader={({ section }) => (section.title
            ? <Text style={styles.sectionHeader}>{section.title}</Text>
            : null)}
          // §18: длинные списки не рендерятся целиком.
          initialNumToRender={16}
          maxToRenderPerBatch={16}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={(
            <Text style={styles.empty} testID={`${testIDPrefix}-empty`}>
              {t.route_search_nothing}
            </Text>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  headerClear: { fontSize: 14, fontWeight: '600', color: colors.accent },
  headerSpacer: { width: 1 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 12, paddingHorizontal: 12, height: 44,
    backgroundColor: colors.card, borderRadius: v1Radius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.4,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16,
    // Touch target ≥ 48dp — компактность не должна ломать попадание пальцем.
    minHeight: 52, paddingVertical: 8,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowWhole: { backgroundColor: colors.tint || colors.card },
  rowIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  rowTextWrap: { flex: 1 },
  rowTitle: { fontSize: 15, color: colors.text },
  rowTitleStrong: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.muted, fontSize: 14, paddingVertical: 32 },
});
