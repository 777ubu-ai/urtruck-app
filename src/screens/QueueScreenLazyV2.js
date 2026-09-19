import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { useV1Colors, useDriverCeramicColors } from '../theme/designV1';
import RootHeader from '../components/ui/v1/RootHeader';
import DriverRouteBackdrop from '../components/ui/v1/DriverRouteBackdrop';
import CountryFlag from '../components/ui/v1/CountryFlag';
import { API_BASE } from '../config/env';
import { localizeCheckpointName } from '../utils/checkpointNames';
import { storage } from '../utils/storage';
import { vehicleAPI } from '../utils/vehicleAPI';
import { marketAPI } from '../utils/marketAPI';
import { useVerificationGate } from '../components/VerificationGate';
import { LEVELS } from '../utils/AuthContext';

const BASE = `${API_BASE}/borders`;
const FAVORITES_KEY = 'ur_border_favorites_v2';
const DEFAULT_COUNTRY = 'CN';
const COUNTRY_ORDER = ['CN', 'KG', 'RU', 'UZ', 'TM', 'CASPIAN'];
const MCI_KZT_2026 = 4325;

const COUNTRY = {
  CN: { RU: 'Китай', KK: 'Қытай', EN: 'China', ZH: '中国' },
  KG: { RU: 'Кыргызстан', KK: 'Қырғызстан', EN: 'Kyrgyzstan', ZH: '吉尔吉斯斯坦' },
  RU: { RU: 'Россия', KK: 'Ресей', EN: 'Russia', ZH: '俄罗斯' },
  UZ: { RU: 'Узбекистан', KK: 'Өзбекстан', EN: 'Uzbekistan', ZH: '乌兹别克斯坦' },
  TM: { RU: 'Туркменистан', KK: 'Түрікменстан', EN: 'Turkmenistan', ZH: '土库曼斯坦' },
  CASPIAN: { RU: 'Каспий', KK: 'Каспий', EN: 'Caspian', ZH: '里海' },
};

const COPY = {
  RU: {
    title: 'Граница', subtitle: 'Реальная загрузка и доступная бронь CGR', where: 'Куда едете?', all: 'Все',
    choose: 'Выберите КПП', hint: 'Листайте и нажмите нужный пункт — данные загрузятся только для него',
    tap: 'Нажмите на КПП, чтобы увидеть реальную обстановку', loading: 'Получаем данные CGR…',
    nearest: 'Ближайшая свободная бронь', places: 'свободных мест', standard: '1 МРП', premium: '100 МРП',
    premiumNearest: 'Ближайшая бронь за 100 МРП', noStandard: 'Свободных мест за 1 МРП в доступном календаре нет',
    board: 'Сейчас на табло', limit: 'Лимит', perDay: '/сутки', calendar: 'Календарь загрузки', noPlaces: 'Нет мест',
    dayOff: 'Выходной', updated: 'CGR обновлено', refresh: 'Обновить', details: 'Открыть CGR', favorite: 'В избранное',
    favorited: 'В избранном', sourceError: 'Не удалось получить данные CGR. Повторите.', checkQueue: 'Проверить свою очередь',
    platePlaceholder: 'Госномер, например 123ABC02', check: 'Проверить', notFound: 'Активная очередь не найдена',
    lookupError: 'Не удалось проверить номер', checkpoint: 'КПП', queueTime: 'Время очереди', status: 'Статус',
    cached: 'из кэша UrTruck', live: 'живые данные', selected: 'Выбрано', tapToOpen: 'Нажать', swipeCalendar: 'Листайте даты →',
  },
  KK: {
    title: 'Шекара', subtitle: 'CGR нақты жүктемесі және қолжетімді бронь', where: 'Қайда барасыз?', all: 'Барлығы',
    choose: 'Өткізу бекетін таңдаңыз', hint: 'Жылжытып, қажет бекетті басыңыз — деректер тек сол бекетке жүктеледі',
    tap: 'Нақты жағдайды көру үшін бекетті басыңыз', loading: 'CGR деректері жүктелуде…', nearest: 'Ең жақын бос бронь',
    places: 'бос орын', standard: '1 АЕК', premium: '100 АЕК', premiumNearest: '100 АЕК бойынша жақын бронь',
    noStandard: 'Қолжетімді күнтізбеде 1 АЕК бойынша бос орын жоқ', board: 'Қазір таблода', limit: 'Лимит', perDay: '/тәулік',
    calendar: 'Жүктеме күнтізбесі', noPlaces: 'Орын жоқ', dayOff: 'Демалыс', updated: 'CGR жаңартылды', refresh: 'Жаңарту',
    details: 'CGR ашу', favorite: 'Таңдаулыға', favorited: 'Таңдаулыда', sourceError: 'CGR деректерін алу мүмкін болмады.',
    checkQueue: 'Өз кезегіңізді тексеру', platePlaceholder: 'Мемлекеттік нөмір, мысалы 123ABC02', check: 'Тексеру',
    notFound: 'Белсенді кезек табылмады', lookupError: 'Нөмірді тексеру мүмкін болмады', checkpoint: 'Бекет', queueTime: 'Кезек уақыты',
    status: 'Күйі', cached: 'UrTruck кэшінен', live: 'нақты дерек', selected: 'Таңдалды', tapToOpen: 'Басу', swipeCalendar: 'Күндерді жылжытыңыз →',
  },
  EN: {
    title: 'Border', subtitle: 'Real CGR load and booking availability', where: 'Where are you going?', all: 'All',
    choose: 'Choose checkpoint', hint: 'Swipe and tap a checkpoint — data loads only for that checkpoint',
    tap: 'Tap a checkpoint to see the real situation', loading: 'Loading CGR data…', nearest: 'Nearest free booking',
    places: 'free slots', standard: '1 MCI', premium: '100 MCI', premiumNearest: 'Nearest 100 MCI booking',
    noStandard: 'No 1 MCI slots in the published calendar', board: 'On live board now', limit: 'Limit', perDay: '/day',
    calendar: 'Load calendar', noPlaces: 'No slots', dayOff: 'Day off', updated: 'CGR updated', refresh: 'Refresh', details: 'Open CGR',
    favorite: 'Favorite', favorited: 'Favorited', sourceError: 'Could not load CGR data. Try again.', checkQueue: 'Check your queue',
    platePlaceholder: 'Plate number, e.g. 123ABC02', check: 'Check', notFound: 'No active queue found', lookupError: 'Could not check plate',
    checkpoint: 'Checkpoint', queueTime: 'Queue time', status: 'Status', cached: 'UrTruck cache', live: 'live data', selected: 'Selected', tapToOpen: 'Tap',
    swipeCalendar: 'Swipe dates →',
  },
  ZH: {
    title: '边境', subtitle: 'CGR 实时负载与预约空位', where: '您要去哪里？', all: '全部', choose: '选择口岸',
    hint: '左右滑动并点击口岸 — 只加载所选口岸的数据', tap: '点击口岸查看实时情况', loading: '正在获取 CGR 数据…',
    nearest: '最近可预约日期', places: '个空位', standard: '1 MCI', premium: '100 MCI', premiumNearest: '最近 100 MCI 预约',
    noStandard: '公开日历内暂无 1 MCI 空位', board: '当前电子屏', limit: '每日限额', perDay: '/天', calendar: '负载日历',
    noPlaces: '无空位', dayOff: '休息日', updated: 'CGR 更新时间', refresh: '刷新', details: '打开 CGR', favorite: '收藏',
    favorited: '已收藏', sourceError: '无法获取 CGR 数据，请重试。', checkQueue: '查询我的排队', platePlaceholder: '车牌号，例如 123ABC02',
    check: '查询', notFound: '未找到有效排队', lookupError: '无法查询车牌', checkpoint: '口岸', queueTime: '排队时间', status: '状态',
    cached: 'UrTruck 缓存', live: '实时数据', selected: '已选择', tapToOpen: '点击查看', swipeCalendar: '左右滑动日期 →',
  },
};

const ROLE_COPY = {
  RU: {
    myVehicle: 'Моя машина', change: 'Сменить', myBorderDeals: 'Мои перевозки на границе',
    active: 'активных', cgrOnline: 'CGR online', selectedShipment: 'Выбранная перевозка',
    toCheckpoint: 'До КПП', trackingOn: 'Отслеживание включено', openDeal: 'Открыть сделку',
    history: 'История статусов', messageDriver: 'Написать водителю', borderSituation: 'Обстановка на границе',
    checkOther: 'Проверить другой номер', noVehicle: 'Добавьте машину, чтобы UrTruck сам проверял очередь по госномеру.',
    noActiveShipments: 'Активных перевозок на границе пока нет.', liveStatus: 'Статус CGR',
    gpsOnline: 'GPS включён', gpsUnavailable: 'GPS пока недоступен', late: 'Опаздывает', onTime: 'Не опаздывает',
  },
  KK: {
    myVehicle: 'Менің көлігім', change: 'Ауыстыру', myBorderDeals: 'Шекарадағы тасымалдарым',
    active: 'белсенді', cgrOnline: 'CGR online', selectedShipment: 'Таңдалған тасымал',
    toCheckpoint: 'Бекетке дейін', trackingOn: 'Бақылау қосулы', openDeal: 'Мәмілені ашу',
    history: 'Күй тарихы', messageDriver: 'Жүргізушіге жазу', borderSituation: 'Шекарадағы жағдай',
    checkOther: 'Басқа нөмірді тексеру', noVehicle: 'Кезекті автоматты тексеру үшін көлік қосыңыз.',
    noActiveShipments: 'Шекарада белсенді тасымалдар жоқ.', liveStatus: 'CGR күйі',
    gpsOnline: 'GPS қосулы', gpsUnavailable: 'GPS әзірге қолжетімсіз', late: 'Кешігуде', onTime: 'Кешікпейді',
  },
  EN: {
    myVehicle: 'My vehicle', change: 'Change', myBorderDeals: 'My border shipments',
    active: 'active', cgrOnline: 'CGR online', selectedShipment: 'Selected shipment',
    toCheckpoint: 'To checkpoint', trackingOn: 'Tracking on', openDeal: 'Open deal',
    history: 'Status history', messageDriver: 'Message driver', borderSituation: 'Border situation',
    checkOther: 'Check another plate', noVehicle: 'Add a vehicle so UrTruck can check the queue automatically.',
    noActiveShipments: 'No active border shipments yet.', liveStatus: 'CGR status',
    gpsOnline: 'GPS on', gpsUnavailable: 'GPS unavailable', late: 'Late', onTime: 'On time',
  },
  ZH: {
    myVehicle: '我的车辆', change: '切换', myBorderDeals: '我的边境运输',
    active: '进行中', cgrOnline: 'CGR 在线', selectedShipment: '已选运输',
    toCheckpoint: '距口岸', trackingOn: '跟踪已开启', openDeal: '打开交易',
    history: '状态记录', messageDriver: '联系司机', borderSituation: '边境情况',
    checkOther: '查询其他车牌', noVehicle: '添加车辆后，UrTruck 可自动查询排队状态。',
    noActiveShipments: '暂无边境运输。', liveStatus: 'CGR 状态',
    gpsOnline: 'GPS 已开启', gpsUnavailable: 'GPS 暂不可用', late: '已延误', onTime: '未延误',
  },
};

// The plate lookup (/borders/lookup) returns `status_raw` scraped verbatim
// from CGR's public registry HTML — always Russian, e.g. "В очереди", "Вызван".
// It also returns a fixed, finite `status` code (backend/cgr/parsers.py's
// _STATUS_MAP) that the raw text was normalized into. Displaying status_raw
// showed untranslatable Russian to every non-RU user; the code has a known,
// enumerable set of values, so it can be mapped per locale like any other
// enum instead of round-tripping CGR's scraped copy.
const LOOKUP_STATUS = {
  in_queue: { RU: 'В очереди', KK: 'Кезекте', EN: 'In queue', ZH: '排队中' },
  called: { RU: 'Вызван', KK: 'Шақырылды', EN: 'Called', ZH: '已叫号' },
  crossed: { RU: 'Пересёк границу', KK: 'Шекарадан өтті', EN: 'Crossed the border', ZH: '已过境' },
  revoked: { RU: 'Бронь отозвана', KK: 'Брон қайтарылды', EN: 'Booking revoked', ZH: '预约已撤销' },
  payment: { RU: 'Производится оплата', KK: 'Төлем жүргізілуде', EN: 'Payment in progress', ZH: '支付处理中' },
  not_paid: { RU: 'Оплата не произведена', KK: 'Төлем жасалмады', EN: 'Not paid', ZH: '尚未支付' },
  validating: { RU: 'Производится проверка', KK: 'Тексеру жүргізілуде', EN: 'Under review', ZH: '审核中' },
  review_failed: { RU: 'Проверка провалена', KK: 'Тексеру сәтсіз аяқталды', EN: 'Review failed', ZH: '审核未通过' },
  unknown: { RU: 'Статус уточняется', KK: 'Күйі нақтылануда', EN: 'Status pending', ZH: '状态待定' },
};
function lookupStatusLabel(code, lang) {
  const entry = LOOKUP_STATUS[code] || LOOKUP_STATUS.unknown;
  return entry[lang] || entry.RU;
}

function normalizePlate(value) { return String(value || '').trim().toUpperCase().replace(/\s+/g, ''); }
function jsonArray(raw) { if (!raw) return []; try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } }
async function fetchJson(url) {
  const response = await fetch(url);
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.detail || `HTTP ${response.status}`);
  return body;
}
function localeFor(lang) { return lang === 'KK' ? 'kk-KZ' : lang === 'EN' ? 'en-GB' : lang === 'ZH' ? 'zh-CN' : 'ru-RU'; }
function formatDate(iso, lang) {
  if (!iso) return '—';
  const date = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return iso;
  try { return new Intl.DateTimeFormat(localeFor(lang), { day: 'numeric', month: 'long' }).format(date); } catch { return iso; }
}
function formatShortDate(iso, lang) {
  if (!iso) return '—';
  const date = new Date(`${iso}T12:00:00`);
  try { return new Intl.DateTimeFormat(localeFor(lang), { day: 'numeric', month: 'short' }).format(date); } catch { return iso; }
}
function formatSourceTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function formatKztAmount(mci) {
  const amount = Math.max(0, Number(mci) || 0) * MCI_KZT_2026;
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₸`;
}

// The nearest booking fields are also official backend data. Defensively merge
// them into the horizontal calendar so the hero can never say "20 Sep" while
// the carousel visually ends on "17 Sep" because an upstream grid omitted a row.
export function completeBookingCalendar(live) {
  if (!live) return [];
  const byDate = new Map();
  for (const row of Array.isArray(live.booking_calendar) ? live.booking_calendar : []) {
    if (row?.date) byDate.set(row.date, { ...row });
  }
  if (live.nearest_booking && !byDate.has(live.nearest_booking)) {
    byDate.set(live.nearest_booking, {
      date: live.nearest_booking,
      standard_free: live.nearest_booking_free ?? null,
      premium_free: null,
      is_day_off: false,
    });
  }
  if (live.nearest_premium_booking) {
    const current = byDate.get(live.nearest_premium_booking) || {
      date: live.nearest_premium_booking, standard_free: null, premium_free: null, is_day_off: false,
    };
    if (current.premium_free == null) current.premium_free = live.nearest_premium_free ?? null;
    byDate.set(live.nearest_premium_booking, current);
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 31);
}

export default function QueueScreenLazyV2({ navigation, route }) {
  const { theme: themeBase } = useTheme();
  const v1Base = useV1Colors();
  const ceramic = useDriverCeramicColors();
  const { t, lang, sp } = useI18n();
  const L = COPY[lang] || COPY.RU;
  const R = ROLE_COPY[lang] || ROLE_COPY.RU;
  const role = route?.params?.role || 'driver';
  const isDriver = role === 'driver';
  const activeColor = isDriver ? ceramic.active : '#168759';
  const v1 = isDriver ? ceramic : v1Base;
  const theme = isDriver ? {
    ...themeBase,
    bg: ceramic.bg,
    card: ceramic.surface,
    surface: ceramic.surface,
    text: ceramic.text,
    textMuted: ceramic.textMuted,
    textDim: ceramic.textDim,
    border: ceramic.border,
  } : themeBase;
  const { requireLevel } = useVerificationGate();

  const [catalog, setCatalog] = useState([]);
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  const [selectedId, setSelectedId] = useState(null);
  const [liveById, setLiveById] = useState({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [plate, setPlate] = useState('');
  const [lookup, setLookup] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [manualLookup, setManualLookup] = useState(null);
  const [manualLookupLoading, setManualLookupLoading] = useState(false);
  const [privateContext, setPrivateContext] = useState({ vehicles: [], deals: [], trips: [] });
  const [contextToken, setContextToken] = useState(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [selectedDealId, setSelectedDealId] = useState(null);
  const [showManualLookup, setShowManualLookup] = useState(false);
  const checkpointCarouselRef = useRef(null);
  const checkpointCarouselX = useRef(0);

  const countryName = useCallback((code) => {
    const normalizedCode = String(code || '').trim().toUpperCase();
    const meta = COUNTRY[normalizedCode] || { RU: normalizedCode, KK: normalizedCode, EN: normalizedCode, ZH: normalizedCode };
    return meta[lang] || meta.RU || normalizedCode;
  }, [lang]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const data = await fetchJson(`${BASE}/catalog`);
      const nextCatalog = Array.isArray(data?.checkpoints) ? data.checkpoints : [];
      setCatalog(nextCatalog);
      setCountries(Array.isArray(data?.countries) ? data.countries : []);
      if (!nextCatalog.length) setCatalogError(L.sourceError);
    } catch {
      setCatalogError(L.sourceError);
    } finally { setCatalogLoading(false); }
  }, [L.sourceError]);

  useEffect(() => {
    loadCatalog().catch(() => setCatalogLoading(false));
    storage.get(FAVORITES_KEY).then((raw) => setFavorites(jsonArray(raw).map(String))).catch(() => {});
  }, [loadCatalog]);

  const loadPrivateContext = useCallback(async () => {
    setContextLoading(true);
    const applyContext = (next) => {
      setPrivateContext(next);
      if (isDriver) {
        const firstDeal = next.deals.find((item) => item?.plate) || next.deals[0] || null;
        const preferredVehicle = firstDeal?.vehicle_id || next.vehicles[0]?.id || null;
        setSelectedVehicleId((current) => current || preferredVehicle);
        setSelectedDealId((current) => current || firstDeal?.deal_id || null);
      } else {
        setSelectedDealId((current) => current || next.deals[0]?.deal_id || null);
      }
    };
    try {
      const token = await storage.get('ur_reg_token').catch(() => null);
      setContextToken(token || null);
      if (!token) {
        applyContext({ vehicles: [], deals: [], trips: [] });
        return;
      }
      try {
        const response = await fetch(`${BASE}/context`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.detail || `HTTP ${response.status}`);
        applyContext({
          vehicles: Array.isArray(data?.vehicles) ? data.vehicles : [],
          deals: Array.isArray(data?.deals) ? data.deals : [],
          trips: Array.isArray(data?.trips) ? data.trips : [],
        });
        return;
      } catch {
        // Rolling-deploy compatibility: a new mobile build may reach production
        // before /borders/context is deployed. Reconstruct the same view from
        // already-live vehicle/market APIs instead of showing an empty screen.
      }

      const activeStatuses = new Set(['accepted', 'in_progress', 'at_border', 'delivered', 'received']);
      const [vehicleResult, dashboard] = await Promise.all([
        isDriver ? vehicleAPI.list().catch(() => ({ ok: false, vehicles: [] })) : Promise.resolve({ ok: true, vehicles: [] }),
        marketAPI.myDashboard({ force: true }).catch(() => ({ my_deals: [], my_trips: [] })),
      ]);
      const vehicles = vehicleResult?.ok && Array.isArray(vehicleResult.vehicles) ? vehicleResult.vehicles : [];
      const rawDeals = (Array.isArray(dashboard?.my_deals) ? dashboard.my_deals : [])
        .filter((item) => activeStatuses.has(item?.status))
        .slice(0, 30);
      const deals = await Promise.all(rawDeals.map(async (item) => {
        const dealId = item?.deal_id || item?.id;
        let full = {};
        if (dealId) {
          try {
            const fetched = await marketAPI.getDeal(dealId);
            if (fetched && fetched.ok !== false) full = fetched;
          } catch { /* fallback stays useful without enrichment */ }
        }
        let plate = full?.plate || item?.plate || item?.vehicle_plate_snapshot || null;
        let make = full?.vehicle_make_snapshot || item?.vehicle_make_snapshot || null;
        let model = full?.vehicle_model_snapshot || item?.vehicle_model_snapshot || null;
        let vehicleCountry = full?.vehicle_country_snapshot || item?.vehicle_country_snapshot || null;
        if (!plate && item?.driver_id) {
          try {
            const profileResponse = await fetch(`${API_BASE}/market/driver-profile/${encodeURIComponent(item.driver_id)}`);
            if (profileResponse.ok) {
              const profile = await profileResponse.json();
              plate = profile?.vehicle_plate || plate;
              make = profile?.vehicle_brand || make;
              vehicleCountry = profile?.vehicle_registration_country_code || vehicleCountry;
            }
          } catch { /* approved-profile fallback is optional */ }
        }
        return {
          ...item, ...full, deal_id: dealId,
          plate, make, model, vehicle_country: vehicleCountry,
          driver_name: full?.driver_name || item?.driver_name || null,
        };
      }));
      applyContext({
        vehicles,
        deals,
        trips: Array.isArray(dashboard?.my_trips) ? dashboard.my_trips : [],
      });
    } catch {
      applyContext({ vehicles: [], deals: [], trips: [] });
    } finally {
      setContextLoading(false);
    }
  }, [isDriver]);

  useEffect(() => { loadPrivateContext(); }, [loadPrivateContext]);

  const selectedDeal = useMemo(() => {
    const byId = privateContext.deals.find((item) => String(item.deal_id) === String(selectedDealId));
    if (byId) return byId;
    return isDriver ? null : (privateContext.deals[0] || null);
  }, [privateContext.deals, selectedDealId, isDriver]);

  const selectedVehicle = useMemo(() => {
    const byId = privateContext.vehicles.find((item) => String(item.id) === String(selectedVehicleId));
    return byId || privateContext.vehicles[0] || null;
  }, [privateContext.vehicles, selectedVehicleId]);

  const activePlate = useMemo(() => {
    if (isDriver) return selectedDeal?.plate || selectedVehicle?.license_plate || '';
    return selectedDeal?.plate || '';
  }, [isDriver, selectedDeal, selectedVehicle]);

  const cycleVehicle = useCallback(() => {
    if (!isDriver || privateContext.vehicles.length < 2) return;
    const current = privateContext.vehicles.findIndex((item) => String(item.id) === String(selectedVehicle?.id));
    const next = privateContext.vehicles[(current + 1) % privateContext.vehicles.length];
    setSelectedVehicleId(next?.id || null);
    const matchingDeal = privateContext.deals.find((item) => String(item.vehicle_id) === String(next?.id));
    setSelectedDealId(matchingDeal?.deal_id || null);
  }, [isDriver, privateContext.vehicles, privateContext.deals, selectedVehicle]);

  const countryCodes = useMemo(() => {
    const available = new Set(countries.map((item) => String(item.country || '').trim().toUpperCase()).filter(Boolean));
    const ordered = COUNTRY_ORDER.filter((code) => available.has(code) || ['CN', 'KG', 'RU'].includes(code));
    for (const code of available) if (!ordered.includes(code)) ordered.push(code);
    return ordered;
  }, [countries]);

  const visible = useMemo(() => {
    const rows = selectedCountry === 'ALL' ? catalog : catalog.filter((item) => String(item.country || '').trim().toUpperCase() === selectedCountry);
    return [...rows].sort((a, b) => {
      const af = favorites.includes(String(a.id)) ? 0 : 1;
      const bf = favorites.includes(String(b.id)) ? 0 : 1;
      return af !== bf ? af - bf
        : localizeCheckpointName(a, lang).localeCompare(localizeCheckpointName(b, lang));
    });
  }, [catalog, selectedCountry, favorites, lang]);

  const selected = useMemo(() => catalog.find((item) => String(item.id) === String(selectedId)) || null, [catalog, selectedId]);
  const live = selectedId ? liveById[String(selectedId)] : null;
  const calendarRows = useMemo(() => completeBookingCalendar(live), [live]);

  const loadLive = useCallback(async (checkpoint, force = false) => {
    if (!checkpoint || liveLoading) return;
    setSelectedId(checkpoint.id);
    setLiveLoading(true);
    setLiveError('');
    try {
      const data = await fetchJson(`${BASE}/live/${encodeURIComponent(checkpoint.id)}${force ? '?force=true' : ''}`);
      setLiveById((previous) => ({ ...previous, [String(checkpoint.id)]: data }));
    } catch { setLiveError(L.sourceError); }
    finally { setLiveLoading(false); }
  }, [liveLoading, L.sourceError]);

  const selectCountry = useCallback((code) => {
    setSelectedCountry(code);
    setSelectedId(null);
    setLiveError('');
    checkpointCarouselX.current = 0;
    checkpointCarouselRef.current?.scrollTo({ x: 0, animated: false });
  }, []);

  const toggleFavorite = useCallback(async () => {
    if (!selectedId) return;
    const id = String(selectedId);
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [id, ...favorites.filter((value) => value !== id)].slice(0, 12);
    setFavorites(next);
    await storage.set(FAVORITES_KEY, JSON.stringify(next));
  }, [selectedId, favorites]);

  const lookupPlateValue = useCallback(async (value) => {
    const normalized = normalizePlate(value);
    if (normalized.length < 3) return;
    setLookupLoading(true);
    setLookup(null);
    try {
      const result = await fetchJson(`${BASE}/lookup?plate=${encodeURIComponent(normalized)}`);
      setLookup(result);
    } catch { setLookup({ error: true }); }
    finally { setLookupLoading(false); }
  }, []);

  const searchPlate = useCallback(async () => {
    const normalized = normalizePlate(plate);
    if (normalized.length < 3 || manualLookupLoading) return;
    setPlate(normalized);
    setManualLookupLoading(true);
    setManualLookup(null);
    try { setManualLookup(await fetchJson(`${BASE}/lookup?plate=${encodeURIComponent(normalized)}`)); }
    catch { setManualLookup({ error: true }); }
    finally { setManualLookupLoading(false); }
  }, [plate, manualLookupLoading]);

  useEffect(() => {
    const normalized = normalizePlate(activePlate);
    if (!normalized) return;
    setPlate(normalized);
    lookupPlateValue(normalized);
  }, [activePlate, lookupPlateValue]);

  useEffect(() => {
    if (!isDriver || !contextToken || !selectedDeal || normalizePlate(activePlate).length < 3) return;
    fetch(`${BASE}/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${contextToken}` },
      body: JSON.stringify({ plate: normalizePlate(activePlate) }),
    }).catch(() => {});
  }, [isDriver, contextToken, selectedDeal, activePlate]);

  useEffect(() => {
    if (!lookup?.found || !lookup?.checkpoint || !catalog.length || selectedId) return;
    const target = String(lookup.checkpoint).trim().toLowerCase();
    const match = catalog.find((item) => String(item.name_ru || item.name || '').trim().toLowerCase() === target);
    if (match) loadLive(match).catch(() => {});
  }, [lookup, catalog, selectedId, loadLive]);

  const nearestText = live?.nearest_booking ? formatDate(live.nearest_booking, lang) : '—';
  const premiumText = live?.nearest_premium_booking ? formatDate(live.nearest_premium_booking, lang) : null;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: v1.bg }]} edges={['top']} testID="border-screen-v2">
      {isDriver ? <DriverRouteBackdrop /> : null}
      <RootHeader compact ceramic={isDriver} navigation={navigation} role={role} testID="queue-root-header" menuTestID="queue-root-header-menu" />

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {isDriver ? (
          <View style={[s.contextCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-driver-vehicle-card">
            <View style={s.contextHeader}>
              <View style={s.contextTitleRow}><Feather name="truck" size={20} color={theme.textMuted} /><Text style={[s.contextTitle, { color: theme.text }]}>{R.myVehicle}</Text></View>
              {privateContext.vehicles.length > 1 ? <TouchableOpacity onPress={cycleVehicle} style={[s.smallAction, { backgroundColor: v1.surfaceMuted }]}><Text style={[s.smallActionText, { color: theme.text }]}>{R.change}</Text><Feather name="chevron-down" size={16} color={theme.textMuted} /></TouchableOpacity> : null}
            </View>
            {contextLoading ? <ActivityIndicator color={activeColor} style={{ marginVertical: 14 }} /> : selectedVehicle || selectedDeal ? (
              <View style={s.vehicleBody}>
                <View style={[s.vehicleIconWrap, { backgroundColor: v1.surfaceMuted }]}><Feather name="truck" size={34} color={activeColor} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.vehicleName, { color: theme.text }]}>{[selectedDeal?.make || selectedVehicle?.make, selectedDeal?.model || selectedVehicle?.model].filter(Boolean).join(' ') || selectedVehicle?.vehicle_type || '—'}</Text>
                  <View style={s.plateRow}><Text style={[s.plateBadge, { color: theme.text, borderColor: theme.border }]}>{normalizePlate(activePlate) || '—'}</Text>{(selectedDeal?.vehicle_country || selectedVehicle?.vehicle_registration_country_code) ? <Text style={[s.countryBadge, { color: theme.textMuted }]}>{selectedDeal?.vehicle_country || selectedVehicle?.vehicle_registration_country_code}</Text> : null}</View>
                  {selectedDeal ? <Text style={[s.routeLine, { color: theme.textMuted }]}>{selectedDeal.from_city} → {selectedDeal.to_city}</Text> : null}
                </View>
              </View>
            ) : <Text style={[s.emptyContext, { color: theme.textMuted }]}>{R.noVehicle}</Text>}
          </View>
        ) : (
          <View style={[s.contextCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-shipper-deals-card">
            <View style={s.contextHeader}>
              <View style={s.contextTitleRow}><Feather name="truck" size={20} color={theme.textMuted} /><Text style={[s.contextTitle, { color: theme.text }]}>{R.myBorderDeals}</Text></View>
              <View style={s.headerPills}><View style={s.countPill}><Text style={s.countPillText}>{privateContext.deals.length} {R.active}</Text></View><View style={s.onlinePill}><View style={s.onlineDot} /><Text style={s.onlineText}>{R.cgrOnline}</Text></View></View>
            </View>
            {contextLoading ? <ActivityIndicator color={activeColor} style={{ marginVertical: 14 }} /> : privateContext.deals.length ? privateContext.deals.slice(0, 4).map((item) => {
              const activeDeal = String(item.deal_id) === String(selectedDeal?.deal_id);
              return <TouchableOpacity key={item.deal_id} onPress={() => setSelectedDealId(item.deal_id)} style={[s.shipmentRow, { borderColor: activeDeal ? activeColor : theme.border, backgroundColor: activeDeal ? activeColor + '0D' : v1.surfaceMuted }]} testID="border-shipper-deal-row">
                <View style={[s.shipmentTruck, { backgroundColor: theme.card }]}><Feather name="truck" size={26} color={activeColor} /></View>
                <View style={{ flex: 1 }}><Text style={[s.shipmentRoute, { color: theme.text }]}>{item.from_city} → {item.to_city}</Text><Text style={[s.shipmentMeta, { color: theme.textMuted }]}>{item.driver_name || '—'} · {[item.make, item.model].filter(Boolean).join(' ') || '—'} · {normalizePlate(item.plate) || '—'}</Text></View>
                <Feather name="chevron-right" size={20} color={theme.textDim} />
              </TouchableOpacity>;
            }) : <Text style={[s.emptyContext, { color: theme.textMuted }]}>{R.noActiveShipments}</Text>}
          </View>
        )}

        {activePlate ? <View style={[s.personalStatusCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-personal-cgr-status">
          <View style={s.contextHeader}><View style={s.contextTitleRow}><Feather name="activity" size={19} color={activeColor} /><Text style={[s.contextTitle, { color: theme.text }]}>{R.liveStatus}</Text></View>{lookup?.found && lookup?.status ? <View style={[s.statusPill, { backgroundColor: lookup.status === 'called' ? '#E8F1FF' : lookup.status === 'revoked' ? '#FDECEC' : '#E9F8EE' }]}><Text style={[s.statusPillText, { color: lookup.status === 'revoked' ? '#B42318' : lookup.status === 'called' ? '#1769E0' : '#168759' }]}>{lookupStatusLabel(lookup.status, lang)}</Text></View> : null}</View>
          {lookupLoading ? <ActivityIndicator color={activeColor} style={{ marginVertical: 12 }} /> : lookup?.error ? <Text style={[s.lookupText, { color: '#B42318' }]}>{L.lookupError}</Text> : lookup?.found ? <>
            <Text style={[s.personalCheckpoint, { color: theme.text }]}>{localizeCheckpointName(lookup.checkpoint, lang)}</Text>
            <View style={s.personalMetaRow}><Feather name="calendar" size={15} color={theme.textMuted} /><Text style={[s.lookupText, { color: theme.textMuted }]}>{L.queueTime}: {lookup.queue_datetime || '—'}</Text></View>
            <View style={s.personalMetaRow}><Feather name={lookup.is_late ? 'alert-circle' : 'check-circle'} size={15} color={lookup.is_late ? '#B7791F' : '#168759'} /><Text style={[s.lookupText, { color: lookup.is_late ? '#B7791F' : '#168759' }]}>{lookup.is_late ? R.late : R.onTime}</Text></View>
            {selectedDeal ? <View style={s.personalMetaRow}><Feather name="navigation" size={15} color={activeColor} /><Text style={[s.lookupText, { color: theme.textMuted }]}>{selectedDeal.location ? `${R.gpsOnline} · ${formatSourceTime(selectedDeal.location.updated_at)}` : R.gpsUnavailable}</Text></View> : null}
          </> : <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.notFound}</Text>}
          {selectedDeal && !isDriver ? <View style={s.dealActions}><TouchableOpacity onPress={() => navigation.navigate('Chat', { roomId: selectedDeal.chat_room_id, dealId: selectedDeal.deal_id, role })} style={[s.primaryDealAction, { backgroundColor: activeColor }]}><Feather name="file-text" size={17} color="#fff" /><Text style={s.primaryDealActionText}>{R.openDeal}</Text></TouchableOpacity><TouchableOpacity onPress={() => navigation.navigate('Chat', { roomId: selectedDeal.chat_room_id, dealId: selectedDeal.deal_id, role, action: 'status-history' })} style={[s.secondaryDealAction, { borderColor: theme.border }]}><Feather name="clock" size={17} color={theme.textMuted} /><Text style={[s.secondaryDealActionText, { color: theme.text }]}>{R.history}</Text></TouchableOpacity><TouchableOpacity onPress={() => navigation.navigate('Chat', { roomId: selectedDeal.chat_room_id, dealId: selectedDeal.deal_id, role })} style={[s.secondaryDealAction, { borderColor: theme.border }]}><Feather name="message-circle" size={17} color={theme.textMuted} /><Text style={[s.secondaryDealActionText, { color: theme.text }]}>{R.messageDriver}</Text></TouchableOpacity></View> : null}
          {isDriver && selectedDeal ? <View style={s.dealActions}><View style={[s.primaryDealAction, { backgroundColor: activeColor }]}><Feather name="radio" size={17} color="#fff" /><Text style={s.primaryDealActionText}>{R.trackingOn}</Text></View><TouchableOpacity onPress={() => setShowManualLookup((value) => !value)} style={[s.secondaryDealAction, { borderColor: theme.border }]}><Feather name="search" size={17} color={theme.textMuted} /><Text style={[s.secondaryDealActionText, { color: theme.text }]}>{R.checkOther}</Text></TouchableOpacity></View> : null}
        </View> : null}

        <View style={s.sectionHeadingRow}><Text style={[s.sectionTitle, { color: theme.text }]}>{R.borderSituation}</Text><Text style={[s.source, { color: theme.textDim }]}>CGR</Text></View>
        <Text style={[s.label, { color: theme.text }]}>{L.where}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} testID="border-country-filter">
          {countryCodes.map((code) => {
            const active = selectedCountry === code;
            return (
              <TouchableOpacity key={code} onPress={() => selectCountry(code)} style={[s.countryChip, { borderColor: active ? activeColor : theme.border, backgroundColor: active ? activeColor : theme.card }]} testID={`border-country-${code}`}>
                <CountryFlag code={code} width={22} />
                <Text style={[s.countryText, { color: active ? '#FFFFFF' : theme.text }]}>{countryName(code)}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={() => selectCountry('ALL')} style={[s.countryChip, { borderColor: selectedCountry === 'ALL' ? activeColor : theme.border, backgroundColor: selectedCountry === 'ALL' ? activeColor : theme.card }]} testID="border-country-ALL">
            <Text style={[s.countryText, { color: selectedCountry === 'ALL' ? '#FFFFFF' : theme.text }]}>🌐 {L.all}</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={s.selectorHead}>
          <View style={{ flex: 1 }}><Text style={[s.sectionTitle, { color: theme.text }]}>{L.choose}</Text><Text style={[s.hint, { color: theme.textDim }]}>{L.hint}</Text></View>
          <TouchableOpacity onPress={() => {
            const next = checkpointCarouselX.current + 300;
            checkpointCarouselRef.current?.scrollTo({ x: next, animated: true });
            checkpointCarouselX.current = next;
          }} style={[s.carouselNext, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-checkpoint-next"><Feather name="chevrons-right" size={21} color={activeColor} /></TouchableOpacity>
        </View>

        {catalogLoading ? <View style={s.center}><ActivityIndicator color={activeColor} /></View> : catalogError ? (
          <View style={[s.errorCard, { backgroundColor: theme.card }]} testID="border-catalog-error">
            <Feather name="alert-circle" size={20} color="#B42318" />
            <Text style={[s.errorText, { color: theme.textMuted }]}>{catalogError}</Text>
            <TouchableOpacity onPress={() => loadCatalog()} testID="border-catalog-retry"><Text style={s.retry}>{L.refresh}</Text></TouchableOpacity>
          </View>
        ) : (
          <ScrollView ref={checkpointCarouselRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.carousel} onScroll={(event) => { checkpointCarouselX.current = event.nativeEvent.contentOffset.x; }} scrollEventThrottle={16} testID="border-checkpoint-carousel">
            {visible.map((checkpoint) => {
              const active = String(selectedId) === String(checkpoint.id);
              const loaded = liveById[String(checkpoint.id)];
              return (
                <TouchableOpacity key={String(checkpoint.id)} onPress={() => loadLive(checkpoint)} style={[s.cpCard, { backgroundColor: theme.card, borderColor: active ? activeColor : theme.border }, active && s.cpCardActive]} testID="border-checkpoint-chip">
                  <View style={s.cpTop}><Text style={[s.cpName, { color: theme.text }]} numberOfLines={1}>{localizeCheckpointName(checkpoint, lang).split(' - ')[0]}</Text>{favorites.includes(String(checkpoint.id)) ? <Feather name="star" size={14} color={activeColor} fill={activeColor} /> : null}</View>
                  <Text style={[s.cpRoute, { color: theme.textDim, fontSize: sp(10.5) }]} numberOfLines={1}>{localizeCheckpointName(checkpoint, lang)}</Text>
                  {loaded?.nearest_booking ? <Text style={s.cpLoadedText}>📅 {formatShortDate(loaded.nearest_booking, lang)}</Text> : <Text style={[s.tapText, { color: active ? activeColor : theme.textDim }]}>{active ? L.selected : L.tapToOpen}</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {!selected ? <View style={[s.promptCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-lazy-prompt"><Feather name="mouse-pointer" size={20} color={activeColor} /><Text style={[s.promptText, { color: theme.textMuted }]}>{L.tap}</Text></View> : null}
        {selected && liveLoading && !live ? <View style={[s.liveCard, { backgroundColor: theme.card, borderColor: ceramic.border }]} testID="border-live-loading"><ActivityIndicator color={activeColor} size="large" /><Text style={[s.loadingText, { color: theme.textMuted }]}>{L.loading}</Text></View> : null}
        {selected && liveError ? <View style={[s.errorCard, { backgroundColor: theme.card }]}><Feather name="alert-circle" size={20} color="#B42318" /><Text style={[s.errorText, { color: theme.textMuted }]}>{liveError}</Text><TouchableOpacity onPress={() => loadLive(selected, true)}><Text style={s.retry}>{L.refresh}</Text></TouchableOpacity></View> : null}

        {selected && live ? (
          <View style={[s.liveCard, { backgroundColor: theme.card, borderColor: ceramic.border }]} testID="border-selected-card">
            <View style={s.liveHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}><Text style={[s.liveTitle, { color: theme.text }]}>{localizeCheckpointName({ ...selected, name: live.name || selected.name }, lang)}</Text><View style={s.liveCountryRow}>{selected.country ? <CountryFlag code={selected.country} width={20} /> : null}<Text style={[s.liveCountry, { color: theme.textMuted }]}>{selected.country ? countryName(selected.country) : ''}</Text></View></View>
              <TouchableOpacity onPress={toggleFavorite} style={[s.iconButton, { borderColor: theme.border }]} accessibilityRole="button" accessibilityLabel={t('a11y_toggle_favorite')} accessibilityState={{ selected: favorites.includes(String(selectedId)) }}><Feather name="star" size={19} color={activeColor} fill={favorites.includes(String(selectedId)) ? activeColor : 'transparent'} /></TouchableOpacity>
            </View>

            <View style={[s.heroBooking, { backgroundColor: v1.surfaceMuted }]}>
              <Text style={[s.heroLabel, { color: theme.textMuted }]}>{L.nearest}</Text>
              <Text style={[s.heroDate, { color: theme.text }]}>{nearestText}</Text>
              {live.nearest_booking_free != null ? <View style={s.freeBadge}><Text style={s.freeBadgeText}>{live.nearest_booking_free} {L.places} · {L.standard}</Text></View> : <Text style={[s.noBooking, { color: theme.textMuted }]}>{L.noStandard}</Text>}
            </View>

            {premiumText ? <View style={[s.premiumRow, { borderColor: theme.border }]}><Text style={[s.metricLabel, { color: theme.textMuted }]}>{L.premiumNearest}</Text><Text style={[s.premiumValue, { color: theme.text }]}>{premiumText} · {live.nearest_premium_free ?? '—'} {L.places}</Text></View> : null}

            <View style={[s.metrics, { borderColor: theme.border }]}>
              <View style={s.metric}><Text style={[s.metricLabel, { color: theme.textMuted }]}>{L.board}</Text><Text style={[s.metricValue, { color: theme.text }]}>{live.current_board_count ?? '—'}</Text></View>
              <View style={[s.metricDivider, { backgroundColor: theme.border }]} />
              <View style={s.metric}><Text style={[s.metricLabel, { color: theme.textMuted }]}>{L.limit}</Text><Text style={[s.metricValue, { color: theme.text }]}>{live.daily_capacity != null ? `${live.daily_capacity}${L.perDay}` : '—'}</Text></View>
            </View>

            <View style={s.calendarHead}><Text style={[s.sectionTitleSmall, { color: theme.text }]}>{L.calendar}</Text><Text style={[s.swipeHint, { color: theme.textDim, fontSize: sp(10.5) }]}>{L.swipeCalendar}</Text></View>
            <FlatList
              horizontal
              data={calendarRows}
              keyExtractor={(item) => item.date}
              renderItem={({ item }) => {
                const standardFree = Number(item.standard_free || 0);
                const premiumFree = Number(item.premium_free || 0);
                const hasStandard = standardFree > 0;
                const hasPremium = !hasStandard && premiumFree > 0;
                return (
                  <View style={[s.dateCard, { borderColor: item.is_day_off ? theme.border : hasStandard ? ceramic.active : hasPremium ? '#B58A52' : '#C98B8B', backgroundColor: item.is_day_off ? v1.bg : theme.card }]} testID="border-booking-date-card">
                    <Text style={[s.dateText, { color: theme.text }]}>{formatShortDate(item.date, lang)}</Text>
                    {item.is_day_off ? <Text style={[s.dateState, { color: theme.textDim, fontSize: sp(9.5) }]}>{L.dayOff}</Text> : hasStandard ? <><Text style={s.dateFree}>{standardFree}</Text><Text style={[s.dateState, { color: activeColor, fontSize: sp(9.5) }]}>{L.standard}</Text><Text style={[s.dateAmount, { color: activeColor, fontSize: sp(8.5) }]}>{formatKztAmount(1)}</Text></> : hasPremium ? <><Text style={s.datePremium}>{premiumFree}</Text><Text style={[s.dateState, { color: '#B7791F', fontSize: sp(9.5) }]}>{L.premium}</Text><Text style={[s.dateAmount, { color: '#B7791F', fontSize: sp(8.5) }]}>{formatKztAmount(100)}</Text></> : <Text style={[s.dateState, { color: '#B42318', fontSize: sp(9.5) }]}>{L.noPlaces}</Text>}
                  </View>
                );
              }}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.dateStrip}
              ListFooterComponent={<View style={{ width: 30 }} />}
              nestedScrollEnabled
              directionalLockEnabled
              removeClippedSubviews={false}
              initialNumToRender={12}
              windowSize={15}
              style={s.calendarList}
              testID="border-booking-calendar"
            />

            <View style={s.sourceRow}><Text style={[s.source, { color: theme.textDim }]}>{L.updated}: {formatSourceTime(live.source_updated_at || live.fetched_at)}</Text><TouchableOpacity onPress={() => loadLive(selected, true)} disabled={liveLoading} style={s.refreshButton}>{liveLoading ? <ActivityIndicator size="small" color={activeColor} /> : <Feather name="refresh-cw" size={16} color={activeColor} />}<Text style={s.refreshText}>{L.refresh}</Text></TouchableOpacity></View>
            <TouchableOpacity onPress={() => Linking.openURL(live.official_url || 'https://cgr.qoldau.kz/ru/start').catch(() => {})} style={s.cgrButton}><Feather name="external-link" size={17} color="#FFFFFF" /><Text style={s.cgrButtonText}>{L.details}</Text></TouchableOpacity>
          </View>
        ) : null}

        {isDriver && showManualLookup ? <View style={[s.searchCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-plate-search">
          <Text style={[s.sectionTitle, { color: theme.text }]}>{R.checkOther}</Text>
          <View style={s.searchRow}><View style={[s.inputWrap, { backgroundColor: v1.bg, borderColor: theme.border }]}><Feather name="truck" size={17} color={theme.textMuted} /><TextInput value={plate} onChangeText={(value) => { setPlate(value.toUpperCase()); setManualLookup(null); }} onSubmitEditing={searchPlate} placeholder={L.platePlaceholder} placeholderTextColor={theme.textDim} autoCapitalize="characters" autoCorrect={false} style={[s.input, { color: theme.text }]} testID="border-plate-input" /></View><TouchableOpacity onPress={searchPlate} disabled={normalizePlate(plate).length < 3 || manualLookupLoading} style={[s.checkButton, (normalizePlate(plate).length < 3 || manualLookupLoading) && s.disabled]} testID="border-plate-check">{manualLookupLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.checkText}>{L.check}</Text>}</TouchableOpacity></View>
        {manualLookup ? <View style={[s.lookup, { borderTopColor: theme.border }]}>{manualLookup.error ? <Text style={[s.lookupText, { color: '#B42318' }]}>{L.lookupError}</Text> : manualLookup.found ? <><Text style={[s.lookupPlate, { color: theme.text }]}>{manualLookup.plate || normalizePlate(plate)}</Text>{manualLookup.status ? <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.status}: {lookupStatusLabel(manualLookup.status, lang)}</Text> : null}{manualLookup.checkpoint ? <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.checkpoint}: {localizeCheckpointName(manualLookup.checkpoint, lang)}</Text> : null}{manualLookup.queue_datetime ? <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.queueTime}: {manualLookup.queue_datetime}</Text> : null}</> : <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.notFound}</Text>}</View> : null}
        </View> : null}
        <View style={{ height: 34 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 14, paddingTop: 0, paddingBottom: 18 },
  contextCard: { borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 10 },
  contextHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  contextTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  contextTitle: { fontSize: 16, fontWeight: '850' },
  smallAction: { minHeight: 34, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  smallActionText: { fontSize: 12.5, fontWeight: '750' },
  vehicleBody: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 11 },
  vehicleIconWrap: { width: 68, height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  vehicleName: { fontSize: 18, fontWeight: '900' },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  plateBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, fontSize: 15, fontWeight: '900', letterSpacing: 0.4 },
  countryBadge: { fontSize: 11.5, fontWeight: '800' },
  routeLine: { fontSize: 13, marginTop: 6, fontWeight: '650' },
  emptyContext: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  headerPills: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  countPill: { backgroundColor: '#E9F2FF', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  countPillText: { color: '#1769E0', fontSize: 11.5, fontWeight: '800' },
  onlinePill: { backgroundColor: '#E9F8EE', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#168759' },
  onlineText: { color: '#168759', fontSize: 11.5, fontWeight: '800' },
  shipmentRow: { borderWidth: 1, borderRadius: 14, padding: 10, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  shipmentTruck: { width: 48, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  shipmentRoute: { fontSize: 14.5, fontWeight: '850' },
  shipmentMeta: { fontSize: 11.5, marginTop: 4 },
  personalStatusCard: { borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 10 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontSize: 11.5, fontWeight: '850' },
  personalCheckpoint: { fontSize: 19, fontWeight: '900', marginTop: 10, marginBottom: 6 },
  personalMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  dealActions: { flexDirection: 'row', gap: 7, marginTop: 12, flexWrap: 'wrap' },
  primaryDealAction: { minHeight: 42, borderRadius: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryDealActionText: { color: '#fff', fontSize: 12, fontWeight: '850' },
  secondaryDealAction: { minHeight: 42, borderRadius: 11, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryDealActionText: { fontSize: 11.5, fontWeight: '800' },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, marginBottom: 8 },
  label: { fontSize: 15, fontWeight: '800', marginBottom: 9 },
  chips: { gap: 8, paddingRight: 18, paddingBottom: 5 },
  countryChip: { minHeight: 38, borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  countryText: { fontSize: 13, fontWeight: '700' },
  selectorHead: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '850' },
  sectionTitleSmall: { fontSize: 15, fontWeight: '850' },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 3, paddingRight: 12 },
  carouselNext: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  carousel: { gap: 10, paddingRight: 28, paddingBottom: 4 },
  cpCard: { width: 140, minHeight: 94, borderWidth: 1, borderRadius: 16, padding: 12 },
  cpCardActive: { borderWidth: 2, padding: 11, shadowColor: '#738396', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  cpTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 5 },
  cpName: { fontSize: 15, fontWeight: '850', flex: 1 },
  cpRoute: { fontSize: 10.5, marginTop: 5 },
  cpLoadedText: { color: '#738396', fontSize: 12, fontWeight: '800', marginTop: 10 },
  tapText: { fontSize: 11, fontWeight: '700', marginTop: 11 },
  center: { height: 100, alignItems: 'center', justifyContent: 'center' },
  promptCard: { borderWidth: 1, borderRadius: 18, padding: 18, marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  promptText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '650' },
  liveCard: { borderWidth: 1, borderRadius: 20, padding: 17, marginTop: 16, overflow: 'hidden' },
  loadingText: { textAlign: 'center', marginTop: 10, fontSize: 13 },
  liveHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  liveTitle: { fontSize: 20, lineHeight: 25, fontWeight: '900' },
  liveCountryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  liveCountry: { fontSize: 13 },
  iconButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heroBooking: { borderRadius: 14, padding: 14, marginTop: 15, alignItems: 'flex-start' },
  heroLabel: { fontSize: 12.5, fontWeight: '750' },
  heroDate: { fontSize: 28, lineHeight: 34, fontWeight: '900', marginTop: 4 },
  freeBadge: { backgroundColor: '#738396', borderRadius: 9, paddingVertical: 6, paddingHorizontal: 10, marginTop: 9 },
  freeBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  noBooking: { fontSize: 12, marginTop: 8 },
  premiumRow: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  premiumValue: { fontSize: 14, fontWeight: '800', marginTop: 3 },
  metrics: { flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderRadius: 15, marginTop: 12, overflow: 'hidden' },
  metric: { flex: 1, paddingVertical: 13, paddingHorizontal: 14 },
  metricDivider: { width: 1 },
  metricLabel: { fontSize: 11.5, fontWeight: '700' },
  metricValue: { fontSize: 22, fontWeight: '900', marginTop: 3 },
  calendarHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 17, marginBottom: 9 },
  swipeHint: { fontSize: 10.5, fontWeight: '650' },
  calendarList: { width: '100%', overflow: 'visible' },
  dateStrip: { gap: 8, paddingRight: 4, paddingBottom: 4 },
  dateCard: { width: 90, minHeight: 101, borderWidth: 1, borderRadius: 13, padding: 9, alignItems: 'center', justifyContent: 'center' },
  dateText: { fontSize: 12, fontWeight: '850' },
  dateFree: { color: '#738396', fontSize: 20, fontWeight: '950', marginTop: 5 },
  datePremium: { color: '#B7791F', fontSize: 20, fontWeight: '950', marginTop: 5 },
  dateState: { fontSize: 9.5, fontWeight: '700', textAlign: 'center', marginTop: 3 },
  dateAmount: { fontSize: 8.5, lineHeight: 11, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15 },
  source: { fontSize: 11 },
  refreshButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  refreshText: { color: '#738396', fontWeight: '800', fontSize: 12 },
  cgrButton: { minHeight: 46, borderRadius: 10, backgroundColor: '#738396', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  cgrButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '850' },
  errorCard: { borderWidth: 1, borderColor: '#F2C7C7', borderRadius: 16, marginTop: 16, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  retry: { color: '#738396', fontWeight: '850' },
  searchCard: { borderWidth: 1, borderRadius: 18, padding: 15, marginTop: 18 },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  inputWrap: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, fontSize: 14, minHeight: 44 },
  checkButton: { minWidth: 94, minHeight: 46, borderRadius: 10, backgroundColor: '#738396', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 },
  checkText: { color: '#FFFFFF', fontSize: 13, fontWeight: '850' },
  disabled: { opacity: 0.45 },
  lookup: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12 },
  lookupPlate: { fontSize: 17, fontWeight: '900', marginBottom: 5 },
  lookupText: { fontSize: 12.5, lineHeight: 19 },
});
