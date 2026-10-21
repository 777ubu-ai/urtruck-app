import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, Dimensions, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import DatePicker from '../components/DatePicker';
import BookmarkButton from '../components/ui/v1/BookmarkButton';
import LocationPickerModal from '../components/LocationPickerModal';
import { useToast } from '../components/Toast';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { sessionRole } from '../utils/publicationSession';
import { BODY_TYPES } from '../utils/truckConstants';
import { getCountryName } from '../utils/countries';
import { externalFreightAPI } from '../utils/externalFreightFeed';
import { appendUnique, buildExternalFeedQuery, canSortPrice, externalLocationSelection, feedKindForRole, isValidPublicationRange } from '../utils/externalFreightModel';

const COPY = {
  RU: { cargoTitle: 'Лента грузов', vehicleTitle: 'Лента машин', from: 'Откуда', to: 'Куда', body: 'Кузов', date: 'Дата', price: 'Цена', empty: 'Объявлений пока нет', none: 'По фильтрам ничего не найдено', network: 'Нет соединения. Уже загруженные объявления сохранены.', server: 'Сервис ленты временно недоступен.', retry: 'Повторить', more: 'Ещё', less: 'Свернуть', translate: 'Перевести', original: 'Оригинал', copied: 'Контакт скопирован', today: 'Сегодня', yesterday: 'Вчера', apply: 'Применить', choose: 'Выбрать из списка', reset: 'Сбросить', cancel: 'Отмена', negotiable: 'Договорная', unknown: 'Цена не указана', loading: 'Загрузка…', dateFrom: 'С', dateTo: 'По', currency: 'Валюта', min: 'От суммы', max: 'До суммы', newest: 'Сначала новые', asc: 'Дешевле', desc: 'Дороже', retryPage: 'Не удалось загрузить следующую страницу', invalidPrice: 'Укажите валюту и корректный диапазон цены.', invalidDate: 'Начало периода не может быть позже окончания.' },
  KK: { cargoTitle: 'Жүк лентасы', vehicleTitle: 'Көлік лентасы', from: 'Қайдан', to: 'Қайда', body: 'Шанақ', date: 'Күні', price: 'Бағасы', empty: 'Әзірге хабарландыру жоқ', none: 'Сүзгі бойынша нәтиже жоқ', network: 'Желі жоқ. Жүктелген хабарландырулар сақталды.', server: 'Лента қызметі уақытша қолжетімсіз.', retry: 'Қайталау', more: 'Тағы', less: 'Жию', translate: 'Аудару', original: 'Түпнұсқа', copied: 'Байланыс көшірілді', today: 'Бүгін', yesterday: 'Кеше', apply: 'Қолдану', choose: 'Тізімнен таңдау', reset: 'Тазарту', cancel: 'Бас тарту', negotiable: 'Келісімді', unknown: 'Бағасы көрсетілмеген', loading: 'Жүктелуде…', dateFrom: 'Бастап', dateTo: 'Дейін', currency: 'Валюта', min: 'Ең азы', max: 'Ең көбі', newest: 'Алдымен жаңалары', asc: 'Арзанырақ', desc: 'Қымбатырақ', retryPage: 'Келесі бетті жүктеу мүмкін болмады', invalidPrice: 'Валюта мен баға аралығын тексеріңіз.', invalidDate: 'Жарияланым күндерінің аралығын тексеріңіз.' },
  ZH: { cargoTitle: '货源信息', vehicleTitle: '空车信息', from: '出发地', to: '目的地', body: '车厢类型', date: '日期', price: '价格', empty: '暂无公告', none: '没有符合筛选条件的结果', network: '网络不可用，已加载的信息已保留。', server: '信息服务暂时不可用。', retry: '重试', more: '更多', less: '收起', translate: '翻译', original: '原文', copied: '联系方式已复制', today: '今天', yesterday: '昨天', apply: '应用', choose: '从列表选择', reset: '重置', cancel: '取消', negotiable: '价格面议', unknown: '未提供价格', loading: '加载中…', dateFrom: '开始', dateTo: '结束', currency: '币种', min: '最低', max: '最高', newest: '最新优先', asc: '价格升序', desc: '价格降序', retryPage: '无法加载下一页', invalidPrice: '请检查币种和价格范围。', invalidDate: '请检查发布日期范围。' },
  EN: { cargoTitle: 'Cargo feed', vehicleTitle: 'Available trucks', from: 'From', to: 'To', body: 'Body', date: 'Date', price: 'Price', empty: 'No listings yet', none: 'No results for these filters', network: 'No connection. Loaded listings are kept.', server: 'The feed service is temporarily unavailable.', retry: 'Retry', more: 'More', less: 'Collapse', translate: 'Translate', original: 'Original', copied: 'Contact copied', today: 'Today', yesterday: 'Yesterday', apply: 'Apply', choose: 'Choose from list', reset: 'Reset', cancel: 'Cancel', negotiable: 'Negotiable', unknown: 'Price not provided', loading: 'Loading…', dateFrom: 'From', dateTo: 'To', currency: 'Currency', min: 'Minimum', max: 'Maximum', newest: 'Newest first', asc: 'Lowest price', desc: 'Highest price', retryPage: 'Could not load the next page', invalidPrice: 'Check the currency and price range.', invalidDate: 'Check the publication date range.' },
};
const bodyLabels = {
  RU: { tent: 'Тент', ref: 'Рефрижератор', izoterm: 'Изотерм', board: 'Борт', tipper: 'Самосвал', lowboy: 'Трал' },
  KK: { tent: 'Тент', ref: 'Рефрижератор', izoterm: 'Изотерм', board: 'Бортты', tipper: 'Өзі аударғыш', lowboy: 'Трал' },
  ZH: { tent: '篷车', ref: '冷藏车', izoterm: '保温车', board: '平板车', tipper: '自卸车', lowboy: '低平板车' },
  EN: { tent: 'Tent', ref: 'Refrigerated', izoterm: 'Insulated', board: 'Flatbed', tipper: 'Tipper', lowboy: 'Lowboy' },
};
const SAVED_COPY = {
  RU: { saved: 'Сохранённые', save: 'Сохранить', unsave: 'Убрать из сохранённых', expired: 'Устарело', closed: 'Закрыто', unavailable: 'Объявление недоступно' },
  KK: { saved: 'Сақталғандар', save: 'Сақтау', unsave: 'Сақталғаннан алып тастау', expired: 'Ескірген', closed: 'Жабық', unavailable: 'Хабарландыру қолжетімсіз' },
  ZH: { saved: '已收藏', save: '收藏', unsave: '取消收藏', expired: '已过期', closed: '已关闭', unavailable: '信息不可用' },
  EN: { saved: 'Saved', save: 'Save', unsave: 'Remove from saved', expired: 'Expired', closed: 'Closed', unavailable: 'Listing unavailable' },
};
const currencies = ['KZT', 'USD', 'EUR', 'RUB', 'CNY'];

export default function ExternalFreightFeedScreen({ navigation }) {
  const { session } = useAuth();
  const role = sessionRole(session) || 'guest';
  const isDriver = role === 'driver';
  const kind = feedKindForRole(role);
  const { lang, sp } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const l = COPY[lang] || COPY.EN;
  const sl = SAVED_COPY[lang] || SAVED_COPY.EN;
  const [savedOnly, setSavedOnly] = useState(false);
  const [saving, setSaving] = useState({});
  const bookmarkRequestsRef = useRef(new Map());
  const ownerKey = `${session?.user?.id || ''}:${role}`;
  const ownerRef = useRef(ownerKey);
  ownerRef.current = ownerKey;
  const emptyFilters = { origin: '', destination: '', origin_country: '', destination_country: '', body_type: '', published_from: '', published_to: '', currency: '', min_price: '', max_price: '', sort: 'newest' };
  const [filters, setFilters] = useState(emptyFilters);
  const [draft, setDraft] = useState(filters);
  const [modal, setModal] = useState(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [picker, setPicker] = useState(null);
  const [rows, setRows] = useState([]);
  const [rowsOwner, setRowsOwner] = useState(ownerKey);
  const visibleRows = rowsOwner === ownerKey ? rows : [];
  const [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [translations, setTranslations] = useState({});
  const [translating, setTranslating] = useState({});
  const requestRef = useRef(null);
  const translationRequestsRef = useRef(new Map());
  const languageRef = useRef(lang);
  languageRef.current = lang;
  const sequenceRef = useRef(0);
  const blurredRef = useRef(false);
  const loadRef = useRef(null);
  const styles = useMemo(() => makeStyles(theme, sp), [theme, lang]);
  const title = isDriver ? l.cargoTitle : l.vehicleTitle;

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const shown = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardHeight(Math.max(0, Number(event?.endCoordinates?.height) || 0));
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { shown.remove(); hidden.remove(); };
  }, []);

  const load = useCallback(async ({ reset = false, signal: suppliedSignal } = {}) => {
    if (busy && !reset) return;
    if (reset) {
      requestRef.current?.abort?.();
      sequenceRef.current += 1;
    }
    const sequence = sequenceRef.current;
    const controller = suppliedSignal ? null : new AbortController();
    if (controller) requestRef.current = controller;
    const signal = suppliedSignal || controller?.signal;
    setBusy(true); setError(null);
    const owner = ownerKey;
    const raw = { ...buildExternalFeedQuery(filters, { cursor, limit: 30, reset }), saved_only: savedOnly };
    const result = await externalFreightAPI.list(raw, signal).catch(() => ({ ok: false, error: 'network_error' }));
    if (sequence !== sequenceRef.current || signal?.aborted || owner !== ownerRef.current) return;
    if (!result.ok) {
      setError(result.error || 'server_error');
      setBusy(false); setRefreshing(false);
      return;
    }
    const incoming = Array.isArray(result.items) ? result.items : [];
    setRowsOwner(owner);
    setRows(current => reset ? incoming : appendUnique(current, incoming));
    setCursor(result.next_cursor || null);
    setBusy(false); setRefreshing(false);
  }, [busy, filters, cursor, savedOnly, ownerKey]);
  loadRef.current = load;

  useEffect(() => { setRows([]); setCursor(null); load({ reset: true }); return () => requestRef.current?.abort?.(); }, [filters, savedOnly, ownerKey]);
  useEffect(() => {
    setExpanded({}); setTranslations({}); setSaving({});
    return () => {
      bookmarkRequestsRef.current.forEach(controller => controller.abort());
      bookmarkRequestsRef.current.clear();
      translationRequestsRef.current.forEach(controller => controller.abort());
      translationRequestsRef.current.clear();
    };
  }, [ownerKey]);
  useEffect(() => { externalFreightAPI.event('feed_open'); }, []);
  useEffect(() => {
    const cancel = () => {
      sequenceRef.current += 1;
      requestRef.current?.abort?.();
      requestRef.current = null;
      translationRequestsRef.current.forEach(controller => controller.abort());
      translationRequestsRef.current.clear();
      bookmarkRequestsRef.current.forEach(controller => controller.abort());
      bookmarkRequestsRef.current.clear();
      setSaving({});
      setTranslating({});
      setBusy(false);
      setRefreshing(false);
    };
    const blur = navigation.addListener('blur', () => { blurredRef.current = true; cancel(); });
    const focus = navigation.addListener('focus', () => {
      if (blurredRef.current) { blurredRef.current = false; loadRef.current?.({ reset: true }); }
    });
    const app = AppState.addEventListener('change', state => {
      if (state !== 'active') cancel();
      else if (!blurredRef.current && navigation.isFocused?.()) loadRef.current?.({ reset: true });
    });
    return () => { blur(); focus(); app?.remove?.(); cancel(); };
  }, [navigation]);

  const applyFilters = () => {
    const next = { ...draft };
    if (!isValidPublicationRange(next)) {
      Alert.alert(l.date, l.invalidDate);
      return;
    }
    const usesPrice = !!(next.currency || next.min_price || next.max_price || next.sort !== 'newest');
    if (usesPrice && !canSortPrice(next)) {
      Alert.alert(l.price, l.invalidPrice);
      return;
    }
    externalFreightAPI.event('filter_apply');
    setModal(null); setFilters(next); setCursor(null); setRows([]);
  };
  const resetFilters = () => {
    const empty = { ...emptyFilters };
    setDraft(empty); setFilters(empty); setCursor(null); setRows([]); setModal(null);
  };
  const choosePresetDate = (days) => {
    const d = new Date(); d.setDate(d.getDate() - days);
    const value = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    setDraft(current => ({ ...current, published_from: value, published_to: value }));
  };
  const copyContact = async (contact) => {
    try { await Clipboard.setStringAsync(String(contact)); externalFreightAPI.event('contact_copy'); toast(l.copied, 'success'); } catch { toast(l.retry, 'error'); }
  };
  const toggleBookmark = async (item) => {
    if (bookmarkRequestsRef.current.has(item.id)) return;
    const owner = ownerRef.current;
    const desired = !item.saved;
    const controller = new AbortController();
    bookmarkRequestsRef.current.set(item.id, controller);
    setSaving(current => ({ ...current, [item.id]: true }));
    try {
      const result = await externalFreightAPI.bookmark(item.id, desired, controller.signal, () => owner === ownerRef.current);
      if (controller.signal.aborted || owner !== ownerRef.current) return;
      if (!result.ok || result.saved !== desired) { toast(l.retry, 'error'); return; }
      setRows(current => savedOnly && !desired ? current.filter(row => row.id !== item.id) : current.map(row => row.id === item.id ? { ...row, saved: desired } : row));
    } catch (error) {
      if (error?.name !== 'AbortError' && owner === ownerRef.current) toast(l.retry, 'error');
    } finally {
      if (bookmarkRequestsRef.current.get(item.id) === controller) {
        bookmarkRequestsRef.current.delete(item.id);
        setSaving(current => ({ ...current, [item.id]: false }));
      }
    }
  };
  const translate = async (item) => {
    if (translations[item.id]?.revision === item.source_revision && translations[item.id]?.lang === lang) { setTranslations(current => ({ ...current, [item.id]: { ...current[item.id], show: !current[item.id].show } })); return; }
    if (translating[item.id]) return;
    const owner = ownerRef.current;
    externalFreightAPI.event('translation_request');
    const controller = new AbortController();
    translationRequestsRef.current.set(item.id, controller);
    setTranslating(current => ({ ...current, [item.id]: true }));
    try {
      const result = await externalFreightAPI.translate(item.id, lang, controller.signal);
      if (controller.signal.aborted || owner !== ownerRef.current) return;
      if (!result.ok || !result.translated_text) { toast(l.retry, 'error'); return; }
      if (result.source_revision !== item.source_revision || lang !== languageRef.current) return;
      setTranslations(current => ({ ...current, [item.id]: { revision: result.source_revision, lang, text: result.translated_text, show: true } }));
    } catch (error) {
      if (error?.name !== 'AbortError') toast(l.retry, 'error');
    } finally {
      if (translationRequestsRef.current.get(item.id) === controller) {
        translationRequestsRef.current.delete(item.id);
        setTranslating(current => ({ ...current, [item.id]: false }));
      }
    }
  };

  const locationLabel = key => filters[key]
    ? `${filters[key]}${filters[`${key}_country`] ? `, ${filters[`${key}_country`]}` : ''}`
    : filters[`${key}_country`] ? getCountryName(filters[`${key}_country`], lang) : '';
  const filterButton = (name, label, value) => (
    <TouchableOpacity key={name} style={[styles.filterButton, value ? styles.filterActive : null]} onPress={() => { setDraft(filters); if (name === 'origin' || name === 'destination') setPicker(name); else setModal(name); }} accessibilityRole="button" accessibilityLabel={label} testID={`external-feed-filter-${name}`}>
      <Text style={[styles.filterText, value ? styles.filterTextActive : null]}>{label}{value ? ` · ${value}` : ''}</Text><Feather name="chevron-down" size={13} color={value ? '#168759' : theme.textMuted} />
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => {
    const open = !!expanded[item.id];
    const translated = translations[item.id]?.revision === item.source_revision && translations[item.id]?.lang === lang && translations[item.id]?.show;
    const locations = item.kind === 'cargo' ? [item.origin, item.destination] : [item.origin, item.destination];
    const price = item.price_state === 'negotiable' ? l.negotiable : item.price_state === 'known' ? `${formatNumber(item.amount)} ${item.currency}` : l.unknown;
    return <View style={styles.card} testID={`external-feed-card-${item.id}`}>
      <View style={styles.cardHeading}>
        <Text style={[styles.route, styles.routeFlex]} numberOfLines={2}>{item.status === 'unavailable' ? sl.unavailable : locations.filter(Boolean).join(' → ')}</Text>
        <View style={styles.saveSlot}>
          <BookmarkButton saved={item.saved} onPress={() => toggleBookmark(item)} accessibilityLabel={item.saved ? sl.unsave : sl.save} testID={`external-feed-bookmark-${item.id}`} />
          {saving[item.id] ? <ActivityIndicator size="small" color="#168759" /> : null}
        </View>
      </View>
      {['expired', 'closed'].includes(item.status) ? <Text style={styles.meta}>{sl[item.status]}</Text> : null}
      {item.kind === 'cargo' && item.cargo_name ? <Text style={styles.strong}>{item.cargo_name}</Text> : null}
      {item.body_types?.length ? <Text style={styles.meta}>{(item.body_types || []).map(x => bodyLabels[lang]?.[x] || x).join(', ')}</Text> : null}
      {item.weight != null || item.volume != null ? <Text style={styles.meta}>{[item.weight != null ? `${formatNumber(item.weight)} t` : '', item.volume != null ? `${formatNumber(item.volume)} m³` : ''].filter(Boolean).join(' · ')}</Text> : null}
      {item.vehicle_count != null ? <Text style={styles.meta}>{`${item.vehicle_count} ${isDriver ? ({ RU: 'машин требуется', KK: 'көлік қажет', ZH: '需要车辆', EN: 'trucks needed' }[lang] || 'trucks needed') : ({ RU: 'машин свободно', KK: 'бос көлік', ZH: '有空车', EN: 'trucks available' }[lang] || 'trucks available')}`}</Text> : null}
      {item.loading_date || item.ready_text ? <Text style={styles.meta}>{item.loading_date || item.ready_text}</Text> : null}
      {item.status !== 'unavailable' ? <Text style={styles.price}>{price}</Text> : null}
      {Array.isArray(item.contacts) && item.contacts.filter(Boolean).map((contact, index) => <TouchableOpacity key={`${item.id}-contact-${index}`} onPress={() => copyContact(contact)} style={styles.contact} accessibilityRole="button" testID={`external-feed-copy-${item.id}-${index}`}><Text style={styles.contactText} selectable>{contact}</Text><Feather name="copy" size={14} color={'#168759'} /></TouchableOpacity>)}
      <Text style={styles.date}>{formatDate(item.source_published_at, lang)}</Text>
      {item.status === 'unavailable' ? null : open ? <View style={styles.details}>
        {item.original_text ? <Text style={styles.original}>{translated ? translations[item.id]?.text : item.original_text}</Text> : null}
        {item.ready_text && item.loading_date ? <Text style={styles.meta}>{item.ready_text}</Text> : null}
        <TouchableOpacity onPress={() => translate(item)} disabled={!!translating[item.id]} style={styles.textAction} testID={`external-feed-translate-${item.id}`}><Text style={styles.link}>{translating[item.id] ? l.loading : translated ? l.original : l.translate}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setExpanded(current => ({ ...current, [item.id]: false }))} style={styles.textAction}><Text style={styles.link}>{l.less}</Text></TouchableOpacity>
      </View> : <TouchableOpacity onPress={() => { externalFreightAPI.event('card_expand'); setExpanded(current => ({ ...current, [item.id]: true })); }} style={styles.textAction} testID={`external-feed-expand-${item.id}`}><Text style={styles.link}>{l.more}</Text></TouchableOpacity>}
    </View>;
  };

  const priceModal = modal === 'price';
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="external-freight-feed-screen">
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={l.cancel} testID="external-feed-back"><Feather name="arrow-left" size={23} color={theme.text} /></TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <TouchableOpacity style={styles.savedHeader} onPress={() => setSavedOnly(current => !current)} accessibilityRole="button" accessibilityLabel={sl.saved} accessibilityState={{ selected: savedOnly }} testID="external-feed-saved-only">
        <Feather name="bookmark" size={20} color={savedOnly ? '#168759' : theme.textMuted} />
        <Text style={styles.link}>{sl.saved}</Text>
      </TouchableOpacity>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filterContent} keyboardShouldPersistTaps="handled">
      {filterButton('origin', l.from, locationLabel('origin'))}{filterButton('destination', l.to, locationLabel('destination'))}{filterButton('body', l.body, filters.body_type ? bodyLabels[lang]?.[filters.body_type] || filters.body_type : '')}{filterButton('date', l.date, filters.published_from ? `${formatDate(filters.published_from, lang)}${filters.published_to ? ` – ${formatDate(filters.published_to, lang)}` : ''}` : '')}{filterButton('price', l.price, filters.currency || filters.min_price || filters.max_price ? [filters.min_price, filters.max_price].filter(Boolean).join('–') + (filters.currency ? ` ${filters.currency}` : '') : '')}
    </ScrollView>
    {error && rows.length ? <TouchableOpacity style={styles.warning} onPress={() => load({ reset: true })}><Text style={styles.warningText}>{error === 'network_error' ? l.network : l.server} {l.retry}</Text></TouchableOpacity> : null}
    {error && !rows.length ? <View style={styles.center}><Text style={styles.message}>{error === 'network_error' ? l.network : l.server}</Text><TouchableOpacity style={styles.primary} onPress={() => load({ reset: true })}><Text style={styles.primaryText}>{l.retry}</Text></TouchableOpacity></View> : null}
    {!error || rows.length ? <FlatList data={visibleRows} renderItem={renderItem} keyExtractor={item => String(item.id)} contentContainerStyle={rows.length ? styles.list : styles.listEmpty} onRefresh={() => { setRefreshing(true); load({ reset: true }); }} refreshing={refreshing} onEndReached={() => { if (!busy && cursor) load(); }} onEndReachedThreshold={0.45} ListEmptyComponent={busy ? <ActivityIndicator color={'#168759'} style={{ marginTop: 40 }} /> : <Text style={styles.message}>{filters.origin || filters.destination || filters.body_type || filters.published_from || filters.min_price ? l.none : l.empty}</Text>} ListFooterComponent={busy && rows.length ? <ActivityIndicator color={'#168759'} style={{ marginVertical: 14 }} /> : null} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} removeClippedSubviews /> : null}
    <LocationPickerModal visible={picker === 'origin' || picker === 'destination'} onClose={() => setPicker(null)} title={picker === 'origin' ? l.from : l.to} allowCountryOnly showGeo={false} onSelect={(value, point) => { const key = picker; const selection = externalLocationSelection(key, value, point); externalFreightAPI.event('filter_apply'); setDraft(current => ({ ...current, ...selection })); setFilters(current => ({ ...current, ...selection })); setPicker(null); }} />
    <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={styles.scrim} onPress={() => setModal(null)}><Pressable style={[styles.sheet, Platform.OS === 'android' && keyboardHeight > 0 && { marginBottom: keyboardHeight, maxHeight: Math.max(220, Dimensions.get('screen').height - keyboardHeight - 24) }]} onPress={e => e.stopPropagation()}>
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
        <Text style={styles.sheetTitle}>{modal === 'origin' ? l.from : modal === 'destination' ? l.to : modal === 'body' ? l.body : modal === 'date' ? l.date : l.price}</Text>
        {modal === 'body' ? <ScrollView style={{ maxHeight: 310 }}>{BODY_TYPES.map(body => <TouchableOpacity key={body} style={styles.option} onPress={() => setDraft(current => ({ ...current, body_type: current.body_type === body ? '' : body }))}><Text style={styles.optionText}>{bodyLabels[lang]?.[body] || body}</Text><Text style={styles.optionText}>{draft.body_type === body ? '✓' : ''}</Text></TouchableOpacity>)}</ScrollView> : null}
        {modal === 'date' ? <View><View style={styles.quickRow}><TouchableOpacity onPress={() => choosePresetDate(0)}><Text style={styles.link}>{l.today}</Text></TouchableOpacity><TouchableOpacity onPress={() => choosePresetDate(1)}><Text style={styles.link}>{l.yesterday}</Text></TouchableOpacity></View><Text style={styles.hint}>{l.dateFrom}</Text><DatePicker value={draft.published_from} onChange={value => setDraft(current => ({ ...current, published_from: value }))} allowPast /><Text style={styles.hint}>{l.dateTo}</Text><DatePicker value={draft.published_to} onChange={value => setDraft(current => ({ ...current, published_to: value }))} allowPast /></View> : null}
        {priceModal ? <View><View style={styles.quickRow}>{currencies.map(value => <TouchableOpacity key={value} style={[styles.currencyChip, draft.currency === value && styles.currencySelected]} onPress={() => setDraft(current => ({ ...current, currency: value }))}><Text style={styles.optionText}>{value}</Text></TouchableOpacity>)}</View><View style={styles.quickRow}><TextInput keyboardType="decimal-pad" value={draft.min_price} onChangeText={text => setDraft(current => ({ ...current, min_price: text.replace(/[^0-9.,]/g, '') }))} placeholder={l.min} placeholderTextColor={theme.textMuted} style={[styles.input, { flex: 1 }]} /><TextInput keyboardType="decimal-pad" value={draft.max_price} onChangeText={text => setDraft(current => ({ ...current, max_price: text.replace(/[^0-9.,]/g, '') }))} placeholder={l.max} placeholderTextColor={theme.textMuted} style={[styles.input, { flex: 1 }]} /></View>{[['newest', l.newest], ['price_asc', l.asc], ['price_desc', l.desc]].map(([value, label]) => <TouchableOpacity key={value} disabled={value !== 'newest' && !draft.currency} style={styles.option} onPress={() => setDraft(current => ({ ...current, sort: value }))}><Text style={[styles.optionText, value !== 'newest' && !draft.currency && { opacity: 0.45 }]}>{label}</Text><Text style={styles.optionText}>{draft.sort === value ? '✓' : ''}</Text></TouchableOpacity>)}</View> : null}
        </ScrollView>
        <View style={styles.actions}><TouchableOpacity onPress={resetFilters}><Text style={styles.link}>{l.reset}</Text></TouchableOpacity><TouchableOpacity onPress={() => setModal(null)}><Text style={styles.link}>{l.cancel}</Text></TouchableOpacity><TouchableOpacity style={styles.primary} onPress={applyFilters} testID="external-feed-apply-filters"><Text style={styles.primaryText}>{l.apply}</Text></TouchableOpacity></View>
      </Pressable></Pressable>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

function formatNumber(value) { return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(value)); }
function formatDate(value, lang) { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(({ RU: 'ru-RU', KK: 'kk-KZ', ZH: 'zh-CN', EN: 'en-GB' })[lang] || 'en-GB', { dateStyle: 'medium' }).format(date); }

function makeStyles(theme, sp) {
  return StyleSheet.create({
    cardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, routeFlex: { flex: 1 }, saveSlot: { alignItems: 'center', gap: 4 }, savedHeader: { minHeight: 44, maxWidth: '43%', flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 6 },
    safe: { flex: 1, backgroundColor: theme.bg }, header: { minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }, back: { width: 42, height: 44, alignItems: 'flex-start', justifyContent: 'center' }, title: { flex: 1, color: theme.text, fontSize: sp(18), fontWeight: '700' }, headerSpacer: { width: 10 },
    filters: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }, filterContent: { paddingHorizontal: 10, alignItems: 'center', gap: 7 }, filterButton: { minHeight: 36, maxWidth: 240, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }, filterActive: { borderColor: '#168759', backgroundColor: theme.surface }, filterText: { color: theme.text, fontSize: sp(13), flexShrink: 1, flexWrap: 'wrap' }, filterTextActive: { color: '#168759', fontWeight: '600' },
    list: { padding: 12, paddingBottom: 22 }, listEmpty: { flexGrow: 1, justifyContent: 'center', padding: 20 }, card: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 15, marginBottom: 11, gap: 7 }, route: { fontSize: sp(17), lineHeight: sp(24), fontWeight: '700', color: theme.text }, strong: { color: theme.text, fontSize: sp(15), fontWeight: '600' }, meta: { color: theme.textMuted, fontSize: sp(14), lineHeight: sp(20) }, price: { color: '#168759', fontSize: sp(16), fontWeight: '700' }, contact: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, contactText: { color: theme.text, fontSize: sp(14), flex: 1 }, date: { color: theme.textMuted, fontSize: sp(12) }, details: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border, marginTop: 5, paddingTop: 10, gap: 8 }, original: { color: theme.text, fontSize: sp(14), lineHeight: sp(21) }, textAction: { alignSelf: 'flex-start', paddingVertical: 4 }, link: { color: '#168759', fontSize: sp(14), fontWeight: '600' },
    warning: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.surface }, warningText: { color: theme.textMuted, fontSize: sp(12) }, center: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 14 }, message: { color: theme.textMuted, textAlign: 'center', fontSize: sp(15), lineHeight: sp(22) }, primary: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#168759', justifyContent: 'center', alignItems: 'center' }, primaryText: { color: '#fff', fontSize: sp(14), fontWeight: '700' },
    keyboardAvoiding: { flex: 1 }, scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.42)' }, sheet: { maxHeight: '84%', backgroundColor: theme.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 18, gap: 12 }, sheetScroll: { flexShrink: 1 }, sheetContent: { gap: 12 }, sheetTitle: { color: theme.text, fontSize: sp(18), fontWeight: '700', marginBottom: 4 }, hint: { color: theme.textMuted, fontSize: sp(13), marginVertical: 5 }, option: { minHeight: 45, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, optionText: { color: theme.text, fontSize: sp(15) }, input: { minHeight: 46, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, color: theme.text, fontSize: sp(15), backgroundColor: theme.bg }, quickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9, marginVertical: 5 }, currencyChip: { borderWidth: 1, borderColor: theme.border, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 12 }, currencySelected: { borderColor: '#168759', backgroundColor: theme.bg }, actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  });
}
