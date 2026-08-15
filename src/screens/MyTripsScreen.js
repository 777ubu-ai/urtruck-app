import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, Platform, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { marketAPI } from '../utils/marketAPI';
import { regAPI } from '../utils/registration';
import { formatStatus, formatTruckType, formatBids } from '../utils/i18n';
import { formatDateForDisplay } from '../utils/dateInput';
import { formatPrice, normalizeTrip } from '../utils/normalizers';
import { localizePlace, localizeCargoName } from '../utils/places';
import EmptyState from '../components/ui/EmptyState';
import EditCargoModal from '../components/EditCargoModal';
import { colors, spacing, radius, typography } from '../theme/theme';
import {v1Colors, useV1Colors, v1AccentFor} from '../theme/designV1';
import { useMountedRef } from '../hooks/useMountedRef';
import FadeInUp from '../components/ui/FadeInUp';
import Feather from '@expo/vector-icons/Feather';
import { countryFlag } from '../utils/countryFlags';

export default function MyTripsScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  // v1 brand bar (mirrors FeedScreen)
  brandBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 30, fontWeight: '300' },
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  brandText: { color: v1.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  ftlPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  ftlText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  bellBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: v1.surface },
  bellIcon: { fontSize: 18 },
  menuBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // Дизайн 2026 v4 (03.08): заголовок 26→19px. Раньше «Мои грузы» занимал
  // визуально столько же, сколько сам список — user жаловался «как для слепого».
  titleBlock: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8 },
  titleHero: { color: v1.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
  titleSub: { color: v1.textMuted, fontSize: 12, marginTop: 1 },
  // Кнопка «Разместить рейс» (driver, §2.2.2). Текст чёрный — на изумруде
  // #168759 даёт AAA-контраст (источник истины — CLAUDE.md).
  // Дизайн 2026 v3 (03.08): outline вместо заливки — «+ Разместить груз» не
  // primary-CTA этой страницы (главное действие — тап по карточке груза).
  // Меньше 40px, тонкий контур, чтобы не «кричал» и не «для слепого».
  publishRouteBtn: { height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: 'transparent' },
  publishRouteText: { fontSize: 13, fontWeight: '700' },
  // Gate-модалка размещения рейса (progressive verification).
  pgBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  pgCard: { width: '100%', maxWidth: 420, backgroundColor: v1.surface, borderRadius: 20, padding: 24, alignItems: 'center' },
  pgIcon: { fontSize: 44, marginBottom: 12 },
  pgTitle: { color: v1.text, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  pgText: { color: v1.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 22 },
  pgBtn: { height: 52, borderRadius: 14, backgroundColor: '#168759', alignItems: 'center', justifyContent: 'center', width: '100%' },
  pgBtnText: { color: '#0C0A09', fontSize: 16, fontWeight: '800' },
  pgCancel: { marginTop: 10, paddingVertical: 8 },
  pgCancelText: { color: v1.textMuted, fontSize: 13, fontWeight: '600' },
  archiveToggle: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4, marginTop: 2 },
  archiveToggleText: { fontSize: 12, fontWeight: '700' },

  // Дизайн 2026 v4: плотный ленточный формат карточки груза/рейса.
  // Было: padding 16, margin 14, borderRadius 20, тень 16 — «карточки-кирпичи
  // на весь экран, помещается 1-2 груза». Стало: padding 12x14, margin 8,
  // borderRadius 10, лёгкая тень. Помещается в 2 раза больше.
  card: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  statusLabel: { fontSize: 11 },
  route: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  desc: { fontSize: 12, marginBottom: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  metaItem: { fontSize: 11 },
  metaDot: { color: '#94A3B8', fontSize: 10 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Цена: было 24pt жирный оранжевый — крик. Теперь 16pt, тёмный текст,
  // оранжевый ушёл в мелкий label «$» перед суммой.
  price: { fontSize: 16, fontWeight: '700', color: '#E06D00', fontVariant: ['tabular-nums'], flexShrink: 1 },
  bidsLabel: { ...typography.caption, flex: 1 },
  // Дизайн 2026 v3: плашка «N предложений» — outline вместо заливки,
  // компактнее (меньше 32px), шрифт 12. Не «кричит».
  offersCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: '#FF8400', backgroundColor: 'transparent' },
  offersCtaText: { color: '#E06D00', fontSize: 12, fontWeight: '700', flex: 1 },
  offersCtaArrow: { color: '#E06D00', fontSize: 14, fontWeight: '700' },

  // 27.07: кнопки действий сделки вылезали за карточку. Делаем их гибкими
  // (flexGrow/Shrink + minWidth) — в ряду с flexWrap они заполняют ширину и
  // аккуратно переносятся на след. строку, не вылезая за края.
  acceptBtn: { backgroundColor: '#168759', borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexGrow: 1, flexShrink: 1, minWidth: 130, maxWidth: '100%' },
  acceptBtnText: { color: '#FFF', ...typography.title, flexShrink: 1, textAlign: 'center' },
  // «Для перчаток и солнца»: крупная тап-цель (≥44pt) и читаемый текст.
  miniBtn: { borderWidth: 0, borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: 14, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexGrow: 1, flexShrink: 1, minWidth: 110, maxWidth: '100%', backgroundColor: 'rgba(148,163,184,0.14)' },
  miniBtnText: { fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  editBtn: { borderWidth: 0, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: spacing.sm, backgroundColor: 'rgba(34,197,94,0.12)', maxWidth: '100%' },
  editBtnText: { color: '#168759', fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  extendBtn: { flex: 1, backgroundColor: '#168759', borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', minHeight: 40, maxWidth: '100%' },
  extendBtnText: { color: '#0C0A09', fontSize: 13, fontWeight: '800', flexShrink: 1, textAlign: 'center' },

  }), [v1]);
  const { role } = route.params || {};
  const isDriver = role === 'driver';
  const accent = isDriver ? '#168759' : '#FF8400';
  const { t, lang } = useI18n();
  const tonUnit = lang === 'ZH' ? '吨' : lang === 'EN' ? 't' : 'т';
  const cubicMeterUnit = lang === 'ZH' ? '立方米' : 'м³';
  const { theme } = useTheme();
  const { toast } = useToast();

  // Решение владельца (05.08.2026): «Грузы»/«Рейсы» — только управление
  // объявлениями. Один основной раздел (Мои рейсы / Мои грузы) + Архив
  // (вторичный toggle, не таб). Всё, что было «Завершённые»/«Доставлено» —
  // это уже сделки, они целиком в «Сделках». Легаси initialTab
  // (my/bids/deals/inwork/enroute/done/delivered) ремапим на основной раздел.
  const DRIVER_TABS_KEYS = ['routes', 'archive'];
  const CLIENT_TABS_KEYS = ['searching', 'archive'];
  const rawInitialTab = route.params?.initialTab || (isDriver ? 'routes' : 'searching');
  const normInitialTab = isDriver
    ? (DRIVER_TABS_KEYS.includes(rawInitialTab) ? rawInitialTab : 'routes')
    : (CLIENT_TABS_KEYS.includes(rawInitialTab) ? rawInitialTab : 'searching');
  const justCreatedTrip = route.params?.justCreatedTrip || null;
  // Клиентский аналог: только что опубликованный груз показываем сразу в
  // «Ищу машину», не дожидаясь серверного refetch (замыкаем цикл публикации).
  const justCreatedCargo = route.params?.justCreatedCargo || null;
  const [tab, setTab] = useState(normInitialTab);
  const mounted = useMountedRef();  // QA-аудит P1-8
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!justCreatedTrip && !justCreatedCargo);
  const [loadError, setLoadError] = useState(null);
  const [editCargo, setEditCargo] = useState(null);  // задача A: правка своего груза
  // Название сохранено ради минимального диффа — общий «id занятой операции»
  // (republish/продление); ставки (bid) переехали в «Сделки».
  const [busyBidId, setBusyBidId] = useState(null);
  const [republishedIds, setRepublishedIds] = useState(new Set());
  const [extending, setExtending] = useState(null);  // Модель А: продление одним тапом

  // «Ещё актуально» — сбрасывает дату на сегодня, публикация снова живёт
  // 3 дня и возвращается в ленту. Без ручного ввода даты.
  const extendItem = async (item, isCargo) => {
    if (extending) return;
    setExtending(item.id);
    try {
      const r = isCargo ? await marketAPI.extendCargo(item.id) : await marketAPI.extendTrip(item.id);
      if (r.ok) { toast('✅ ' + t('extended_toast'), 'success', 3000); load(); }
      else toast(r.detail || t('send_error'), 'error');
    } catch { toast(t('no_connection'), 'error'); }
    finally { setExtending(null); }
  };

  // Progressive verification: размещение рейса — trust-действие, доступно
  // только одобренному водителю. Источник статуса — regAPI.me()
  // ({status, verification_level}). verState: loading|approved|review|
  // rejected|unverified. Без fake-approved: CreateTrip открывается только
  // при approved, иначе показываем gate-модалку → 5-шаговая проверка.
  const [verState, setVerState] = useState('loading');
  const [pubGateVisible, setPubGateVisible] = useState(false);

  useEffect(() => {
    if (!isDriver) { setVerState('approved'); return; } // у клиента кнопки размещения рейса нет
    let alive = true;
    (async () => {
      try {
        const me = await regAPI.me();
        if (!alive) return;
        if (me && (me.status === 'approved' || me.verification_level >= 3)) setVerState('approved');
        else if (me && (me.status === 'pending' || me.status === 'under_review' || me.status === 'manual_review')) setVerState('review');
        else if (me && me.status === 'rejected') setVerState('rejected');
        else setVerState('unverified');
      } catch {
        if (alive) setVerState('unverified');
      }
    })();
    return () => { alive = false; };
  }, [isDriver]);

  // Гашение бейджа событий (26.07.2026, обе роли): живёт на вкладке «Сделки»
  // (ChatsListScreen в dealsMode). Здесь ничего не гасим — иначе бейдж
  // пропадал бы от простого захода в «Мои рейсы»/«Мои грузы».

  const onPublishRoute = () => {
    if (verState === 'approved') navigation.navigate('CreateTrip', { role });
    else setPubGateVisible(true);
  };

  const confirmAction = async (msg) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      return window.confirm(msg);
    }
    return new Promise(resolve => {
      Alert.alert(msg, '', [
        { text: t('cancel'), onPress: () => resolve(false) },
        { text: 'OK', onPress: () => resolve(true) },
      ]);
    });
  };

  const load = async () => {
    setLoading(true);
    try {
      const token = await require('../utils/storage').storage.get('ur_reg_token');
      if (!token) {
        if (isDriver) {
          const trips = await marketAPI.listTrips({});
          if (!mounted.current) return;  // QA-аудит P1-8: экран размонтирован
          setData({ my_trips: trips.trips || [], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [], authRequired: true });
          setLoadError(null);
        } else {
          if (!mounted.current) return;
          setData({ my_trips: [], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [], authRequired: true });
          setLoadError(null);
        }
      } else {
        let d = await marketAPI.myDashboard();
        if (d.serverError && isDriver) {
          try { const trips = await marketAPI.listTrips({}); d = { ...d, my_trips: (trips.trips || []) }; } catch {}
        }
        if (d.serverError) throw new Error('dashboard_unavailable');
        if (!mounted.current) return;
        setData(d);
        setLoadError(null);
      }
    } catch (e) {
      console.warn('[MyTrips] load error:', e.message);
      if (mounted.current) setLoadError(e?.message || 'dashboard_unavailable');
    }
    if (mounted.current) setLoading(false);
  };

  useEffect(() => {
    if (justCreatedTrip) {
      setData({ my_trips: [justCreatedTrip], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [] });
      setLoading(false);
    } else if (justCreatedCargo) {
      setData({ my_trips: [], my_cargos: [justCreatedCargo], my_bids: [], incoming_bids: [], my_deals: [] });
      setLoading(false);
      // Фоном подтягиваем серверные данные, чтобы список стал полным.
      load();
    } else {
      load();
    }
  }, []);

  // 27.07: перечитываем список при каждом возврате на экран — иначе статус
  // сделки (Везут/Доставлено), изменённый второй стороной, не обновлялся до
  // ручного pull-to-refresh.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { load(); });
    return unsub;
  }, [navigation]);

  let myItemsRaw = isDriver ? (data?.my_trips || []) : (data?.my_cargos || []);
  if (justCreatedTrip && isDriver && !myItemsRaw.find(i => i.id === justCreatedTrip.id)) {
    myItemsRaw = [justCreatedTrip, ...myItemsRaw];
  }
  if (justCreatedCargo && !isDriver && !myItemsRaw.find(i => i.id === justCreatedCargo.id)) {
    myItemsRaw = [justCreatedCargo, ...myItemsRaw];
  }

  // RC2 hotfix (P0-4): expired (pickup_date < сегодня) больше не
  // попадают в Active. Перемещаем их в Archive виртуально (без
  // изменения backend status). Tab='deals' (Архив) теперь покажет
  // server-side completed/cancelled + локально expired.
  const parseDate = (s) => {
    if (!s) return null;
    const str = String(s).trim();
    for (const fmt of [
      /^(\d{4})-(\d{2})-(\d{2})/,           // YYYY-MM-DD (+ timestamp)
      /^(\d{2})\.(\d{2})\.(\d{4})$/,        // DD.MM.YYYY
    ]) {
      const m = fmt.exec(str);
      if (m) {
        const [, p1, p2, p3] = m;
        // ISO branch: p1=YYYY, p2=MM, p3=DD; DD.MM.YYYY branch swap
        const yyyy = p1.length === 4 ? +p1 : +p3;
        const mm = +p2;
        const dd = p1.length === 4 ? +p3 : +p1;
        return new Date(yyyy, mm - 1, dd);
      }
    }
    return null;
  };
  const isExpiredItem = (it) => {
    const d = parseDate(it.pickup_date || it.departure);
    if (!d) return false;
    // Модель А: публикация живёт 3 дня (день выезда + 2), согласовано с
    // лентой. Дальше — «Срок истёк». Граница = сегодня-2: expired, если
    // дата < (сегодня − 2 дня).
    const grace = new Date();
    grace.setHours(0, 0, 0, 0);
    grace.setDate(grace.getDate() - 2);
    return d < grace;
  };
  // Решение владельца (05.08.2026): «Грузы»/«Рейсы» — ТОЛЬКО управление
  // объявлениями (active/draft/expired + архив unpublished/cancelled/rejected).
  // Всё, что связано со сделкой — целиком в «Сделках». Статусы листинга во
  // время сделки (см. backend/api/marketplace.py, _DEAL_TO_TRIP и accept_bid):
  // trip: active → booked → in_transit → delivered/cancelled
  // cargo: active → taken → completed (или обратно active при отмене сделки)
  // Все «занятые сделкой» статусы скрываем здесь так же, как completed/
  // delivered — иначе один и тот же рейс/груз виден и тут, и в Сделках.
  const HIDDEN_ITEM_STATUSES = new Set(['completed', 'delivered', 'unpublished', 'booked', 'taken', 'in_transit']);
  // Приоритет статуса над датой (05.08.2026, п.6/13/25 аудита): раньше
  // «просрочено» считалось ТОЛЬКО по дате, без учёта item.status — доставленный
  // рейс с прошедшей датой выезда всё равно попадал в myItemsExpired и рисовал
  // «Срок истёк» + рабочие на вид кнопки «Ещё актуально»/«Изменить дату»,
  // которые бэкенд (extend_trip/extend_cargo) отклоняет 409 «не активен»,
  // потому что статус уже не 'active'. Источник истины: если у публикации уже
  // есть исход по сделке (HIDDEN_ITEM_STATUSES) или она сама закрыта
  // (cancelled/rejected), это НЕ «истёкшая публикация» — статус приоритетнее
  // даты. «Истёкшая» относится только к публикации, которая так и осталась
  // активной/черновиком и просто не нашла сделку вовремя.
  const isOpenPublicationStatus = (it) => !it.status || it.status === 'active' || it.status === 'draft';
  const wasRepublished = (it) => republishedIds.has(String(it.id));
  const myItemsActive = myItemsRaw.filter((it) => (wasRepublished(it) || isOpenPublicationStatus(it)) && !isExpiredItem(it));
  const myItemsUnpublished = myItemsRaw.filter((it) => it.status === 'unpublished' && !wasRepublished(it));
  // Отменённые/отклонённые ОБЪЯВЛЕНИЯ (не сделки/ставки — те в «Сделках»).
  const myItemsClosed = myItemsRaw.filter((it) => it.status === 'cancelled' || it.status === 'rejected');
  const myItemsExpired = myItemsRaw.filter((it) => isOpenPublicationStatus(it) && isExpiredItem(it));
  const myItems = [...myItemsActive, ...myItemsExpired.map(it => ({ ...it, _expired: true }))];

  const myBids = isDriver ? (data?.my_bids || []) : (data?.incoming_bids || []);
  // Валюта суммы ставки/сделки. Бэкенд теперь отдаёт currency на ставках
  // (my_bids/incoming_bids) и сделках (JOIN на cargos.currency); фолбэк — по
  // cargo_id из моих грузов; иначе 'USD' (formatPrice → '$'). Это убирает
  // хардкод «$» на грузах в KZT/RUB/CNY, старые ставки без currency не ломаются.
  const currencyFor = (item) =>
    (item && item.currency)
    || (item && (data?.my_cargos || []).find((cc) => cc.id === item.cargo_id)?.currency)
    || 'USD';

  // «Ищу машину» = только активные грузы (booked/taken уже отфильтрованы выше
  // через HIDDEN_ITEM_STATUSES — такой груз живёт в «Сделках», не дублируется тут).
  const clientSearching = myItems.filter((c) => !c.status || c.status === 'active');
  // Архив — только объявления: неопубликованные + закрытые (отменённые/
  // отклонённые как ЛИСТИНГИ). Отменённые/отклонённые СДЕЛКИ и СТАВКИ — это
  // переговоры, они живут в «Сделках» со статусом «Отменено» (05.08.2026:
  // раньше дублировались и здесь, и там; теперь у каждой записи одно место).
  const driverArchive = [...myItemsUnpublished, ...myItemsClosed].map((it) => ({ ...it, _kind: 'unpublished' }));
  const clientArchive = [...myItemsUnpublished, ...myItemsClosed].map((it) => ({ ...it, _kind: 'unpublished' }));

  // ─── Cards ───

  const renderMyItem = ({ item }) => {
    const from = item.from_city || '—';
    const to = item.to_city || '—';
    const desc = item.cargo_desc || '';
    const isCargo = !!item.cargo_desc;
    const badge = isCargo ? t('badge_cargo') : t('badge_trip');
    const badgeColor = isCargo ? '#FF8400' : '#168759';
    // Edit is allowed only for own ACTIVE trips. Backend will also block any
    // attempt with an accepted deal — but hiding the button is a much better
    // UX than letting the user tap → wait → see "edit denied".
    const canEditTrip = !isCargo && (item.status || 'active') === 'active';

    return (
      <TouchableOpacity
        testID={isCargo ? 'my-cargo-card' : 'my-trip-card'}
        style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => {
          if (isCargo) {
            navigation.navigate('CargoDetail', { cargo: { ...item, from, to, cargo: desc, _server: true }, cargoId: item.id, role });
          } else {
            // Tap on own trip card → open canonical TripDetail
            navigation.navigate('TripDetail', { trip: normalizeTrip({ ...item, isMine: true, _server: true }), tripId: item.id, role });
          }
        }}
      >
        <View style={s.cardTop}>
          <View style={[s.badge, { backgroundColor: badgeColor + '20' }]}>
            <Text style={[s.badgeText, { color: badgeColor }]}>{badge}</Text>
          </View>
          {/* Stage DS-1: статус не должен быть плоско-зелёным для всех состояний.
              Раньше cancelled / draft / pending тоже рендерились #168759,
              что визуально врало пользователю (зелёное = "успешно"). Теперь
              цвет подбирается по item.status. */}
          {item._expired ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name="clock" size={13} color="#EF4444" />
              <Text style={[s.statusLabel, { color: '#EF4444' }]}>{t('deadline_expired')}</Text>
            </View>
          ) : (
            <Text style={[s.statusLabel, { color: (() => {
              const st = item.status || 'active';
              if (st === 'cancelled') return '#94A3B8';        // серый
              if (st === 'draft' || st === 'pending') return '#FF8400'; // янтарный
              if (st === 'rejected' || st === 'expired') return '#EF4444'; // красный
              if (st === 'completed' || st === 'delivered') return '#168759'; // зелёный
              return '#168759'; // active по умолчанию — зелёный
            })() }]}>{formatStatus(item.status || 'active')}</Text>
          )}
        </View>
        <Text style={[s.route, { color: theme.text }]}>{countryFlag(item.from_country)} {localizePlace(from, lang)} → {countryFlag(item.to_country)} {localizePlace(to, lang)}</Text>
        {desc ? <Text style={[s.desc, { color: theme.textMuted }]} numberOfLines={1}>{localizeCargoName(desc, lang)}</Text> : null}
        <View style={s.cardMeta}>
          <Text style={[s.metaItem, { color: theme.textDim }]}>{formatTruckType(item.truck_type || item.cargo_type)}</Text>
          <Text style={s.metaDot}>·</Text>
          {/* RC2 hotfix (P0-3): для cargos показываем pickup_date, не
              created_at. Для trips остаётся departure || created_at. */}
          <Text style={[s.metaItem, { color: theme.textDim }]}>
            {isCargo
              ? formatDateForDisplay(item.pickup_date || item.departure || item.created_at)
              : formatDateForDisplay(item.departure || item.created_at)}
          </Text>
          {/* Вес/объём: cargo и trip используют разные имена полей,
              а единицы локализуются вместе с карточкой. */}
          {(isCargo ? item.weight_tons : item.capacity_tons) ? (
            <>
              <Text style={s.metaDot}>·</Text>
              <Text style={[s.metaItem, { color: theme.textDim }]}>{isCargo ? item.weight_tons : item.capacity_tons} {tonUnit}</Text>
            </>
          ) : null}
          {(isCargo ? item.volume_m3 : item.available_m3) ? (
            <>
              <Text style={s.metaDot}>·</Text>
              <Text style={[s.metaItem, { color: theme.textDim }]}>{isCargo ? item.volume_m3 : item.available_m3} {cubicMeterUnit}</Text>
            </>
          ) : null}
        </View>
        <View style={s.cardBottom}>
          <Text style={s.price} numberOfLines={1}>{formatPrice(item.price, item.currency, t)}</Text>
          {item.bids_count > 0 && !(isCargo && !isDriver) && <Text style={[s.bidsLabel, { color: theme.textMuted }]}>{formatBids(item.bids_count)}</Text>}
        </View>
        {/* Индикатор откликов на карточке груза. С 26.07.2026 работа со
            ставками живёт во вкладке «Сделки» — тап по плашке ведёт туда
            (витрина показывает «есть отклик», решение принимается в Сделках). */}
        {isCargo && !isDriver && item.bids_count > 0 && (item.status || 'active') === 'active' && (
          <TouchableOpacity
            style={s.offersCta}
            testID="cargo-offers-cta"
            onPress={(e) => { e.stopPropagation && e.stopPropagation(); navigation.navigate('Deals'); }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Feather name="message-square" size={14} color="#FF8400" />
              <Text style={s.offersCtaText} numberOfLines={1}>{formatBids(item.bids_count)}</Text>
            </View>
            <Text style={s.offersCtaArrow}>›</Text>
          </TouchableOpacity>
        )}
        {canEditTrip && (
          <TouchableOpacity
            testID="my-trip-edit-btn"
            style={s.editBtn}
            onPress={(e) => {
              e.stopPropagation && e.stopPropagation();
              navigation.navigate('EditTrip', { tripId: item.id, trip: normalizeTrip({ ...item, isMine: true, _server: true }) });
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="edit-3" size={14} color="#168759" />
              <Text style={s.editBtnText}>{t('edit_btn')}</Text>
            </View>
          </TouchableOpacity>
        )}
        {/* Просроченный груз/рейс (Модель А): «Ещё актуально» — продление
            ОДНИМ ТАПОМ (дата = сегодня, снова живёт 3 дня и в ленте). Рядом —
            «Изменить дату», если нужна конкретная дата. */}
        {item._expired && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
            <TouchableOpacity
              testID="extend-oneclick-btn"
              style={[s.extendBtn, extending === item.id && { opacity: 0.6 }]}
              onPress={(e) => { e.stopPropagation && e.stopPropagation(); extendItem(item, isCargo); }}
              disabled={extending === item.id}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="check-circle" size={14} color="#0C0A09" />
                <Text style={s.extendBtnText}>{t('still_active')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              testID="extend-editdate-btn"
              style={[s.editBtn, { borderColor: '#FF8400', marginTop: 0, paddingHorizontal: 14 }]}
              onPress={(e) => {
                e.stopPropagation && e.stopPropagation();
                if (isCargo) setEditCargo(item);
                else navigation.navigate('EditTrip', { tripId: item.id, trip: normalizeTrip({ ...item, isMine: true, _server: true }) });
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="calendar" size={14} color="#FF8400" />
                <Text style={[s.editBtnText, { color: '#E06D00' }]}>{t('change_date')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
        {/* Задача A: управление СВОИМ грузом — Изменить (цена/описание) + Удалить.
            Только для активного груза (taken/принятый редактировать нельзя). */}
        {isCargo && !isDriver && (item.status || 'active') === 'active' && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              testID="my-cargo-edit-btn"
              style={[s.miniBtn, { borderColor: '#FF8400', flex: 1 }]}
              onPress={(e) => { e.stopPropagation && e.stopPropagation(); setEditCargo(item); }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="edit-3" size={14} color="#FF8400" />
                <Text style={[s.miniBtnText, { color: '#E06D00' }]}>{t('edit_btn')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              testID="my-cargo-delete-btn"
              style={[s.miniBtn, { borderColor: '#EF4444', flex: 1 }]}
              onPress={async (e) => {
                e.stopPropagation && e.stopPropagation();
                if (!(await confirmAction(t('delete_cargo_confirm')))) return;
                const r = await marketAPI.deleteCargo(item.id);
                if (r && (r.ok || r.ok === undefined)) { toast(t('cargo_deleted'), 'success'); load(); }
                else toast((r && r.detail) || t('delete_failed'), 'error');
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="trash-2" size={14} color="#EF4444" />
                <Text style={[s.miniBtnText, { color: '#EF4444' }]}>{t('delete_btn')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const republishItem = async (item, isCargo) => {
    setBusyBidId(item.id);
    try {
      const r = isCargo
        ? await marketAPI.republishCargo(item.id)
        : await marketAPI.republishTrip(item.id);
      if (r.ok) {
        // После ACK от сервера сразу убираем карточку из архива локально.
        // load() всё равно перечитает source of truth, но web E2E и живой UX не
        // должны видеть старый "unpublished" между toast и сетевым refresh.
        const key = isCargo ? 'my_cargos' : 'my_trips';
        setData(prev => {
          if (!prev || !Array.isArray(prev[key])) return prev;
          return {
            ...prev,
            [key]: prev[key].map((it) => (
              String(it.id) === String(item.id)
                ? { ...it, status: 'active', unpublished_at: null, _kind: undefined }
                : it
            )),
          };
        });
        setRepublishedIds(prev => {
          const next = new Set(prev);
          next.add(String(item.id));
          return next;
        });
        toast('✅ ' + t('republish'), 'success');
        await load();
      } else {
        toast(r.detail || t('send_error'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
    setBusyBidId(null);
  };

  // Карточка сделки/статус перевозки/чат/трекинг/отзыв — переехали целиком в
  // «Сделки» (ChatScreen), решение владельца 05.08.2026: «Мои рейсы»/«Мои
  // грузы» — только управление объявлениями. renderDeal/openDealCard/
  // setDealStatusOnServer удалены как мёртвый код вместе с этим экраном.

  // renderBid удалён: единственный вызов был из renderArchiveItem для
  // _kind==='bid', а такие записи в архив больше не попадают (отклонённые/
  // отменённые ставки теперь показываются в «Сделках» статусом «Отменено» —
  // см. ChatsListScreen.js). Accept/reject/counter самих ставок — там же.

  // ─── Layout ───

  const v1Accent = v1AccentFor(isDriver ? 'driver' : 'client');

  const renderUnpublishedItem = ({ item }) => {
    const isCargo = !!item.cargo_desc;
    const from = item.from_city || '—';
    const to = item.to_city || '—';
    return (
      <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, opacity: 0.7 }]}>
        <View style={s.cardTop}>
          <View style={[s.badge, { backgroundColor: '#94A3B820' }]}>
            <Text style={[s.badgeText, { color: '#94A3B8' }]}>{isCargo ? t('badge_cargo') : t('badge_trip')}</Text>
          </View>
          <Text style={[s.statusLabel, { color: '#94A3B8' }]}>{formatStatus(item.status || 'unpublished')}</Text>
        </View>
        <Text style={[s.route, { color: theme.text }]}>{countryFlag(item.from_country)} {localizePlace(from, lang)} → {countryFlag(item.to_country)} {localizePlace(to, lang)}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
          <TouchableOpacity
            testID="republish-btn"
            style={[s.acceptBtn, { backgroundColor: accent, flex: 1 }]}
            onPress={() => republishItem(item, isCargo)}
          >
            <Text style={[s.acceptBtnText, { color: '#0C0A09' }]}>{t('republish')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Архив содержит только неопубликованные объявления (см. driverArchive/
  // clientArchive выше) — отдельного dispatch-рендерера больше не нужно.
  const DRIVER_DATA = { routes: myItems, archive: driverArchive };
  const DRIVER_RENDER = { routes: renderMyItem, archive: renderUnpublishedItem };
  const CLIENT_DATA = { searching: clientSearching, archive: clientArchive };
  const CLIENT_RENDER = { searching: renderMyItem, archive: renderUnpublishedItem };
  const listData = isDriver ? (DRIVER_DATA[tab] || []) : (CLIENT_DATA[tab] || []);
  const listRenderBase = isDriver ? (DRIVER_RENDER[tab] || renderMyItem) : (CLIENT_RENDER[tab] || renderMyItem);
  // Промпт-дизайн: карточки появляются каскадом (выезд 10px + fade, 50мс шаг).
  const listRender = ({ item, index }) => (
    <FadeInUp delay={Math.min(index || 0, 8) * 50}>
      {listRenderBase({ item })}
    </FadeInUp>
  );

  const renderEmpty = () => {
    if (loadError) {
      return <EmptyState title={t('load_error')} description={t('load_error_retry_desc')} actionLabel={t('retry')} onAction={load} />;
    }
    if (data?.authRequired) {
      return <EmptyState title={t('gate_login')} description={t('gate_login_desc')} actionLabel={t('gate_enter')} onAction={() => navigation.navigate('Role')} />;
    }
    if (isDriver) {
      if (tab === 'routes') return <EmptyState title={t('no_trips_yet')} description={t('no_trips_desc')} actionLabel={t('publish_route')} onAction={onPublishRoute} />;
      return <EmptyState title={t('no_archive_yet')} description={t('no_archive_desc')} />;
    }
    if (tab === 'searching') return <EmptyState title={t('no_cargos_yet')} description={t('client_searching_desc')} actionLabel={t('place_cargo')} onAction={() => navigation.navigate('CreateCargo')} />;
    return <EmptyState title={t('no_archive_yet')} description={t('no_archive_desc')} />;
  };

  return (
    <SafeAreaView testID="my-work-screen" style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']}>
      {/* Stage 16: brand bar — UrTruck wordmark + bell only.
          Stripped the green FTL pill (same change in BrandHeader /
          BrandBarWithShare / FeedScreen). */}
      <View style={s.brandBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[s.backIcon, { color: v1Accent.main }]}>‹</Text>
        </TouchableOpacity>
        <View style={s.brandRow}>
          <Text style={s.brandText}>UrTruck</Text>
        </View>
        {/* ☰ (top-right) → профиль и меню. Колокольчик уехал вниз в
            таб-бар как вкладка «Сделки» (единый инбокс живой работы). */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile', { role })}
          style={s.menuBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID="mywork-menu-btn"
          accessibilityLabel={t('tab_profile')}
        >
          <Feather name="menu" size={24} color={v1.text} />
        </TouchableOpacity>
      </View>

      <View style={s.titleBlock}>
        <Text style={s.titleHero}>{isDriver ? t('my_trips_title') : t('my_cargos_title')}</Text>
        <Text style={s.titleSub}>{isDriver ? t('my_trips_subtitle') : t('my_cargos_subtitle')}</Text>
      </View>

      {/* §2.2.2: кнопка размещения живёт ВНУТРИ «моего меню», а не отдельной
          вкладкой. Driver: «Разместить рейс» (через verification-gate).
          Client (26.07.2026): «Разместить груз» — центральная «+»-вкладка
          из таб-бара убрана, размещение в одном месте с моими грузами. */}
      <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
        <TouchableOpacity
          testID={isDriver ? 'mytrips-publish-route' : 'mytrips-place-cargo'}
          onPress={isDriver ? onPublishRoute : () => navigation.navigate('CreateCargo', { role })}
          activeOpacity={0.75}
          style={[s.publishRouteBtn, { borderColor: v1Accent.main }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="plus" size={14} color={v1Accent.main} />
            <Text style={[s.publishRouteText, { color: v1Accent.main }]}>{isDriver ? t('publish_route') : t('place_cargo')}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        {/* Решение владельца 05.08.2026: один основной раздел (листинги),
            вкладок для переключения больше нет — SegmentTabs с одной вечно
            активной кнопкой был бы лишним элементом. Архив — единственный
            вторичный toggle, доступен обеим ролям. */}
        {(
          <TouchableOpacity
            testID="my-work-archive-toggle"
            onPress={() => setTab(tab === 'archive' ? (isDriver ? 'routes' : 'searching') : 'archive')}
            style={s.archiveToggle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[s.archiveToggleText, { color: tab === 'archive' ? v1Accent.main : v1.textMuted }]}>
              {tab === 'archive' ? `‹ ${t('back_to_active')}` : `${t('tab_archive')} (${(isDriver ? driverArchive : clientArchive).length}) ›`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={listData}
        keyExtractor={(i, idx) => (i._kind ? i._kind + ':' : '') + (i.id ?? idx)}
        renderItem={listRender}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={renderEmpty()}
        ListHeaderComponent={loadError && listData.length ? (
          <TouchableOpacity onPress={load} style={{ paddingVertical: 12 }} testID="my-work-retry-banner">
            <Text style={{ color: v1.error || '#D64545', textAlign: 'center', fontWeight: '700' }}>{t('load_error_retry_desc')}</Text>
          </TouchableOpacity>
        ) : null}
      />

      <EditCargoModal
        visible={!!editCargo}
        cargo={editCargo}
        onClose={() => setEditCargo(null)}
        onSaved={() => load()}
      />

      {/* Progressive verification gate для размещения рейса (driver). */}
      <Modal visible={pubGateVisible} transparent animationType="fade" onRequestClose={() => setPubGateVisible(false)}>
        <View style={s.pgBackdrop}>
          <View style={s.pgCard} testID="trips-publish-gate">
            <Feather name="lock" size={40} color={v1.text} style={{ marginBottom: 12 }} />
            <Text style={s.pgTitle}>
              {verState === 'review' ? t('trips_gate_pending_title')
                : verState === 'rejected' ? t('trips_gate_rejected_title')
                : t('trips_gate_title')}
            </Text>
            <Text style={s.pgText}>
              {verState === 'review' ? t('trips_gate_pending_text')
                : verState === 'rejected' ? t('trips_gate_rejected_text')
                : t('trips_gate_text')}
            </Text>
            <TouchableOpacity
              style={s.pgBtn}
              testID="trips-publish-gate-cta"
              onPress={() => {
                setPubGateVisible(false);
                navigation.navigate(verState === 'review' ? 'Security' : 'Citizenship');
              }}
            >
              <Text style={s.pgBtnText}>
                {verState === 'review' ? t('trips_gate_pending_btn')
                  : verState === 'rejected' ? t('trips_gate_rejected_btn')
                  : t('trips_gate_btn')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.pgCancel} onPress={() => setPubGateVisible(false)}>
              <Text style={s.pgCancelText}>{t('not_now')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
