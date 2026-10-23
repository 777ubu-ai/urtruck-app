import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, FlatList, Linking, Modal, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { useV1Colors } from '../theme/designV1';
import * as Clipboard from 'expo-clipboard';
import DatePicker from '../components/externalFreight/ExternalFeedDatePicker';
import BookmarkButton from '../components/ui/v1/BookmarkButton';
import PrimaryButton from '../components/ui/v1/PrimaryButton';
import SecondaryButton from '../components/ui/actions/SecondaryButton';
import ExternalFeedDescription from '../components/externalFreight/ExternalFeedDescription';
import ShareModal from '../components/ShareModal';
import { PUBLIC_WEB_ORIGIN } from '../config/env';
import { buildExternalFreightShare } from '../utils/externalFreightShare';
// Направления внешней ленты вводятся текстом; общий городской picker не подключаем.
import { useToast } from '../components/Toast';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { sessionRole } from '../utils/externalFreightSession';
import { BODY_TYPES } from '../utils/truckConstants';
import { ALL_COUNTRIES, getCountryName } from '../utils/countries';
import { externalFreightAPI } from '../utils/externalFreightFeed';
import { externalTelegramPost, mergeLiveFeed, appendUnique, buildExternalFeedQuery, externalLocationTextSelection, feedKindForRole, isValidPublicationRange } from '../utils/externalFreightModel';

const COPY = {
  RU: { newListings: 'Новые объявления', mixedCurrency: 'Сортировка по цене доступна, когда в выдаче одна валюта. Сейчас показаны новые объявления.', priceUnavailable: 'В отфильтрованных объявлениях нет цен для сортировки. Сейчас показаны новые объявления.', telegram: 'Объявление в Telegram', direction: 'Направление в тексте объявления', cargoTitle: 'Лента грузов', vehicleTitle: 'Лента машин', from: 'Откуда', to: 'Куда', body: 'Кузов', date: 'Дата', price: 'Цена', empty: 'Объявлений пока нет', none: 'По фильтрам ничего не найдено', network: 'Нет соединения. Уже загруженные объявления сохранены.', server: 'Сервис ленты временно недоступен.', retry: 'Повторить', more: 'Показать полностью', less: 'Свернуть', copied: 'Контакт скопирован', today: 'Сегодня', yesterday: 'Вчера', apply: 'Найти', choose: 'Выбрать из списка', reset: 'Сброс', cancel: 'Отмена', negotiable: 'Договорная', unknown: 'Цена не указана', loading: 'Загрузка…', published: 'Опубликовано', weightUnit: 'т', volumeUnit: 'м³', dateFrom: 'С', dateTo: 'По', newest: 'Новые', asc: '↓ Дешевле', desc: '↑ Дороже', retryPage: 'Не удалось загрузить следующую страницу', invalidDate: 'Начало периода не может быть позже окончания.' },
  KK: { newListings: 'Жаңа хабарландырулар', mixedCurrency: 'Баға бойынша сұрыптау тек тізімде бір валюта болғанда қолжетімді. Қазір жаңалары көрсетілді.', priceUnavailable: 'Сүзілген хабарландыруларда сұрыптауға арналған баға жоқ. Қазір жаңалары көрсетілді.', telegram: 'Telegram хабарландыруы', direction: 'Бағыт хабарландыру мәтінінде', cargoTitle: 'Жүк лентасы', vehicleTitle: 'Көлік лентасы', from: 'Қайдан', to: 'Қайда', body: 'Шанақ', date: 'Күні', price: 'Бағасы', empty: 'Әзірге хабарландыру жоқ', none: 'Сүзгі бойынша нәтиже жоқ', network: 'Желі жоқ. Жүктелген хабарландырулар сақталды.', server: 'Лента қызметі уақытша қолжетімсіз.', retry: 'Қайталау', more: 'Тағы', less: 'Жию', copied: 'Байланыс көшірілді', today: 'Бүгін', yesterday: 'Кеше', apply: 'Қолдану', choose: 'Тізімнен таңдау', reset: 'Тазарту', cancel: 'Бас тарту', negotiable: 'Келісімді', unknown: 'Бағасы көрсетілмеген', loading: 'Жүктелуде…', published: 'Жарияланған', weightUnit: 'т', volumeUnit: 'м³', dateFrom: 'Бастап', dateTo: 'Дейін', newest: 'Жаңалары', asc: '↓ Арзанырақ', desc: '↑ Қымбатырақ', retryPage: 'Келесі бетті жүктеу мүмкін болмады', invalidDate: 'Жарияланым күндерінің аралығын тексеріңіз.' },
  ZH: { newListings: '新信息', mixedCurrency: '仅当结果中只有一种货币时才能按价格排序。当前显示最新信息。', priceUnavailable: '筛选结果中没有可排序的价格。当前显示最新信息。', telegram: 'Telegram原始信息', direction: '路线见原文', cargoTitle: '货源信息', vehicleTitle: '空车信息', from: '出发地', to: '目的地', body: '车厢类型', date: '日期', price: '价格', empty: '暂无公告', none: '没有符合筛选条件的结果', network: '网络不可用，已加载的信息已保留。', server: '信息服务暂时不可用。', retry: '重试', more: '更多', less: '收起', copied: '联系方式已复制', today: '今天', yesterday: '昨天', apply: '应用', choose: '从列表选择', reset: '重置', cancel: '取消', negotiable: '价格面议', unknown: '未提供价格', loading: '加载中…', published: '发布时间', weightUnit: '吨', volumeUnit: '立方米', dateFrom: '开始', dateTo: '结束', newest: '最新', asc: '↓ 更便宜', desc: '↑ 更贵', retryPage: '无法加载下一页', invalidDate: '请检查发布日期范围。' },
  EN: { newListings: 'New listings', mixedCurrency: 'Price sorting is available when results use one currency. Showing newest listings.', priceUnavailable: 'The filtered listings have no prices to sort. Showing newest listings.', telegram: 'Listing on Telegram', direction: 'See original text for direction', cargoTitle: 'Cargo feed', vehicleTitle: 'Available trucks', from: 'From', to: 'To', body: 'Body', date: 'Date', price: 'Price', empty: 'No listings yet', none: 'No results for these filters', network: 'No connection. Loaded listings are kept.', server: 'The feed service is temporarily unavailable.', retry: 'Retry', more: 'Show full text', less: 'Collapse', copied: 'Contact copied', today: 'Today', yesterday: 'Yesterday', apply: 'Apply', choose: 'Choose from list', reset: 'Reset', cancel: 'Cancel', negotiable: 'Negotiable', unknown: 'Price not provided', loading: 'Loading…', published: 'Published', weightUnit: 't', volumeUnit: 'm³', dateFrom: 'From', dateTo: 'To', newest: 'Newest', asc: '↓ Cheaper', desc: '↑ Higher', retryPage: 'Could not load the next page', invalidDate: 'Check the publication date range.' },
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
export default function ExternalFreightFeedScreen({ navigation }) {
  const { session } = useAuth();
  const role = sessionRole(session) || 'guest';
  const isDriver = role === 'driver';
  const kind = feedKindForRole(role);
  const { lang, sp, t } = useI18n();
  const { theme } = useTheme();
  const bookmarkColors = useV1Colors();
  const { toast } = useToast();
  const l = COPY[lang] || COPY.EN;
  const sl = SAVED_COPY[lang] || SAVED_COPY.EN;
  const [savedOnly, setSavedOnly] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [saving, setSaving] = useState({});
  const bookmarkRequestsRef = useRef(new Map());
  const ownerKey = `${session?.user?.id || ''}:${role}`;
  const ownerRef = useRef(ownerKey);
  ownerRef.current = ownerKey;
  const emptyFilters = { origin: '', destination: '', origin_country: '', destination_country: '', body_type: '', published_from: '', published_to: '', sort: 'newest' };
  const [filters, setFilters] = useState(emptyFilters);
  const [draft, setDraft] = useState(filters);
  const timeline = filters.sort === 'newest';
  const webTimeline = Platform.OS === 'web' && timeline;
  const [unseenIds, setUnseenIds] = useState([]);
  const followingRef = useRef(true);
  const followUpdateRef = useRef(false);
  const [modal, setModal] = useState(null);
  const isLocationModal = modal === 'origin' || modal === 'destination';
  const [rows, setRows] = useState([]);
  const [rowsOwner, setRowsOwner] = useState(ownerKey);
  const visibleRows = rowsOwner === ownerKey ? rows : [];
  const [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const requestRef = useRef(null);
  const busyRef = useRef(false);
  const listRef = useRef(null);
  const viewportRef = useRef({ offset: 0, height: 0, contentHeight: 0 });
  const scrollToLatestRef = useRef(false);
  const anchorRef = useRef(null);
  const cardRefs = useRef(new Map());
  const visibleAnchorRef = useRef(null);
  const viewabilityRef = useRef(({ viewableItems }) => { visibleAnchorRef.current = viewableItems[0]?.key || null; });
  const sequenceRef = useRef(0);
  const blurredRef = useRef(false);
  const loadRef = useRef(null);
  const styles = useMemo(() => makeStyles(theme, sp), [theme, lang]);
  const title = isDriver ? l.cargoTitle : l.vehicleTitle;

  const load = useCallback(async ({ reset = false, background = false, signal: suppliedSignal } = {}) => {
    if (busyRef.current && (background || !reset)) return;
    if (reset) {
      requestRef.current?.abort?.();
      sequenceRef.current += 1;
    }
    const sequence = sequenceRef.current;
    const controller = suppliedSignal ? null : new AbortController();
    if (controller) requestRef.current = controller;
    const signal = suppliedSignal || controller?.signal;
    busyRef.current = true;
    if (!background) setBusy(true);
    const owner = ownerKey;
    const raw = { ...buildExternalFeedQuery(filters, { cursor, limit: 30, reset }), saved_only: savedOnly };
    let result = await externalFreightAPI.list(raw, signal).catch(() => ({ ok: false, error: 'network_error' }));
    // Сохранённые могут содержать закрытые/скрытые карточки без даты.
    // Освежаем только уже загруженные страницы атомарно, включая их cursor.
    if (background && savedOnly && result.ok) {
      const refreshed = [...(result.items || [])];
      let next = result.next_cursor;
      const pages = Math.max(1, Math.ceil(rows.length / 30));
      for (let page = 1; page < pages && next; page += 1) {
        if (sequence !== sequenceRef.current || signal?.aborted || owner !== ownerRef.current) return;
        const older = await externalFreightAPI.list({ ...raw, cursor: next }, signal).catch(() => ({ ok: false, error: 'network_error' }));
        if (!older.ok) { result = older; break; }
        refreshed.push(...(older.items || []));
        next = older.next_cursor;
      }
      if (result.ok) result = { ...result, items: appendUnique([], refreshed), next_cursor: next };
    }
    if (sequence !== sequenceRef.current || signal?.aborted || owner !== ownerRef.current) return;
    if (!result.ok) {
      setError(result.error || 'server_error');
      busyRef.current = false; setBusy(false); setRefreshing(false);
      return;
    }
    setError(null);
    const incoming = Array.isArray(result.items) ? result.items : [];
    if (result.sort_error && filters.sort !== 'newest') {
      setFilters(current => ({ ...current, sort: 'newest' }));
      setDraft(current => ({ ...current, sort: 'newest' }));
      toast(result.sort_error === 'mixed_currency' ? l.mixedCurrency : l.priceUnavailable, 'error');
    }
    setRowsOwner(owner);
    anchorRef.current = null;
    if (background && Platform.OS === 'web' && (!timeline || !followingRef.current) && viewportRef.current.offset > 16) {
      const node = cardRefs.current.get(visibleAnchorRef.current);
      if (node?.measureInWindow) {
        const measured = await new Promise(resolve => {
          const timeout = setTimeout(() => resolve(null), 100);
          node.measureInWindow((_x, y) => { clearTimeout(timeout); resolve({ node, y }); });
        });
        if (sequence !== sequenceRef.current || signal?.aborted || owner !== ownerRef.current) return;
        anchorRef.current = measured;
        if (measured) setTimeout(() => { if (anchorRef.current === measured) anchorRef.current = null; }, 250);
      }
    }
    if (background && timeline) {
      const known = new Set(rows.map(item => String(item.id)));
      const active = mergeLiveFeed(rows, incoming, { sort: filters.sort, hasMore: !!result.next_cursor, savedOnly });
      const activeIds = new Set(active.map(item => String(item.id)));
      const added = incoming.filter(item => !known.has(String(item.id)) && activeIds.has(String(item.id)));
      if (followingRef.current) {
        followUpdateRef.current = added.length > 0;
        scrollToLatestRef.current = Platform.OS === 'web' && added.length > 0;
        setUnseenIds([]);
      } else {
        setUnseenIds(current => [...new Set([...current, ...added.map(item => String(item.id))])].filter(id => activeIds.has(id)));
      }
    }
    if (reset && !background && timeline && Platform.OS === 'web' && !savedOnly) scrollToLatestRef.current = true;
    setRows(current => background ? mergeLiveFeed(current, incoming, { sort: filters.sort, hasMore: !!result.next_cursor, savedOnly }) : reset ? incoming : appendUnique(current, incoming));
    if (!background || savedOnly || rows.length <= 30 || filters.sort !== 'newest') setCursor(result.next_cursor || null);
    busyRef.current = false; setBusy(false); setRefreshing(false);
  }, [filters, cursor, savedOnly, ownerKey, rows, timeline]);
  loadRef.current = load;

  useEffect(() => { setUnseenIds([]); followingRef.current = true; followUpdateRef.current = false; viewportRef.current.offset = 0; setRows([]); setCursor(null); load({ reset: true }); return () => requestRef.current?.abort?.(); }, [filters, savedOnly, ownerKey]);
  useEffect(() => {
    setSaving({});
    setShareTarget(null);
    return () => {
      bookmarkRequestsRef.current.forEach(controller => controller.abort());
      bookmarkRequestsRef.current.clear();
    };
  }, [ownerKey]);
  useEffect(() => { externalFreightAPI.event('feed_open'); }, []);
  useEffect(() => {
    const cancel = () => {
      setShareTarget(null);
      sequenceRef.current += 1;
      anchorRef.current = null;
      requestRef.current?.abort?.();
      requestRef.current = null;
      bookmarkRequestsRef.current.forEach(controller => controller.abort());
      bookmarkRequestsRef.current.clear();
      setSaving({});
      busyRef.current = false;
      setBusy(false);
      setRefreshing(false);
    };
    const blur = navigation.addListener('blur', () => { blurredRef.current = true; cancel(); });
    const focus = navigation.addListener('focus', () => {
      if (blurredRef.current) { blurredRef.current = false; loadRef.current?.({ reset: true, background: true }); }
    });
    const app = AppState.addEventListener('change', state => {
      if (state !== 'active') cancel();
      else if (!blurredRef.current && navigation.isFocused?.()) loadRef.current?.({ reset: true, background: true });
    });
    return () => { blur(); focus(); app?.remove?.(); cancel(); };
  }, [navigation]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && !blurredRef.current
          && navigation.isFocused?.() && !busyRef.current && !modal
          && bookmarkRequestsRef.current.size === 0) {
        loadRef.current?.({ reset: true, background: true });
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [navigation, modal]);

  const applyFilters = () => {
    const next = isLocationModal
      ? { ...draft, ...externalLocationTextSelection(modal, draft[modal] || getCountryName(draft[`${modal}_country`], lang) || '', ALL_COUNTRIES) }
      : { ...draft };
    if (!isValidPublicationRange(next)) {
      Alert.alert(l.date, l.invalidDate);
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
  const locationLabel = key => filters[key]
    ? `${filters[key]}${filters[`${key}_country`] ? `, ${filters[`${key}_country`]}` : ''}`
    : filters[`${key}_country`] ? getCountryName(filters[`${key}_country`], lang) : '';
  const filterButton = (name, label, value) => (
    <TouchableOpacity key={name} style={[styles.filterButton, value ? styles.filterActive : null]} onPress={() => { setDraft(filters); setModal(name); }} accessibilityRole="button" accessibilityLabel={label} testID={`external-feed-filter-${name}`}>
      <Text style={[styles.filterText, value ? styles.filterTextActive : null]}>{label}{value ? ` · ${value}` : ''}</Text><Feather name="chevron-down" size={13} color={value ? '#168759' : theme.textMuted} />
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => {
    const locations = item.kind === 'cargo' ? [item.origin, item.destination] : [item.origin, item.destination];
    const price = item.price_state === 'negotiable' ? l.negotiable : item.price_state === 'known' ? `${formatNumber(item.amount)} ${item.currency}` : l.unknown;
    const summary = [
      ...(item.body_types || []).map(x => bodyLabels[lang]?.[x] || x),
      item.weight != null ? `${formatNumber(item.weight)} ${l.weightUnit}` : '',
      item.volume != null ? `${formatNumber(item.volume)} ${l.volumeUnit}` : '',
      item.vehicle_count != null ? vehicleCountLabel(item.vehicle_count, lang, isDriver) : '',
    ].filter(Boolean).join(' · ');
    const share = buildExternalFreightShare(item, { origin: PUBLIC_WEB_ORIGIN, lang, summary, price });
    return <View ref={node => { if (node) cardRefs.current.set(String(item.id), node); else cardRefs.current.delete(String(item.id)); }} style={styles.card} testID={`external-feed-card-${item.id}`}>
      <View style={styles.cardHeading}>
        <Text style={[styles.route, styles.routeFlex]}>{item.status === 'unavailable' ? sl.unavailable : locations.filter(Boolean).join(' → ') || l.direction}</Text>
        <View style={styles.saveSlot}>
          <BookmarkButton saved={item.saved} onPress={() => toggleBookmark(item)} accessibilityLabel={item.saved ? sl.unsave : sl.save} testID={`external-feed-bookmark-${item.id}`} />
          {saving[item.id] ? <ActivityIndicator size="small" color="#168759" /> : null}
        </View>
      </View>
      {['expired', 'closed'].includes(item.status) ? <Text style={styles.meta}>{sl[item.status]}</Text> : null}
      {item.kind === 'cargo' && item.cargo_name ? <Text style={styles.strong}>{item.cargo_name}</Text> : null}
      <Text style={styles.meta} testID={`external-feed-summary-${item.id}`}>{summary}</Text>
      {item.loading_date || item.ready_text ? <Text style={styles.meta}>{item.loading_date || item.ready_text}</Text> : null}
      {item.status !== 'unavailable' ? <Text style={styles.price}>{price}</Text> : null}
      {Array.isArray(item.contacts) && item.contacts.filter(Boolean).map((contact, index) => <TouchableOpacity key={`${item.id}-contact-${index}`} onPress={() => copyContact(contact)} style={styles.contact} accessibilityRole="button" testID={`external-feed-copy-${item.id}-${index}`}><Text style={styles.contactText}>{contact}</Text><Feather name="copy" size={14} color={'#168759'} /></TouchableOpacity>)}
      {externalTelegramPost(item) ? <TouchableOpacity style={styles.sourceLink} accessibilityRole="link" testID={`external-feed-source-${item.id}`} onPress={() => Linking.openURL(externalTelegramPost(item)).catch(() => toast(l.retry, 'error'))}><Text style={styles.sourceText}>{l.telegram}</Text></TouchableOpacity> : null}
      <Text style={styles.date}>{l.published}: {formatDate(item.source_published_at, lang)}</Text>
      {item.status !== 'unavailable' && (item.original_text || (item.ready_text && item.loading_date) || share) ? <ExternalFeedDescription
        key={`${ownerKey}:${item.id}`} text={item.original_text} styles={styles}
        moreLabel={l.more} lessLabel={l.less} itemId={item.id}
        onExpand={() => { followingRef.current = false; externalFreightAPI.event('card_expand'); }}
        actions={share ? <TouchableOpacity style={styles.textAction} accessibilityRole="button" accessibilityLabel={t('share')}
          testID={`external-feed-share-${item.id}`} onPress={() => setShareTarget({ ...share, owner: ownerKey })}>
          <Feather name="share-2" size={14} color="#168759" /><Text style={[styles.link, styles.actionLabel]}>{t('share')}</Text>
        </TouchableOpacity> : null}
      >{item.ready_text && item.loading_date ? <Text style={styles.meta}>{item.ready_text}</Text> : null}</ExternalFeedDescription> : null}
    </View>;
  };

  const priceModal = modal === 'price';
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="external-freight-feed-screen">
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={l.cancel} testID="external-feed-back"><Feather name="arrow-left" size={23} color={theme.text} /></TouchableOpacity>
      <Text style={styles.title} testID="external-feed-title">{savedOnly ? `${title} · ${sl.saved}` : title}</Text>
      <TouchableOpacity style={styles.savedHeader} onPress={() => setSavedOnly(current => !current)} accessibilityRole="button" accessibilityLabel={sl.saved} accessibilityState={{ selected: savedOnly }} aria-pressed={savedOnly} testID="external-feed-saved-only">
        {savedOnly ? <FontAwesome5 name="bookmark" size={18} color={bookmarkColors.driver} solid /> : <Feather name="bookmark" size={20} color={bookmarkColors.textMuted} />}
      </TouchableOpacity>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filterContent} keyboardShouldPersistTaps="handled">
      {filterButton('origin', l.from, locationLabel('origin'))}{filterButton('destination', l.to, locationLabel('destination'))}{filterButton('body', l.body, filters.body_type ? bodyLabels[lang]?.[filters.body_type] || filters.body_type : '')}{filterButton('date', l.date, filters.published_from ? `${formatDate(filters.published_from, lang)}${filters.published_to ? ` – ${formatDate(filters.published_to, lang)}` : ''}` : '')}{filterButton('price', l.price, filters.sort === 'newest' ? '' : (filters.sort === 'price_asc' ? l.asc : l.desc))}
    </ScrollView>
    {error && rows.length ? <TouchableOpacity style={styles.warning} onPress={() => load({ reset: true })}><Text style={styles.warningText}>{error === 'network_error' ? l.network : l.server} {l.retry}</Text></TouchableOpacity> : null}
    {error && !rows.length ? <View style={styles.center}><Text style={styles.message}>{error === 'network_error' ? l.network : l.server}</Text><PrimaryButton label={l.retry} onPress={() => load({ reset: true })} style={styles.retryButton} /></View> : null}
    {!error || rows.length ? <FlatList key={`${ownerKey}:${savedOnly}:${JSON.stringify(filters)}`} ref={listRef} inverted={timeline && Platform.OS !== 'web'} onViewableItemsChanged={viewabilityRef.current} maintainVisibleContentPosition={Platform.OS === 'web' ? undefined : { minIndexForVisible: 0 }}
      onScroll={event => {
        const offset = Math.max(0, event.nativeEvent.contentOffset.y);
        const { contentSize, layoutMeasurement } = event.nativeEvent;
        viewportRef.current.height = layoutMeasurement.height;
        viewportRef.current.contentHeight = contentSize.height;
        const atLatestEdge = webTimeline
          ? Math.max(0, contentSize.height - layoutMeasurement.height - offset) < 48
          : offset < 48;
        viewportRef.current.offset = offset;
        followingRef.current = atLatestEdge;
        if (timeline && atLatestEdge) setUnseenIds(current => current.length ? [] : current);
        if (webTimeline && offset < 48 && cursor && !busy) load();
      }} scrollEventThrottle={16}
      onContentSizeChange={(_width, height) => {
        const anchor = anchorRef.current;
        viewportRef.current.contentHeight = height;
        if (timeline && followingRef.current && (followUpdateRef.current || scrollToLatestRef.current)) {
          followUpdateRef.current = false;
          scrollToLatestRef.current = false;
          if (webTimeline) listRef.current?.scrollToOffset({ offset: Math.max(0, height - viewportRef.current.height), animated: true });
          else listRef.current?.scrollToOffset({ offset: 0, animated: true });
        }
        if (anchor) anchor.node.measureInWindow((_x, y) => {
          if (anchorRef.current !== anchor || !Number.isFinite(y)) return;
          const delta = y - anchor.y;
          if (Math.abs(delta) > 1) listRef.current?.scrollToOffset({ offset: Math.max(0, viewportRef.current.offset + (timeline ? -delta : delta)), animated: false });
        });
      }} data={webTimeline ? [...visibleRows].reverse() : visibleRows} renderItem={renderItem} keyExtractor={item => String(item.id)} contentContainerStyle={rows.length ? styles.list : styles.listEmpty} onRefresh={() => { setRefreshing(true); load({ reset: true }); }} refreshing={refreshing} onEndReached={() => { if (!webTimeline && !busy && cursor) load(); }} onEndReachedThreshold={0.45} ListEmptyComponent={busy ? <ActivityIndicator color={'#168759'} style={{ marginTop: 40 }} /> : <Text style={styles.message}>{filters.origin || filters.destination || filters.body_type || filters.published_from ? l.none : l.empty}</Text>} ListFooterComponent={busy && rows.length ? <ActivityIndicator color={'#168759'} style={{ marginVertical: 14 }} /> : null} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} removeClippedSubviews /> : null}
    {timeline && unseenIds.length > 0 ? <TouchableOpacity style={styles.newListings} accessibilityRole="button" testID="external-feed-new-listings"
      onPress={() => { followingRef.current = true; setUnseenIds([]); if (webTimeline) listRef.current?.scrollToOffset({ offset: Math.max(0, viewportRef.current.contentHeight - viewportRef.current.height), animated: true }); else listRef.current?.scrollToOffset({ offset: 0, animated: true }); }}>
      <Feather name="arrow-down" size={16} color={theme.text} /><Text style={styles.newListingsText}>{l.newListings} · {unseenIds.length}</Text>
    </TouchableOpacity> : null}
    {shareTarget?.owner === ownerKey ? <ShareModal visible onClose={() => setShareTarget(null)}
      shareText={shareTarget.text} url={shareTarget.url} /> : null}
    {/* Текстовый поиск не монтирует общий справочник стран/городов. */}
    <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
    <View style={styles.modalOverlay} testID="external-feed-filter-overlay">
      <Pressable style={styles.scrim} onPress={() => setModal(null)} />
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} pointerEvents="box-none">
      <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
        <Text style={styles.sheetTitle}>{modal === 'origin' ? l.from : modal === 'destination' ? l.to : modal === 'body' ? l.body : modal === 'date' ? l.date : l.price}</Text>
        <View style={styles.actions}>
          <SecondaryButton label={l.reset} onPress={resetFilters} role={role} numberOfLines={null} style={styles.filterAction} />
          <SecondaryButton label={l.cancel} onPress={() => setModal(null)} role={role} numberOfLines={null} style={styles.filterAction} />
          <SecondaryButton label={l.apply} onPress={applyFilters} role={role} numberOfLines={null} testID="external-feed-apply-filters" style={styles.filterAction} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
        {isLocationModal ? <TextInput value={draft[modal] || (draft[`${modal}_country`] ? getCountryName(draft[`${modal}_country`], lang) : '')} onChangeText={text => setDraft(current => ({ ...current, [modal]: text, [`${modal}_country`]: '' }))} placeholder={modal === 'origin' ? l.from : l.to} placeholderTextColor={theme.textMuted} style={styles.input} maxLength={120} autoFocus autoCorrect={false} autoCapitalize="words" returnKeyType="search" onSubmitEditing={applyFilters} testID="external-feed-location-search" accessibilityLabel={modal === 'origin' ? l.from : l.to} /> : null}
        {modal === 'body' ? <ScrollView style={{ maxHeight: 310 }}>{BODY_TYPES.map(body => <TouchableOpacity key={body} style={styles.option} onPress={() => setDraft(current => ({ ...current, body_type: current.body_type === body ? '' : body }))}><Text style={styles.optionText}>{bodyLabels[lang]?.[body] || body}</Text><Text style={styles.optionText}>{draft.body_type === body ? '✓' : ''}</Text></TouchableOpacity>)}</ScrollView> : null}
        {modal === 'date' ? <View><View style={styles.quickRow}><TouchableOpacity onPress={() => choosePresetDate(0)}><Text style={styles.link}>{l.today}</Text></TouchableOpacity><TouchableOpacity onPress={() => choosePresetDate(1)}><Text style={styles.link}>{l.yesterday}</Text></TouchableOpacity></View><Text style={styles.hint}>{l.dateFrom}</Text><DatePicker value={draft.published_from} onChange={value => setDraft(current => ({ ...current, published_from: value }))} allowPast /><Text style={styles.hint}>{l.dateTo}</Text><DatePicker value={draft.published_to} onChange={value => setDraft(current => ({ ...current, published_to: value }))} allowPast /></View> : null}
        {priceModal ? <View testID="external-feed-price-options">{[['newest', l.newest], ['price_asc', l.asc], ['price_desc', l.desc]].map(([value, label]) => <TouchableOpacity key={value} style={styles.option} onPress={() => setDraft(current => ({ ...current, sort: value }))}><Text style={styles.optionText}>{label}</Text><Text style={styles.optionText}>{draft.sort === value ? '✓' : ''}</Text></TouchableOpacity>)}</View> : null}
        </ScrollView>
      </Pressable>
      </KeyboardAvoidingView>
    </View>
    </Modal>
  </SafeAreaView>;
}

function vehicleCountLabel(value, lang, needed) {
  if (lang === 'RU') {
    const n = Math.abs(Number(value)), last = n % 10, teen = n % 100;
    const noun = last === 1 && teen !== 11 ? 'машина' : last >= 2 && last <= 4 && (teen < 12 || teen > 14) ? 'машины' : 'машин';
    return `${value} ${noun}`;
  }
  return `${value} ${needed ? ({ KK: 'көлік қажет', ZH: '需要车辆', EN: 'trucks needed' }[lang] || 'trucks needed') : ({ KK: 'бос көлік', ZH: '有空车', EN: 'trucks available' }[lang] || 'trucks available')}`;
}

function formatNumber(value) { return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(value)); }
function formatDate(value, lang) { if (!value) return ''; const dmy = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value); const date = dmy ? new Date(+dmy[3], +dmy[2] - 1, +dmy[1]) : new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(({ RU: 'ru-RU', KK: 'kk-KZ', ZH: 'zh-CN', EN: 'en-GB' })[lang] || 'en-GB', { dateStyle: 'medium' }).format(date); }

function makeStyles(theme, sp) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    header: { flexShrink: 0, minHeight: 52, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    back: { width: 36, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center', flexShrink: 0 },
    title: { flex: 1, minWidth: 0, color: theme.text, fontSize: sp(18), lineHeight: sp(23), fontWeight: '700' },
    savedHeader: { width: 44, minHeight: 44, borderWidth: 1, borderColor: theme.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    filters: { flexGrow: 0, flexShrink: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    filterContent: { paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', gap: 7 },
    filterButton: { minHeight: 40, maxWidth: 240, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
    filterActive: { borderColor: '#168759', backgroundColor: theme.surface },
    filterText: { color: theme.text, fontSize: sp(13), flexShrink: 1, minWidth: 0, flexWrap: 'wrap' },
    filterTextActive: { color: '#168759', fontWeight: '600' },
    list: { paddingHorizontal: 12, paddingTop: 7, paddingBottom: 22 }, listEmpty: { flexGrow: 1, justifyContent: 'center', padding: 20 },
    // Геометрия существующей MarketplaceCard; высота растёт вместе с содержимым и системным шрифтом.
    card: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 7, gap: 3, minWidth: 0 },
    cardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, minWidth: 0 }, routeFlex: { flex: 1, minWidth: 0 }, saveSlot: { alignItems: 'center', gap: 4, flexShrink: 0 },
    route: { fontSize: sp(15), lineHeight: sp(19), fontWeight: '700', color: theme.text },
    strong: { color: theme.text, fontSize: sp(13), lineHeight: sp(18), fontWeight: '600', minWidth: 0, flexShrink: 1 },
    meta: { color: theme.textMuted, fontSize: sp(12), lineHeight: sp(17), minWidth: 0, flexShrink: 1 },
    price: { color: '#168759', fontSize: sp(16), lineHeight: sp(21), fontWeight: '700', minWidth: 0, flexShrink: 1 },
    contact: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 },
    contactText: { color: theme.text, fontSize: sp(13), lineHeight: sp(18), flex: 1, minWidth: 0, flexShrink: 1 },
    // Ссылка находится в колонке: не наследуем flex контактной строки и защищаем высоту при перерасчёте.
    sourceLink: { minHeight: sp(18), flexShrink: 0 },
    sourceText: { color: theme.text, fontSize: sp(13), lineHeight: sp(18), minWidth: 0, flexShrink: 0 },
    date: { color: theme.textMuted, fontSize: sp(11), lineHeight: sp(16), minWidth: 0, flexShrink: 1 },
    details: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border, marginTop: 3, paddingTop: 6, minWidth: 0 },
    descriptionBox: { minWidth: 0 },
    original: { color: theme.text, fontSize: sp(13), lineHeight: sp(18), minWidth: 0, flexShrink: 1 },
    actionLabel: { fontSize: sp(12), lineHeight: sp(17) },
    cardActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, minWidth: 0 },
    textAction: { alignSelf: 'flex-start', minHeight: 44, maxWidth: '100%', minWidth: 0, paddingVertical: 8, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center', borderWidth: 1, borderColor: '#168759', borderRadius: 14 },
    link: { color: '#168759', fontSize: sp(13), lineHeight: sp(18), fontWeight: '600', flexShrink: 1, minWidth: 0 },
    newListings: { position: 'absolute', bottom: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 22, borderWidth: 1, borderColor: '#168759', backgroundColor: theme.surface },
    newListingsText: { color: theme.text, fontSize: sp(13), fontWeight: '600' },
    warning: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.surface }, warningText: { color: theme.textMuted, fontSize: sp(12) },
    center: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 14 }, message: { color: theme.textMuted, textAlign: 'center', fontSize: sp(14), lineHeight: sp(20) },
    retryButton: { alignSelf: 'stretch' },
    modalOverlay: { flex: 1 }, keyboardAvoiding: { flex: 1, justifyContent: 'flex-end' }, scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.42)' },
    sheet: { maxHeight: '90%', backgroundColor: theme.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 14, paddingBottom: 14, gap: 8, minWidth: 0 },
    sheetScroll: { flexShrink: 1 }, sheetContent: { gap: 10, paddingBottom: 4 }, sheetTitle: { color: theme.text, fontSize: sp(18), lineHeight: sp(23), fontWeight: '700' },
    hint: { color: theme.textMuted, fontSize: sp(13), marginVertical: 5 }, option: { minHeight: 45, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    optionText: { color: theme.text, fontSize: sp(14), flexShrink: 1, minWidth: 0 },
    input: { minHeight: 46, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: theme.text, fontSize: sp(14), backgroundColor: theme.bg, minWidth: 0 },
    quickRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginVertical: 5 },
    actions: { flexDirection: 'row', alignItems: 'stretch', gap: 6, flexShrink: 0 },
    filterAction: { flexGrow: 1, flexShrink: 1, flexBasis: 0, alignSelf: 'stretch', width: 'auto', minWidth: 0, maxWidth: '100%', height: 'auto', minHeight: 48, paddingHorizontal: 0, paddingVertical: 8 },
  });
}
