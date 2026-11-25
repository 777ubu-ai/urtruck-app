import { withAdditionalLanguageTree, withAdditionalLanguages, localizeUiText } from '../utils/additionalLocales.js';
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
import { localizePlace } from '../utils/places';
import { storage } from '../utils/storage';
import { vehicleAPI } from '../utils/vehicleAPI';
import { marketAPI } from '../utils/marketAPI';
import { routingAPI } from '../utils/routingAPI';
import { useVerificationGate } from '../components/VerificationGate';
import { LEVELS } from '../utils/AuthContext';

const BASE = `${API_BASE}/borders`;
const FAVORITES_KEY = 'ur_border_favorites_v2';
const RECENT_LOOKUPS_KEY = 'ur_border_recent_lookups_v1';
const DEFAULT_COUNTRY = 'CN';
const COUNTRY_ORDER = ['CN', 'KG', 'RU', 'UZ', 'TM', 'CASPIAN'];

const COUNTRY = {
  CN: { RU: 'Китай', KK: 'Қытай', EN: 'China', ZH: '中国' },
  KG: { RU: 'Кыргызстан', KK: 'Қырғызстан', EN: 'Kyrgyzstan', ZH: '吉尔吉斯斯坦' },
  RU: { RU: 'Россия', KK: 'Ресей', EN: 'Russia', ZH: '俄罗斯' },
  UZ: { RU: 'Узбекистан', KK: 'Өзбекстан', EN: 'Uzbekistan', ZH: '乌兹别克斯坦' },
  TM: { RU: 'Туркменистан', KK: 'Түрікменстан', EN: 'Turkmenistan', ZH: '土库曼斯坦' },
  CASPIAN: { RU: 'Каспий', KK: 'Каспий', EN: 'Caspian', ZH: '里海' },
};
Object.assign(COUNTRY, withAdditionalLanguageTree(COUNTRY));

const COPY = {
  RU: {
    title: 'Граница', subtitle: 'Реальная загрузка и доступная бронь CGR', where: 'Куда едете?', all: 'Все',
    myCarsTab: 'Мои машины', checkpointsTab: 'Пункты пропуска', searchCars: 'Поиск по госномеру', statusNotChecked: 'Нажмите, чтобы проверить очередь', sideKz: 'Казахстан', sideCn: 'Китай',
    choose: 'Выберите КПП', hint: 'Листайте и нажмите нужный пункт — данные загрузятся только для него',
    tap: 'Нажмите на КПП, чтобы увидеть реальную обстановку', loading: 'Получаем данные CGR…',
    nearest: 'Ближайшая свободная бронь', places: 'свободных мест', standard: '1 МРП', premium: '100 МРП',
    premiumNearest: 'Ближайшая бронь за 100 МРП', noStandard: 'Свободных мест за 1 МРП в доступном календаре нет',
    board: 'Сейчас на табло', openBoard: 'Открыть табло', boardTabTitle: 'Онлайн-табло', boardApply: 'Применить', boardFind: 'Найти', boardFound: 'Найдено:', boardNoMatches: 'По этим фильтрам записей нет', boardPrevious: 'Предыдущая страница', boardNext: 'Следующая страница', boardClear: 'Очистить', limit: 'Лимит', perDay: '/сутки', calendar: 'Календарь загрузки', noPlaces: 'Нет мест', noData: 'Нет данных',
    dayOff: 'Выходной', updated: 'CGR обновлено', refresh: 'Обновить', details: 'Бронирование в CarGoRuqsat', favorite: 'В избранное',
    favorited: 'В избранном', sourceError: 'Не удалось получить данные CGR. Повторите.', checkQueue: 'Проверить свою очередь',
    platePlaceholder: 'Госномер, например 123ABC02', check: 'Проверить', notFound: 'Активная очередь не найдена',
    lookupError: 'Не удалось проверить номер', checkpoint: 'КПП', queueTime: 'Время очереди', status: 'Статус',
    cached: 'из кэша UrTruck', live: 'живые данные', selected: 'Выбрано', tapToOpen: 'Нажать', allDates: 'Все даты', collapseDates: 'Свернуть',
  },
  KK: {
    title: 'Шекара', subtitle: 'CGR нақты жүктемесі және қолжетімді бронь', where: 'Қайда барасыз?', all: 'Барлығы',
    myCarsTab: 'Менің көліктерім', checkpointsTab: 'Өткізу бекеттері', searchCars: 'Мемлекеттік нөмір бойынша іздеу', statusNotChecked: 'Кезекті тексеру үшін басыңыз', sideKz: 'Қазақстан', sideCn: 'Қытай',
    choose: 'Өткізу бекетін таңдаңыз', hint: 'Жылжытып, қажет бекетті басыңыз — деректер тек сол бекетке жүктеледі',
    tap: 'Нақты жағдайды көру үшін бекетті басыңыз', loading: 'CGR деректері жүктелуде…', nearest: 'Ең жақын бос бронь',
    places: 'бос орын', standard: '1 АЕК', premium: '100 АЕК', premiumNearest: '100 АЕК бойынша жақын бронь',
    noStandard: 'Қолжетімді күнтізбеде 1 АЕК бойынша бос орын жоқ', board: 'Қазір таблода', openBoard: 'Таблоны ашу', boardTabTitle: 'Онлайн табло', boardApply: 'Қолдану', boardFind: 'Іздеу', boardFound: 'Табылды:', boardNoMatches: 'Бұл сүзгілер бойынша жазба жоқ', boardPrevious: 'Алдыңғы бет', boardNext: 'Келесі бет', boardClear: 'Тазалау', limit: 'Лимит', perDay: '/тәулік',
    calendar: 'Жүктеме күнтізбесі', noPlaces: 'Орын жоқ', noData: 'Дерек жоқ', dayOff: 'Демалыс', updated: 'CGR жаңартылды', refresh: 'Жаңарту',
    details: 'CarGoRuqsat арқылы брондау', favorite: 'Таңдаулыға', favorited: 'Таңдаулыда', sourceError: 'CGR деректерін алу мүмкін болмады.',
    checkQueue: 'Өз кезегіңізді тексеру', platePlaceholder: 'Мемлекеттік нөмір, мысалы 123ABC02', check: 'Тексеру',
    notFound: 'Белсенді кезек табылмады', lookupError: 'Нөмірді тексеру мүмкін болмады', checkpoint: 'Бекет', queueTime: 'Кезек уақыты',
    status: 'Күйі', cached: 'UrTruck кэшінен', live: 'нақты дерек', selected: 'Таңдалды', tapToOpen: 'Басу', allDates: 'Барлық күндер', collapseDates: 'Жию',
  },
  EN: {
    title: 'Border', subtitle: 'Real CGR load and booking availability', where: 'Where are you going?', all: 'All',
    myCarsTab: 'My vehicles', checkpointsTab: 'Checkpoints', searchCars: 'Search by plate', statusNotChecked: 'Tap to check queue', sideKz: 'Kazakhstan', sideCn: 'China',
    choose: 'Choose checkpoint', hint: 'Swipe and tap a checkpoint — data loads only for that checkpoint',
    tap: 'Tap a checkpoint to see the real situation', loading: 'Loading CGR data…', nearest: 'Nearest free booking',
    places: 'free slots', standard: '1 MCI', premium: '100 MCI', premiumNearest: 'Nearest 100 MCI booking',
    noStandard: 'No 1 MCI slots in the published calendar', board: 'On live board now', openBoard: 'Open board', boardTabTitle: 'Online board', boardApply: 'Apply', boardFind: 'Search', boardFound: 'Found:', boardNoMatches: 'No records match these filters', boardPrevious: 'Previous page', boardNext: 'Next page', boardClear: 'Clear', limit: 'Limit', perDay: '/day',
    calendar: 'Load calendar', noPlaces: 'No slots', noData: 'No data', dayOff: 'Day off', updated: 'CGR updated', refresh: 'Refresh', details: 'Book in CarGoRuqsat',
    favorite: 'Favorite', favorited: 'Favorited', sourceError: 'Could not load CGR data. Try again.', checkQueue: 'Check your queue',
    platePlaceholder: 'Plate number, e.g. 123ABC02', check: 'Check', notFound: 'No active queue found', lookupError: 'Could not check plate',
    checkpoint: 'Checkpoint', queueTime: 'Queue time', status: 'Status', cached: 'UrTruck cache', live: 'live data', selected: 'Selected', tapToOpen: 'Tap',
    allDates: 'All dates', collapseDates: 'Collapse',
  },
  ZH: {
    title: '边境', subtitle: 'CGR 实时负载与预约空位', where: '您要去哪里？', all: '全部', choose: '选择口岸',
    hint: '左右滑动并点击口岸 — 只加载所选口岸的数据', tap: '点击口岸查看实时情况', loading: '正在获取 CGR 数据…',
    nearest: '最近可预约日期', places: '个空位', standard: '1 MCI', premium: '100 MCI', premiumNearest: '最近 100 MCI 预约',
    myCarsTab: '我的车辆', checkpointsTab: '口岸', searchCars: '按车牌搜索', statusNotChecked: '点击查询排队状态', sideKz: '哈萨克斯坦', sideCn: '中国',
    noStandard: '公开日历内暂无 1 MCI 空位', board: '当前电子屏', openBoard: '打开电子屏', boardTabTitle: '在线电子屏', boardApply: '应用', boardFind: '查找', boardFound: '找到：', boardNoMatches: '没有符合条件的记录', boardPrevious: '上一页', boardNext: '下一页', boardClear: '清除', limit: '每日限额', perDay: '/天', calendar: '负载日历',
    noPlaces: '无空位', noData: '无数据', dayOff: '休息日', updated: 'CGR 更新时间', refresh: '刷新', details: '在 CarGoRuqsat 预约', favorite: '收藏',
    favorited: '已收藏', sourceError: '无法获取 CGR 数据，请重试。', checkQueue: '查询我的排队', platePlaceholder: '车牌号，例如 123ABC02',
    check: '查询', notFound: '未找到有效排队', lookupError: '无法查询车牌', checkpoint: '口岸', queueTime: '排队时间', status: '状态',
    cached: 'UrTruck 缓存', live: '实时数据', selected: '已选择', tapToOpen: '点击查看', allDates: '所有日期', collapseDates: '收起',
  },
};
Object.assign(COPY, withAdditionalLanguageTree(COPY));

const ROLE_COPY = {
  RU: {
    myVehicle: 'Моя машина', change: 'Сменить', myBorderDeals: 'Мои перевозки на границе',
    active: 'активных', cgrOnline: 'CGR online', cgrUnchecked: 'Не проверено', cgrChecking: 'Проверяем CGR', cgrUnavailable: 'CGR недоступен', selectedShipment: 'Выбранная перевозка',
    toCheckpoint: 'До КПП', trackingOn: 'Отслеживание включено', openDeal: 'Открыть сделку',
    history: 'История статусов', messageDriver: 'Написать водителю', borderSituation: 'Обстановка на границе',
    checkOther: 'Проверить другой номер', addVehicle: 'Добавить машину', noVehicle: 'Добавьте машину, чтобы UrTruck сам проверял очередь по госномеру.',
    noActiveShipments: 'Активных перевозок на границе пока нет.', liveStatus: 'Статус CGR',
    gpsOnline: 'GPS включён', gpsUnavailable: 'GPS пока недоступен', late: 'Опаздывает', onTime: 'Не опаздывает',
    gpsTitle: 'GPS UrTruck', etaPending: 'ETA уточняется', routeUnavailable: 'Маршрут пока недоступен', lastGps: 'Последний GPS', distanceLabel: 'До КПП', bookingCountdown: 'До окна брони', queueTimeline: 'Статус очереди',
    paymentStep: 'Оплата', reviewStep: 'Проверка', queueStep: 'В очереди', calledStep: 'Вызван', crossedStep: 'Пересёк',
    recent: 'Недавние', followStatus: 'Следить за статусом', following: 'Отслеживание включено', openShipment: 'Открыть перевозку',
  },
  KK: {
    myVehicle: 'Менің көлігім', change: 'Ауыстыру', myBorderDeals: 'Шекарадағы тасымалдарым',
    active: 'белсенді', cgrOnline: 'CGR online', cgrUnchecked: 'Тексерілмеген', cgrChecking: 'CGR тексерілуде', cgrUnavailable: 'CGR қолжетімсіз', selectedShipment: 'Таңдалған тасымал',
    toCheckpoint: 'Бекетке дейін', trackingOn: 'Бақылау қосулы', openDeal: 'Мәмілені ашу',
    history: 'Күй тарихы', messageDriver: 'Жүргізушіге жазу', borderSituation: 'Шекарадағы жағдай',
    checkOther: 'Басқа нөмірді тексеру', addVehicle: 'Көлік қосу', noVehicle: 'Кезекті автоматты тексеру үшін көлік қосыңыз.',
    noActiveShipments: 'Шекарада белсенді тасымалдар жоқ.', liveStatus: 'CGR күйі',
    gpsOnline: 'GPS қосулы', gpsUnavailable: 'GPS әзірге қолжетімсіз', late: 'Кешігуде', onTime: 'Кешікпейді',
    gpsTitle: 'GPS UrTruck', etaPending: 'ETA нақтылануда', routeUnavailable: 'Бағыт әзірше қолжетімсіз', lastGps: 'Соңғы GPS', distanceLabel: 'Бекетке дейін', bookingCountdown: 'Бронь терезесіне дейін', queueTimeline: 'Кезек күйі',
    paymentStep: 'Төлем', reviewStep: 'Тексеру', queueStep: 'Кезекте', calledStep: 'Шақырылды', crossedStep: 'Өтті',
    recent: 'Соңғылар', followStatus: 'Күйді бақылау', following: 'Бақылау қосулы', openShipment: 'Тасымалды ашу',
  },
  EN: {
    myVehicle: 'My vehicle', change: 'Change', myBorderDeals: 'My border shipments',
    active: 'active', cgrOnline: 'CGR online', cgrUnchecked: 'Not checked', cgrChecking: 'Checking CGR', cgrUnavailable: 'CGR unavailable', selectedShipment: 'Selected shipment',
    toCheckpoint: 'To checkpoint', trackingOn: 'Tracking on', openDeal: 'Open deal',
    history: 'Status history', messageDriver: 'Message driver', borderSituation: 'Border situation',
    checkOther: 'Check another plate', addVehicle: 'Add vehicle', noVehicle: 'Add a vehicle so UrTruck can check the queue automatically.',
    noActiveShipments: 'No active border shipments yet.', liveStatus: 'CGR status',
    gpsOnline: 'GPS on', gpsUnavailable: 'GPS unavailable', late: 'Late', onTime: 'On time',
    gpsTitle: 'GPS UrTruck', etaPending: 'ETA pending', routeUnavailable: 'Route currently unavailable', lastGps: 'Last GPS', distanceLabel: 'To checkpoint', bookingCountdown: 'Until booking window', queueTimeline: 'Queue status',
    paymentStep: 'Payment', reviewStep: 'Review', queueStep: 'In queue', calledStep: 'Called', crossedStep: 'Crossed',
    recent: 'Recent', followStatus: 'Follow status', following: 'Following', openShipment: 'Open shipment',
  },
  ZH: {
    myVehicle: '我的车辆', change: '切换', myBorderDeals: '我的边境运输',
    active: '进行中', cgrOnline: 'CGR 在线', cgrUnchecked: '未检查', cgrChecking: '正在检查 CGR', cgrUnavailable: 'CGR 暂不可用', selectedShipment: '已选运输',
    toCheckpoint: '距口岸', trackingOn: '跟踪已开启', openDeal: '打开交易',
    history: '状态记录', messageDriver: '联系司机', borderSituation: '边境情况',
    checkOther: '查询其他车牌', addVehicle: '添加车辆', noVehicle: '添加车辆后，UrTruck 可自动查询排队状态。',
    noActiveShipments: '暂无边境运输。', liveStatus: 'CGR 状态',
    gpsOnline: 'GPS 已开启', gpsUnavailable: 'GPS 暂不可用', late: '已延误', onTime: '未延误',
    gpsTitle: 'UrTruck GPS', etaPending: 'ETA 计算中', routeUnavailable: '路线暂不可用', lastGps: '最近 GPS', distanceLabel: '距口岸', bookingCountdown: '距预约时间', queueTimeline: '排队状态',
    paymentStep: '支付', reviewStep: '审核', queueStep: '排队中', calledStep: '已叫号', crossedStep: '已过境',
    recent: '最近查询', followStatus: '关注状态', following: '正在关注', openShipment: '打开运输',
  },
};
Object.assign(ROLE_COPY, withAdditionalLanguageTree(ROLE_COPY));

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
Object.assign(LOOKUP_STATUS, withAdditionalLanguageTree(LOOKUP_STATUS));
function lookupStatusLabel(code, lang) {
  const entry = LOOKUP_STATUS[code] || LOOKUP_STATUS.unknown;
  return entry[lang] || entry.RU;
}

function normalizePlate(value) { return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, ''); }
function jsonArray(raw) { if (!raw) return []; try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } }
async function fetchJson(url) {
  const response = await fetch(url);
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.detail || `HTTP ${response.status}`);
  return body;
}
function localeFor(lang) { return lang === 'KK' ? localizeUiText('kk-KZ', lang) : lang === 'EN' ? localizeUiText('en-GB', lang) : lang === 'ZH' ? localizeUiText('zh-CN', lang) : localizeUiText('ru-RU', lang); }
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
function formatDistance(distanceM, lang = 'RU') {
  const value = Number(distanceM);
  if (!Number.isFinite(value) || value <= 0) return null;
  const units = lang === 'EN' ? { m: localizeUiText('m', lang), km: localizeUiText('km', lang) } : lang === 'ZH' ? { m: localizeUiText('米', lang), km: localizeUiText('公里', lang) } : { m: localizeUiText('м', lang), km: localizeUiText('км', lang) };
  return value < 1000 ? `${Math.round(value)} ${units.m}` : `${Math.round(value / 100) / 10} ${units.km}`;
}
function formatDuration(durationS, lang = 'RU') {
  const minutes = Math.max(1, Math.round(Number(durationS) / 60));
  if (!Number.isFinite(minutes)) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const unit = withAdditionalLanguages({
    RU: { h: 'ч', m: 'мин' }, KK: { h: 'сағ', m: 'мин' },
    EN: { h: 'h', m: 'min' }, ZH: { h: '小时', m: '分钟' },
  })[lang] || { h: 'ч', m: 'мин' };
  return hours ? `${hours} ${unit.h}${rest ? ` ${rest} ${unit.m}` : ''}` : `${rest} ${unit.m}`;
}
function parseQueueWindowStart(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const cgr = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (cgr) {
    const [, day, month, year, hour, minute] = cgr;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
function bookingCountdown(value, lang) {
  const target = parseQueueWindowStart(value);
  if (!target) return null;
  const seconds = Math.round((target.getTime() - Date.now()) / 1000);
  return seconds > 0 ? formatDuration(seconds, lang) : null;
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
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
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
  const [liveStatus, setLiveStatus] = useState('unchecked');
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
  const [canonicalContext, setCanonicalContext] = useState(false);
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [selectedDealId, setSelectedDealId] = useState(null);
  const [showManualLookup, setShowManualLookup] = useState(false);
  const [screenMode, setScreenMode] = useState('vehicles');
  const [bookingTariff, setBookingTariff] = useState('standard');
  const [expandedCalendar, setExpandedCalendar] = useState(false);
  const [boardResult, setBoardResult] = useState(null);
  const [boardOptions, setBoardOptions] = useState([]);
  const [boardPicker, setBoardPicker] = useState(null);
  const [boardDraft, setBoardDraft] = useState([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState('');
  const [boardQuery, setBoardQuery] = useState({ checkpoint: null, plate: '', statuses: [], page: 1 });
  const [boardPlate, setBoardPlate] = useState('');
  const [boardRefresh, setBoardRefresh] = useState(0);

  const [recentLookups, setRecentLookups] = useState([]);
  const [manualWatchEnabled, setManualWatchEnabled] = useState(false);
  const [roadRoute, setRoadRoute] = useState(null);
  const [roadRouteLoading, setRoadRouteLoading] = useState(false);
  const checkpointCarouselRef = useRef(null);
  const checkpointCarouselX = useRef(0);
  const liveRequest = useRef(0);
  const lookupRequest = useRef(0);
  const manualRequest = useRef(0);
  const scrollRef = useRef(null);

  const countryName = useCallback((code) => {
    const normalizedCode = String(code || '').trim().toUpperCase();
    const meta = COUNTRY[normalizedCode] || withAdditionalLanguages({ RU: normalizedCode, KK: normalizedCode, EN: normalizedCode, ZH: normalizedCode });
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
    storage.get(RECENT_LOOKUPS_KEY).then((raw) => setRecentLookups(jsonArray(raw).slice(0, 10))).catch(() => {});
  }, [loadCatalog]);

  const loadPrivateContext = useCallback(async () => {
    setContextLoading(true);
    setCanonicalContext(false);
    setWatchEnabled(false);
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
        // During a rolling deploy, the legacy /borders/{border_id} route can
        // catch the literal "context" path and return HTTP 200 with a public
        // checkpoint payload. Accept only the private role-aware contract;
        // otherwise continue into the compatibility fallback below.
        const validContext = (data?.role === 'driver' || data?.role === 'client')
          && Array.isArray(data?.vehicles)
          && Array.isArray(data?.deals)
          && Array.isArray(data?.trips);
        if (!validContext) throw new Error('invalid_border_context_contract');
        setCanonicalContext(true);
        applyContext({
          vehicles: data.vehicles,
          deals: data.deals,
          trips: data.trips,
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
        let plate = item?.plate || item?.vehicle_plate_snapshot || null;
        let make = item?.vehicle_make_snapshot || null;
        let model = item?.vehicle_model_snapshot || null;
        let vehicleCountry = item?.vehicle_country_snapshot || null;
        if (!plate && item?.driver_id) {
          try {
            const profileResponse = await fetch(`${API_BASE}/market/driver-profile/${encodeURIComponent(item.driver_id)}`);
            if (profileResponse.ok) {
              const profile = await profileResponse.json();
              plate = profile?.vehicle_plate || plate;
              make = profile?.vehicle_brand || make;
            }
          } catch { /* approved-profile fallback is optional */ }
        }
        return {
          ...item, deal_id: dealId,
          plate, make, model, vehicle_country: vehicleCountry,
          driver_name: item?.driver_name || null,
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
  // A selected checkpoint with a failed live request must never retain the
  // optimistic "CGR online" badge. The catalogue can still be usable while
  // the actual public live source is unavailable.
  const cgrLiveAvailable = liveStatus === 'ready' && !!live && !liveError;
  const cgrStatusLabel = cgrLiveAvailable ? R.cgrOnline
    : liveStatus === 'checking' ? R.cgrChecking
      : liveStatus === 'unchecked' ? R.cgrUnchecked
        : R.cgrUnavailable;
  const calendarRows = useMemo(() => completeBookingCalendar(live), [live]);

  const openBoard = (checkpoint, number = '') => {
    setBoardPlate(number);
    setBoardQuery({ checkpoint, plate: number, statuses: [], page: 1 });
    setBoardPicker(null);
    setScreenMode('board');
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const sameCheckpoint = (first, second) => {
    const key = (name) => String(name || '').toLowerCase().replace(/[\s—–-]+/g, '');
    return key(first) === key(second);
  };
  const openVehicleOnBoard = (result) => {
    const match = catalog.find((item) => sameCheckpoint(item.name_ru || item.name, result.checkpoint));
    if (match) openBoard(match, normalizePlate(result.plate));
  };

  const boardKey = JSON.stringify([boardQuery.checkpoint?.id, boardQuery.plate, boardQuery.statuses, boardQuery.page]);
  const boardData = boardResult?.key === boardKey ? boardResult.data : null;
  useEffect(() => {
    if (screenMode !== 'board' || !boardQuery.checkpoint) return undefined;
    let current = true;
    setBoardLoading(true);
    setBoardError('');
    const params = new URLSearchParams({
      checkpoint: boardQuery.checkpoint.id,
      plate: boardQuery.plate,
      page: String(boardQuery.page),
    });
    boardQuery.statuses.forEach((item) => params.append('statuses', item));
    fetchJson(BASE + '/online-board?' + params.toString())
      .then((data) => {
        if (!current) return;
        if (!Array.isArray(data?.rows) || !Array.isArray(data?.statuses)
          || !Number.isInteger(data.total) || data.page !== boardQuery.page) throw new Error('invalid_board');
        setBoardOptions(data.statuses);
        setBoardResult({ key: boardKey, data });
      })
      .catch(() => { if (current) setBoardError(L.sourceError); })
      .finally(() => { if (current) setBoardLoading(false); });
    return () => { current = false; };
  }, [screenMode, boardQuery, boardKey, L.sourceError, boardRefresh]);

  useEffect(() => {
    const origin = selectedDeal?.location;
    const hasCoordinates = [origin?.lat, origin?.lng, selected?.lat, selected?.lon]
      .every((value) => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)));
    const originLat = Number(origin?.lat);
    const originLng = Number(origin?.lng);
    const checkpointLat = Number(selected?.lat);
    const checkpointLng = Number(selected?.lon);
    if (!hasCoordinates) {
      setRoadRoute(null);
      setRoadRouteLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setRoadRoute(null);
    setRoadRouteLoading(true);
    routingAPI.roadRoute(
      [[originLat, originLng], [checkpointLat, checkpointLng]],
      null,
      { signal: controller.signal },
    ).then((result) => {
      if (!controller.signal.aborted) setRoadRoute(result?.ok ? result : { ok: false, detail: result?.detail });
    }).finally(() => {
      if (!controller.signal.aborted) setRoadRouteLoading(false);
    });
    return () => controller.abort();
  }, [selectedDeal?.location?.lat, selectedDeal?.location?.lng, selected?.lat, selected?.lon]);

  const loadLive = useCallback(async (checkpoint, force = false) => {
    if (!checkpoint) return;
    const request = ++liveRequest.current;
    setSelectedId(checkpoint.id);
    if (!force) setExpandedCalendar(false);
    setLiveLoading(true);
    setLiveError('');
    setLiveStatus('checking');
    try {
      const data = await fetchJson(`${BASE}/live/${encodeURIComponent(checkpoint.id)}${force ? '?force=true' : ''}`);
      if (!data || typeof data !== 'object') throw new Error('invalid_cgr_live_payload');
      if (request !== liveRequest.current) return;
      setLiveById((previous) => ({ ...previous, [String(checkpoint.id)]: data }));
      setLiveStatus('ready');
    } catch {
      if (request === liveRequest.current) { setLiveError(L.sourceError); setLiveStatus('unavailable'); }
    } finally {
      if (request === liveRequest.current) setLiveLoading(false);
    }
  }, [L.sourceError]);

  const selectCountry = useCallback((code) => {
    liveRequest.current += 1;
    setLiveLoading(false);
    setSelectedCountry(code);
    setSelectedId(null);
    setLiveError('');
    setLiveStatus('unchecked');
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
    const request = ++lookupRequest.current;
    setLookupLoading(true);
    try {
      const result = await fetchJson(`${BASE}/lookup?plate=${encodeURIComponent(normalized)}`);
      if (request === lookupRequest.current) setLookup({ ...result, plate: normalized, checkedAt: new Date().toISOString() });
    } catch {
      if (request === lookupRequest.current) setLookup((previous) => normalizePlate(previous?.plate) === normalized ? { ...previous, error: true } : { plate: normalized, error: true });
    } finally {
      if (request === lookupRequest.current) setLookupLoading(false);
    }
  }, []);

  const searchPlate = useCallback(async (requestedPlate = plate) => {
    const normalized = normalizePlate(requestedPlate);
    if (normalized.length < 3) return;
    const request = ++manualRequest.current;
    setPlate(normalized);
    const saved = privateContext.vehicles.find((item) => normalizePlate(item.license_plate || item.plate) === normalized);
    if (isDriver && saved) {
      setSelectedVehicleId(saved.id);
      setSelectedDealId(privateContext.deals.find((item) => normalizePlate(item.plate) === normalized)?.deal_id || null);
      setManualLookup(null);
      setManualLookupLoading(false);
      return normalizePlate(activePlate) === normalized ? lookupPlateValue(normalized) : undefined;
    }
    setManualLookupLoading(true);
    setManualLookup(null);
    setManualWatchEnabled(false);
    let result;
    try { result = await fetchJson(`${BASE}/lookup?plate=${encodeURIComponent(normalized)}`); }
    catch { result = { error: true }; }
    if (request !== manualRequest.current) return;
    setManualLookup(result);
    const nextRecent = [{ plate: normalized, status: result?.status || null, checkpoint: result?.checkpoint || null, found: Boolean(result?.found), checked_at: new Date().toISOString() }, ...recentLookups.filter((item) => normalizePlate(item?.plate) !== normalized)].slice(0, 10);
    setRecentLookups(nextRecent);
    storage.set(RECENT_LOOKUPS_KEY, JSON.stringify(nextRecent)).catch(() => {});
    setManualLookupLoading(false);
  }, [plate, recentLookups, privateContext.vehicles, privateContext.deals, isDriver, activePlate, lookupPlateValue]);

  useEffect(() => {
    const normalized = normalizePlate(activePlate);
    if (!normalized) {
      lookupRequest.current += 1;
      setLookup(null);
      setLookupLoading(false);
      return;
    }
    lookupPlateValue(normalized);
  }, [activePlate, lookupPlateValue]);

  useEffect(() => {
    setWatchEnabled(false);
    if (!canonicalContext || !isDriver || !contextToken || !selectedDeal || normalizePlate(activePlate).length < 3) return;
    fetch(`${BASE}/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${contextToken}` },
      body: JSON.stringify({ plate: normalizePlate(activePlate) }),
    }).then((response) => {
      if (response.ok) setWatchEnabled(true);
    }).catch(() => {});
  }, [canonicalContext, isDriver, contextToken, selectedDeal, activePlate]);

  useEffect(() => {
    if (!lookup?.found || !lookup?.checkpoint || !catalog.length || selectedId) return;
    const target = String(lookup.checkpoint).trim().toLowerCase();
    const match = catalog.find((item) => String(item.name_ru || item.name || '').trim().toLowerCase() === target);
    if (match) loadLive(match).catch(() => {});
  }, [lookup, catalog, selectedId, loadLive]);

  const manualOwnDeal = useMemo(() => {
    const checkedPlate = normalizePlate(manualLookup?.plate || plate);
    if (!checkedPlate) return null;
    return privateContext.deals.find((item) => normalizePlate(item?.plate) === checkedPlate) || null;
  }, [manualLookup, plate, privateContext.deals]);

  const enableManualWatch = useCallback(async () => {
    const normalized = normalizePlate(manualLookup?.plate || plate);
    if (!contextToken || normalized.length < 3 || manualWatchEnabled) return;
    try {
      const response = await fetch(`${BASE}/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${contextToken}` },
        body: JSON.stringify({ plate: normalized }),
      });
      if (response.ok) setManualWatchEnabled(true);
    } catch { /* Public CGR lookup remains usable when watch registration fails. */ }
  }, [contextToken, manualLookup, plate, manualWatchEnabled]);

  const beginVehicleSetup = useCallback(async () => {
    await storage.remove('ur_vehicle_setup_draft');
    navigation.navigate('VehicleSetupCountry', { role: 'driver', origin: 'Border' });
  }, [navigation]);

  const nearestText = live?.nearest_booking ? formatDate(live.nearest_booking, lang) : '—';
  const selectedPairParts = selected?.country === 'CN'
    ? localizeCheckpointName({ ...selected, name: live?.name || selected.name }, lang).split(/\s+[—–-]\s+/).map((part) => part.trim()).filter(Boolean)
    : [];
  const vehicleRows = isDriver
    ? (() => {
      const rows = [...privateContext.vehicles];
      const activeDealPlate = normalizePlate(selectedDeal?.plate);
      if (activeDealPlate && !rows.some((item) => normalizePlate(item?.license_plate || item?.plate) === activeDealPlate)) {
        rows.unshift({ id: selectedDeal.vehicle_id || selectedDeal.deal_id, license_plate: selectedDeal.plate, make: selectedDeal.make, model: selectedDeal.model });
      }
      return rows;
    })()
    : privateContext.deals;

  const premiumText = live?.nearest_premium_booking ? formatDate(live.nearest_premium_booking, lang) : null;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: v1.bg }]} edges={['top']} testID="border-screen-v2">
      {isDriver ? <DriverRouteBackdrop /> : null}
      <RootHeader compact ceramic={isDriver} navigation={navigation} role={role} testID="queue-root-header" menuTestID="queue-root-header-menu" />
      <View style={[s.screenTabs, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-screen-tabs">
        <TouchableOpacity onPress={() => setScreenMode('vehicles')} style={[s.screenTab, screenMode === 'vehicles' && { borderColor: activeColor, backgroundColor: activeColor + '0D' }]} accessibilityRole="tab" accessibilityState={{ selected: screenMode === 'vehicles' }} testID="border-tab-vehicles">
          <Feather name="truck" size={18} color={screenMode === 'vehicles' ? activeColor : theme.textMuted} /><Text style={[s.screenTabText, { color: screenMode === 'vehicles' ? activeColor : theme.text }]}>{L.myCarsTab}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setScreenMode('checkpoints')} style={[s.screenTab, screenMode === 'checkpoints' && { borderColor: activeColor, backgroundColor: activeColor + '0D' }]} accessibilityRole="tab" accessibilityState={{ selected: screenMode === 'checkpoints' }} testID="border-tab-checkpoints">
          <Feather name="map-pin" size={18} color={screenMode === 'checkpoints' ? activeColor : theme.textMuted} /><Text style={[s.screenTabText, { color: screenMode === 'checkpoints' ? activeColor : theme.text }]}>{L.checkpointsTab}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { if (!boardQuery.checkpoint && selected) openBoard(selected); else setScreenMode('board'); }} style={[s.screenTab, screenMode === 'board' && { borderColor: activeColor, backgroundColor: activeColor + '0D' }]} accessibilityRole="tab" accessibilityState={{ selected: screenMode === 'board' }} testID="border-tab-board"><Feather name="list" size={18} color={screenMode === 'board' ? activeColor : theme.textMuted} /><Text style={[s.screenTabText, { color: screenMode === 'board' ? activeColor : theme.text }]}>{({ RU: 'Табло', KK: 'Табло', EN: 'Board', ZH: '电子屏' })[lang] || 'Табло'}</Text></TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={s.content} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {screenMode === 'board' ? <View testID="border-board-screen">
          <Text style={[s.sectionTitle, { color: theme.text }]}>{L.boardTabTitle}</Text>
          <Text style={[s.source, { color: theme.textMuted }]}>CarGoRuqsat</Text>
          <TouchableOpacity accessibilityRole="button" testID="border-board-checkpoint" onPress={() => setBoardPicker(boardPicker === 'checkpoint' ? null : 'checkpoint')} style={[s.vehicleSearchWrap, { borderColor: theme.border }]}>
            <Text style={{ flex: 1, color: theme.text }}>{boardQuery.checkpoint ? localizeCheckpointName(boardQuery.checkpoint, lang) : L.checkpoint}</Text>
            <Feather name="chevron-down" size={18} color={theme.textMuted} />
          </TouchableOpacity>
          {boardPicker === 'checkpoint' ? [...new Set(catalog.map((cp) => cp.country))].map((code) => <View key={code}>
            <Text style={[s.metricLabel, { color: theme.textMuted }]}>{countryName(code)}</Text>
            {catalog.filter((cp) => cp.country === code).map((cp) => <TouchableOpacity key={cp.id} onPress={() => { setBoardQuery((value) => ({ ...value, checkpoint: cp, plate: normalizePlate(boardPlate), page: 1 })); setBoardPicker(null); }} style={s.vehicleListRow}>
              <Text style={{ color: theme.text }}>{localizeCheckpointName(cp, lang)}</Text>
            </TouchableOpacity>)}
          </View>) : null}
          {boardQuery.checkpoint ? <>
            <TouchableOpacity accessibilityRole="button" testID="border-board-statuses" disabled={!boardOptions.length} onPress={() => { setBoardDraft(boardQuery.statuses.length ? boardQuery.statuses : boardOptions.map((item) => item.code)); setBoardPicker(boardPicker === 'status' ? null : 'status'); }} style={[s.vehicleSearchWrap, { borderColor: theme.border }]}>
              <Text style={{ flex: 1, color: theme.text }}>{L.status} · {boardQuery.statuses.length || L.all}</Text>
              <Feather name="chevron-down" size={18} color={theme.textMuted} />
            </TouchableOpacity>
            {boardPicker === 'status' ? <View>
              <TouchableOpacity accessibilityRole="button" onPress={() => setBoardDraft(boardOptions.map((item) => item.code))} style={s.vehicleListRow}><Text style={{ color: theme.text }}>{L.all}</Text></TouchableOpacity>
              {boardOptions.map((item) => {
                const checked = boardDraft.includes(item.code);
                return <TouchableOpacity key={item.code} accessibilityRole="checkbox" accessibilityState={{ checked }} style={s.vehicleListRow} onPress={() => setBoardDraft((current) => {
                  return current.includes(item.code) ? current.filter((code) => code !== item.code) : [...current, item.code];
                })}>
                  <Feather name={checked ? 'check-square' : 'square'} size={18} color={activeColor} />
                  <Text style={{ flex: 1, color: theme.text }}>{item.label}</Text>
                </TouchableOpacity>;
              })}
              <TouchableOpacity accessibilityRole="button" testID="border-board-apply" disabled={!boardDraft.length} onPress={() => { setBoardQuery((value) => ({ ...value, statuses: boardDraft.length === boardOptions.length ? [] : boardDraft, plate: normalizePlate(boardPlate), page: 1 })); setBoardPicker(null); }} style={[s.secondaryDealAction, { borderColor: theme.border }]}><Text style={{ color: theme.text }}>{L.boardApply}</Text></TouchableOpacity>
            </View> : null}
            <View style={[s.vehicleSearchWrap, { borderColor: theme.border }]}>
              <TextInput value={boardPlate} onChangeText={setBoardPlate} onSubmitEditing={() => setBoardQuery((value) => ({ ...value, plate: normalizePlate(boardPlate), page: 1 }))} placeholder={L.platePlaceholder} placeholderTextColor={theme.textDim} autoCapitalize="characters" autoCorrect={false} maxLength={32} returnKeyType="search" style={[s.vehicleSearchInput, { color: theme.text }]} testID="border-board-search" />
              <TouchableOpacity accessibilityRole="button" onPress={() => setBoardQuery((value) => ({ ...value, plate: normalizePlate(boardPlate), page: 1 }))} style={[s.secondaryDealAction, { borderColor: activeColor }]}><Text style={{ color: activeColor }}>{L.boardFind}</Text></TouchableOpacity>
            </View>
            {boardLoading ? <ActivityIndicator color={activeColor} /> : null}
            {boardError ? <Text style={[s.hint, { color: '#B42318' }]}>{boardError}</Text> : null}
            {boardData ? <>
              <View style={s.contextHeader}>
                <Text style={{ color: theme.text }}>{L.boardFound} {boardData.total} · {formatSourceTime(boardData.updated_at)}</Text>
                <TouchableOpacity onPress={() => setBoardRefresh((value) => value + 1)} style={s.iconButton} accessibilityRole="button" accessibilityLabel={L.refresh}><Feather name="refresh-cw" size={17} color={activeColor} /></TouchableOpacity>
              </View>
              {!boardData.total && !boardError ? <Text style={[s.hint, { color: theme.textMuted }]}>{L.boardNoMatches}</Text> : null}
              {boardData.rows.map((row, index) => <View key={row.plate + '-' + index} style={[s.contextCard, { backgroundColor: theme.card, borderColor: boardQuery.plate && normalizePlate(row.plate) === boardQuery.plate ? activeColor : theme.border }]}>
                <Text style={[s.vehicleName, { color: theme.text }]}>{row.plate}</Text>
                <Text style={{ color: theme.textMuted }}>{localizeCheckpointName(row.checkpoint, lang)} · {row.date} · {row.slot}</Text>
                <Text style={{ color: theme.text }}>{row.status}</Text>
              </View>)}
              {boardData.page > 1 || boardData.has_next ? <View style={s.contextHeader}>
                <TouchableOpacity disabled={boardLoading || boardData.page <= 1} accessibilityLabel={L.boardPrevious} onPress={() => setBoardQuery((value) => ({ ...value, page: value.page - 1 }))} style={s.iconButton}><Feather name="chevron-left" size={20} color={theme.text} /></TouchableOpacity>
                <Text style={{ color: theme.text }}>{boardData.page}</Text>
                <TouchableOpacity disabled={boardLoading || !boardData.has_next} testID="border-board-next" accessibilityLabel={L.boardNext} onPress={() => setBoardQuery((value) => ({ ...value, page: value.page + 1 }))} style={s.iconButton}><Feather name="chevron-right" size={20} color={theme.text} /></TouchableOpacity>
              </View> : null}
            </> : boardError ? <TouchableOpacity onPress={() => setBoardRefresh((value) => value + 1)}><Text style={{ color: activeColor }}>{L.refresh}</Text></TouchableOpacity> : null}
          </> : null}
        </View> : null}
        {screenMode === 'vehicles' ? (<>
        {(isDriver || showManualLookup) ? <View style={[s.searchCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-plate-search">
          <Text style={[s.sectionTitle, { color: theme.text }]}>{L.platePlaceholder}</Text>
          <View style={s.searchRow}>
            <View style={[s.inputWrap, { backgroundColor: v1.bg, borderColor: theme.border }]}><Feather name="truck" size={17} color={theme.textMuted} /><TextInput value={plate} onChangeText={(value) => { manualRequest.current += 1; setManualLookupLoading(false); setPlate(value.toUpperCase()); setManualLookup(null); setManualWatchEnabled(false); }} onSubmitEditing={() => searchPlate()} placeholder={L.platePlaceholder} placeholderTextColor={theme.textDim} autoCapitalize="characters" autoCorrect={false} style={[s.input, { color: theme.text }]} testID="border-plate-input" returnKeyType="search" maxLength={32} /></View>
            <TouchableOpacity onPress={() => searchPlate()} disabled={normalizePlate(plate).length < 3 || manualLookupLoading} style={[s.checkButton, (normalizePlate(plate).length < 3 || manualLookupLoading) && s.disabled]} testID="border-plate-check">{manualLookupLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.checkText}>{L.check}</Text>}</TouchableOpacity>
          </View>
          {plate ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={L.boardClear} onPress={() => { manualRequest.current += 1; setManualLookupLoading(false); setPlate(''); setManualLookup(null); setManualWatchEnabled(false); }} style={s.iconButton}><Feather name="x" size={17} color={theme.textMuted} /></TouchableOpacity> : null}
          {manualLookup ? <View style={[s.lookup, { borderTopColor: theme.border }]}>
            {manualLookup.error ? <Text style={[s.lookupText, { color: '#B42318' }]}>{L.lookupError}</Text> : manualLookup.found ? <>
              <Text style={[s.lookupPlate, { color: theme.text }]}>{manualLookup.plate || normalizePlate(plate)}</Text>
              {manualLookup.status ? <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.status}: {lookupStatusLabel(manualLookup.status, lang)}</Text> : null}
              {manualLookup.checkpoint ? <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.checkpoint}: {localizeCheckpointName(manualLookup.checkpoint, lang)}</Text> : null}
              {manualLookup.queue_datetime ? <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.queueTime}: {manualLookup.queue_datetime}</Text> : null}
              <View style={s.dealActions}>
                {manualLookup.checkpoint && catalog.some((item) => sameCheckpoint(item.name_ru || item.name, manualLookup.checkpoint)) ? <TouchableOpacity onPress={() => openVehicleOnBoard({ ...manualLookup, plate: manualLookup.plate || plate })} style={[s.secondaryDealAction, { borderColor: theme.border }]}><Text style={{ color: theme.text }}>{L.openBoard}</Text></TouchableOpacity> : null}
                {manualOwnDeal ? <TouchableOpacity onPress={() => navigation.navigate('Chat', { roomId: manualOwnDeal.chat_room_id, dealId: manualOwnDeal.deal_id, role })} style={[s.primaryDealAction, { backgroundColor: activeColor }]} testID="border-manual-open-own-deal"><Feather name="file-text" size={17} color="#fff" /><Text style={s.primaryDealActionText}>{R.openShipment}</Text></TouchableOpacity> : null}
                {contextToken ? <TouchableOpacity onPress={enableManualWatch} disabled={manualWatchEnabled} style={[s.secondaryDealAction, { borderColor: theme.border }]} testID="border-manual-watch"><Feather name={manualWatchEnabled ? 'check-circle' : 'bell'} size={17} color={manualWatchEnabled ? '#168759' : theme.textMuted} /><Text style={[s.secondaryDealActionText, { color: manualWatchEnabled ? '#168759' : theme.text }]}>{manualWatchEnabled ? R.following : R.followStatus}</Text></TouchableOpacity> : null}
              </View>
            </> : <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.notFound}</Text>}
          </View> : null}
          {recentLookups.length ? <View style={s.recentWrap}><Text style={[s.metricLabel, { color: theme.textMuted }]}>{R.recent}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recentRow}>{recentLookups.map((item) => <TouchableOpacity key={item.plate} onPress={() => searchPlate(item.plate)} style={[s.recentChip, { borderColor: theme.border, backgroundColor: v1.surfaceMuted }]}><Text style={[s.recentPlate, { color: theme.text }]}>{item.plate}</Text><Text style={[s.recentStatus, { color: theme.textMuted }]}>{item.status ? lookupStatusLabel(item.status, lang) : L.notFound}</Text></TouchableOpacity>)}</ScrollView></View> : null}
        </View> : null}

        {isDriver ? (
          <View style={[s.contextCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-driver-vehicle-card">
            <View style={s.contextHeader}><View style={s.contextTitleRow}><Feather name="truck" size={20} color={theme.textMuted} /><Text style={[s.contextTitle, { color: theme.text }]}>{L.myCarsTab}</Text></View><Text style={[s.source, { color: theme.textDim }]}>{vehicleRows.length}</Text></View>

            {contextLoading ? <ActivityIndicator color={activeColor} style={{ marginVertical: 14 }} /> : vehicleRows.length ? vehicleRows.map((item) => {
              const itemPlate = normalizePlate(item?.license_plate || item?.plate);
              const isSelectedVehicle = itemPlate && itemPlate === normalizePlate(activePlate);
              const itemDeal = privateContext.deals.find((deal) => normalizePlate(deal?.plate) === itemPlate);
              const currentLookup = isSelectedVehicle && normalizePlate(lookup?.plate) === itemPlate ? lookup : null;
              return <View key={String(item?.id || item?.deal_id || itemPlate)}><TouchableOpacity onPress={() => {
                if (item?.deal_id) { setSelectedDealId(item.deal_id); setSelectedVehicleId(item.vehicle_id || null); }
                else { setSelectedVehicleId(item.id || null); setSelectedDealId(itemDeal?.deal_id || null); }
                setManualLookup(null);
                manualRequest.current += 1;
                setManualLookupLoading(false);
              }} style={[s.vehicleListRow, { borderColor: isSelectedVehicle ? activeColor : theme.border, backgroundColor: isSelectedVehicle ? activeColor + '0D' : v1.surfaceMuted }]} accessibilityRole="button" testID="border-vehicle-row">
                <View style={[s.shipmentTruck, { backgroundColor: theme.card }]}><Feather name="truck" size={25} color={activeColor} /></View>
                <View style={{ flex: 1 }}>
                  {(itemDeal?.make || item?.make || itemDeal?.model || item?.model) ? <Text style={[s.shipmentMeta, { color: theme.textMuted }]}>{[itemDeal?.make || item?.make, itemDeal?.model || item?.model].filter(Boolean).join(' ')}</Text> : null}
                  <Text style={[s.vehicleName, { color: theme.text }]}>{itemPlate || '—'}</Text>
                  <View style={s.vehicleStatusLine}><View style={[s.onlineDot, { backgroundColor: currentLookup?.found ? (currentLookup.status === 'revoked' ? '#D64545' : currentLookup.status === 'called' ? '#3478D4' : '#168759') : '#9AA7A0' }]} /><Text style={[s.shipmentMeta, { color: currentLookup?.found ? theme.text : theme.textMuted }]}>{currentLookup?.found ? (currentLookup.status_raw || lookupStatusLabel(currentLookup.status, lang)) : isSelectedVehicle && lookupLoading ? L.loading : currentLookup?.error ? L.lookupError : currentLookup ? L.notFound : L.statusNotChecked}</Text></View>
                  {currentLookup?.found && currentLookup.checkpoint ? <Text style={[s.shipmentMeta, { color: theme.textMuted }]}>{localizeCheckpointName(currentLookup.checkpoint, lang)}{currentLookup.queue_datetime ? ` · ${currentLookup.queue_datetime}` : ''}</Text> : itemDeal ? <Text style={[s.shipmentMeta, { color: theme.textMuted }]}>{localizePlace(itemDeal.from_city, lang)} → {localizePlace(itemDeal.to_city, lang)}</Text> : null}
                </View>
                {isSelectedVehicle && lookupLoading ? <ActivityIndicator size="small" color={activeColor} /> : <Feather name="chevron-right" size={20} color={theme.textDim} />}
              </TouchableOpacity>
              {isSelectedVehicle && currentLookup ? <View style={s.contextHeader}>
                <Text style={[s.source, { color: theme.textMuted }]}>{currentLookup.error ? L.lookupError : formatSourceTime(currentLookup.checkedAt)}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={L.refresh} onPress={() => lookupPlateValue(itemPlate)} style={s.iconButton}><Feather name="refresh-cw" size={16} color={activeColor} /></TouchableOpacity>
              </View> : null}
              {currentLookup?.found && catalog.some((item) => sameCheckpoint(item.name_ru || item.name, currentLookup.checkpoint)) ? <TouchableOpacity accessibilityRole="button" onPress={() => openVehicleOnBoard(currentLookup)} style={[s.secondaryDealAction, { borderColor: theme.border }]}><Text style={{ color: activeColor }}>{L.openBoard}</Text></TouchableOpacity> : null}
              </View>;
            }) : <View style={s.emptyVehicleState} testID="border-driver-empty-vehicle"><Text style={[s.emptyContext, { color: theme.textMuted }]}>{R.noVehicle}</Text></View>}
            {!contextLoading && privateContext.vehicles.length === 0 && !selectedDeal?.plate ? <TouchableOpacity onPress={beginVehicleSetup} style={[s.emptyVehicleSecondary, { borderColor: activeColor }]} accessibilityRole="button" testID="border-add-vehicle"><Feather name="plus" size={18} color={activeColor} /><Text style={[s.secondaryDealActionText, { color: activeColor }]}>{R.addVehicle}</Text></TouchableOpacity> : null}
            {privateContext.vehicles.length > 0 ? <TouchableOpacity onPress={beginVehicleSetup} style={[s.emptyVehicleSecondary, { borderColor: theme.border }]} accessibilityRole="button" testID="border-add-vehicle"><Feather name="plus" size={17} color={activeColor} /><Text style={[s.secondaryDealActionText, { color: theme.text }]}>{R.addVehicle}</Text></TouchableOpacity> : null}
          </View>
        ) : (
          <View style={[s.contextCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-shipper-deals-card">
            <View style={s.contextHeader}>
              <View style={s.contextTitleRow}><Feather name="truck" size={20} color={theme.textMuted} /><Text style={[s.contextTitle, { color: theme.text }]}>{R.myBorderDeals}</Text></View>
              <View style={s.headerPills}><View style={s.countPill}><Text style={s.countPillText}>{privateContext.deals.length} {R.active}</Text></View><View style={[s.onlinePill, !cgrLiveAvailable && s.unavailablePill]}><View style={[s.onlineDot, !cgrLiveAvailable && s.unavailableDot]} /><Text style={[s.onlineText, !cgrLiveAvailable && s.unavailableText]}>{cgrStatusLabel}</Text></View></View>
            </View>
            {contextLoading ? <ActivityIndicator color={activeColor} style={{ marginVertical: 14 }} /> : privateContext.deals.length ? privateContext.deals.slice(0, 4).map((item) => {
              const activeDeal = String(item.deal_id) === String(selectedDeal?.deal_id);
              return <TouchableOpacity key={item.deal_id} onPress={() => setSelectedDealId(item.deal_id)} style={[s.shipmentRow, { borderColor: activeDeal ? activeColor : theme.border, backgroundColor: activeDeal ? activeColor + '0D' : v1.surfaceMuted }]} testID="border-shipper-deal-row">
                <View style={[s.shipmentTruck, { backgroundColor: theme.card }]}><Feather name="truck" size={26} color={activeColor} /></View>
                <View style={{ flex: 1 }}><Text style={[s.shipmentRoute, { color: theme.text }]}>{localizePlace(item.from_city, lang)} → {localizePlace(item.to_city, lang)}</Text><Text style={[s.shipmentMeta, { color: theme.textMuted }]}>{item.driver_name || '—'} · {[item.make, item.model].filter(Boolean).join(' ') || '—'} · {normalizePlate(item.plate) || '—'}</Text></View>
                <Feather name="chevron-right" size={20} color={theme.textDim} />
              </TouchableOpacity>;
            }) : <Text style={[s.emptyContext, { color: theme.textMuted }]}>{R.noActiveShipments}</Text>}
            <TouchableOpacity onPress={() => setShowManualLookup((value) => !value)} style={[s.manualToggle, { borderColor: theme.border, backgroundColor: v1.surfaceMuted }]} accessibilityRole="button" testID="border-shipper-manual-toggle"><Feather name="search" size={18} color={theme.textMuted} /><Text style={[s.secondaryDealActionText, { color: theme.text }]}>{R.checkOther}</Text><Feather name={showManualLookup ? 'chevron-up' : 'chevron-down'} size={17} color={theme.textMuted} /></TouchableOpacity>
          </View>
        )}

        {!isDriver && activePlate ? <View style={[s.personalStatusCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-personal-cgr-status">
          <View style={s.contextHeader}><View style={s.contextTitleRow}><Feather name="activity" size={19} color={activeColor} /><Text style={[s.contextTitle, { color: theme.text }]}>{R.liveStatus}</Text></View>{lookup?.found && lookup?.status ? <View style={[s.statusPill, { backgroundColor: lookup.status === 'called' ? '#E8F1FF' : lookup.status === 'revoked' ? '#FDECEC' : '#E9F8EE' }]}><Text style={[s.statusPillText, { color: lookup.status === 'revoked' ? '#B42318' : lookup.status === 'called' ? '#1769E0' : '#168759' }]}>{lookupStatusLabel(lookup.status, lang)}</Text></View> : null}</View>
          {lookupLoading ? <ActivityIndicator color={activeColor} style={{ marginVertical: 12 }} /> : lookup?.error ? <Text style={[s.lookupText, { color: '#B42318' }]}>{L.lookupError}</Text> : lookup?.found ? <>
            <Text style={[s.personalCheckpoint, { color: theme.text }]}>{localizeCheckpointName(lookup.checkpoint, lang)}</Text>
            <View style={s.personalMetaRow}><Feather name="calendar" size={15} color={theme.textMuted} /><Text style={[s.lookupText, { color: theme.textMuted }]}>{L.queueTime}: {lookup.queue_datetime || '—'}</Text></View>
            <View style={s.personalMetaRow}><Feather name={lookup.is_late ? 'alert-circle' : 'check-circle'} size={15} color={lookup.is_late ? '#B7791F' : '#168759'} /><Text style={[s.lookupText, { color: lookup.is_late ? '#B7791F' : '#168759' }]}>{lookup.is_late ? R.late : R.onTime}</Text></View>
          </> : <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.notFound}</Text>}
          {selectedDeal && !isDriver ? <View style={s.dealActions}><TouchableOpacity onPress={() => navigation.navigate('Chat', { roomId: selectedDeal.chat_room_id, dealId: selectedDeal.deal_id, role })} style={[s.primaryDealAction, { backgroundColor: activeColor }]}><Feather name="file-text" size={17} color="#fff" /><Text style={s.primaryDealActionText}>{R.openDeal}</Text></TouchableOpacity><TouchableOpacity onPress={() => navigation.navigate('Chat', { roomId: selectedDeal.chat_room_id, dealId: selectedDeal.deal_id, role, action: 'status-history' })} style={[s.secondaryDealAction, { borderColor: theme.border }]}><Feather name="clock" size={17} color={theme.textMuted} /><Text style={[s.secondaryDealActionText, { color: theme.text }]}>{R.history}</Text></TouchableOpacity><TouchableOpacity onPress={() => navigation.navigate('Chat', { roomId: selectedDeal.chat_room_id, dealId: selectedDeal.deal_id, role })} style={[s.secondaryDealAction, { borderColor: theme.border }]}><Feather name="message-circle" size={17} color={theme.textMuted} /><Text style={[s.secondaryDealActionText, { color: theme.text }]}>{R.messageDriver}</Text></TouchableOpacity></View> : null}
        </View> : null}

        {selectedDeal ? <View style={[s.gpsCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-gps-card">
          <View style={s.contextHeader}><View style={s.contextTitleRow}><Feather name="navigation" size={20} color={activeColor} /><Text style={[s.contextTitle, { color: theme.text }]}>{R.gpsTitle}</Text></View><View style={[s.statusPill, { backgroundColor: selectedDeal.location ? '#E9F8EE' : v1.surfaceMuted }]}><Text style={[s.statusPillText, { color: selectedDeal.location ? '#168759' : theme.textMuted }]}>{selectedDeal.location ? R.gpsOnline : R.gpsUnavailable}</Text></View></View>
          <View style={s.gpsMetrics}>
            <View><Text style={[s.metricLabel, { color: theme.textMuted }]}>{R.lastGps}</Text><Text style={[s.gpsValue, { color: theme.text }]}>{selectedDeal.location ? formatSourceTime(selectedDeal.location.updated_at) : '—'}</Text></View>
            <View><Text style={[s.metricLabel, { color: theme.textMuted }]}>{R.distanceLabel}</Text><Text style={[s.gpsValue, { color: theme.text }]}>{roadRouteLoading ? R.etaPending : roadRoute?.ok ? formatDistance(roadRoute.distance_m, lang) : R.routeUnavailable}</Text></View>
            <View><Text style={[s.metricLabel, { color: theme.textMuted }]}>ETA</Text><Text style={[s.gpsValue, { color: theme.text }]}>{roadRouteLoading ? R.etaPending : roadRoute?.ok ? formatDuration(roadRoute.duration_s, lang) : R.routeUnavailable}</Text></View>
            <View><Text style={[s.metricLabel, { color: theme.textMuted }]}>{R.bookingCountdown}</Text><Text style={[s.gpsValue, { color: theme.text }]}>{bookingCountdown(lookup?.queue_datetime, lang) || '—'}</Text></View>
          </View>
        </View> : null}

        {isDriver && (selectedVehicle || selectedDeal) ? <View style={s.driverActions} testID="border-driver-actions">
          {watchEnabled ? <View style={[s.primaryDealAction, { backgroundColor: activeColor }]}><Feather name="radio" size={17} color="#fff" /><Text style={s.primaryDealActionText}>{R.trackingOn}</Text></View> : null}
          {selectedDeal ? <TouchableOpacity onPress={() => navigation.navigate('Chat', { roomId: selectedDeal.chat_room_id, dealId: selectedDeal.deal_id, role })} style={[s.secondaryDealAction, { borderColor: theme.border, backgroundColor: theme.card }]} testID="border-driver-open-deal"><Feather name="list" size={17} color={theme.textMuted} /><Text style={[s.secondaryDealActionText, { color: theme.text }]}>{R.openDeal}</Text></TouchableOpacity> : null}
        </View> : null}






        </>) : null}

        {screenMode === 'checkpoints' ? (<>
        <View style={s.sectionHeadingRow}><Text style={[s.sectionTitle, { color: theme.text }]}>{R.borderSituation}</Text><Text style={[s.source, { color: theme.textDim }]}>CGR</Text></View>
        <Text style={[s.label, { color: theme.text }]}>{L.where}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} testID="border-country-filter">
          {countryCodes.map((code) => {
            const active = selectedCountry === code;
            return (
              <TouchableOpacity key={code} onPress={() => selectCountry(code)} style={[s.countryChip, { borderColor: active ? activeColor : theme.border, backgroundColor: active ? '#65758A' : theme.card }]} testID={`border-country-${code}`}>
                <CountryFlag code={code} width={24} />
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
              <View style={{ flex: 1, paddingRight: 8 }}><Text style={[s.liveTitle, { color: theme.text }]}>{localizeCheckpointName({ ...selected, name: live.name || selected.name }, lang)}</Text><View style={s.liveCountryRow}>{selected.country ? <CountryFlag code={selected.country} width={20} /> : null}<Text style={[s.liveCountry, { color: theme.textMuted }]}>{selected.country ? countryName(selected.country) : ''}</Text></View>{selectedPairParts.length >= 2 ? <Text style={[s.pairSides, { color: theme.textMuted }]}>{L.sideKz}: {selectedPairParts[0]}  ·  {L.sideCn}: {selectedPairParts[1]}</Text> : null}</View>
              <TouchableOpacity onPress={toggleFavorite} style={[s.iconButton, { borderColor: theme.border }]} accessibilityRole="button" accessibilityLabel={t('a11y_toggle_favorite')} accessibilityState={{ selected: favorites.includes(String(selectedId)) }}><Feather name="star" size={19} color={activeColor} fill={favorites.includes(String(selectedId)) ? activeColor : 'transparent'} /></TouchableOpacity>
            </View>

            <View style={s.bookingTiers}>
            <View style={[s.heroBooking, s.bookingTier, { backgroundColor: v1.surfaceMuted }]}>
              <Text style={[s.heroLabel, { color: theme.textMuted }]}>{L.nearest}</Text>
              <Text style={[s.heroDate, { color: theme.text }]}>{nearestText}</Text>
              {live.nearest_booking_free != null ? <View style={s.freeBadge}><Text style={s.freeBadgeText}>{live.nearest_booking_free} {L.places} · {L.standard}</Text></View> : <Text style={[s.noBooking, { color: theme.textMuted }]}>{L.noStandard}</Text>}
            </View>

            <View style={[s.heroBooking, s.bookingTier, { backgroundColor: v1.surfaceMuted }]}>
              <Text style={[s.heroLabel, { color: theme.textMuted }]}>{L.premiumNearest}</Text>
              <Text style={[s.heroDate, { color: theme.text }]}>{premiumText || '—'}</Text>
              <Text style={[s.noBooking, { color: theme.textMuted }]}>{live.nearest_premium_free == null ? L.noData : live.nearest_premium_free + ' · ' + L.premium}</Text>
            </View>
            </View>

            <View style={[s.metrics, { borderColor: theme.border }]}>
              <TouchableOpacity accessibilityRole="button" onPress={() => openBoard(selected)} style={s.metric}><Text style={[s.metricLabel, { color: theme.textMuted }]}>{L.board}</Text><Text style={[s.metricValue, { color: theme.text }]}>{live.current_board_count ?? '—'}</Text></TouchableOpacity>
              <View style={[s.metricDivider, { backgroundColor: theme.border }]} />
              <View style={s.metric}><Text style={[s.metricLabel, { color: theme.textMuted }]}>{L.limit}</Text><Text style={[s.metricValue, { color: theme.text }]}>{live.daily_capacity != null ? `${live.daily_capacity}${L.perDay}` : '—'}</Text></View>
            </View>

            <TouchableOpacity onPress={() => openBoard(selected)} style={[s.secondaryDealAction, { borderColor: activeColor, marginTop: 12 }]} accessibilityRole="button" testID="border-open-board"><Feather name="list" size={17} color={activeColor} /><Text style={[s.secondaryDealActionText, { color: activeColor }]}>{L.openBoard}</Text></TouchableOpacity>

            <View style={s.calendarHead}><Text style={[s.sectionTitleSmall, { color: theme.text }]}>{L.calendar}</Text><TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: expandedCalendar }} onPress={() => setExpandedCalendar((value) => !value)} style={s.calendarToggle}><Text style={{ color: activeColor }}>{expandedCalendar ? L.collapseDates : L.allDates}</Text></TouchableOpacity></View>
            <View style={s.chips}>
              {[['standard', L.standard], ['premium', L.premium]].map(([value, label]) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: bookingTariff === value }} onPress={() => setBookingTariff(value)} style={[s.countryChip, { borderColor: bookingTariff === value ? activeColor : theme.border }]}><Text style={{ color: theme.text }}>{label}</Text></TouchableOpacity>)}
            </View>
            <FlatList
              key={expandedCalendar ? 'all-dates' : 'date-strip'}
              horizontal={!expandedCalendar}
              numColumns={expandedCalendar ? 4 : 1}
              scrollEnabled={!expandedCalendar}
              data={calendarRows}
              keyExtractor={(item) => item.date}
              renderItem={({ item }) => {
                const free = bookingTariff === 'standard' ? item.standard_free : item.premium_free;
                const available = free != null && Number(free) > 0;
                const unavailable = free != null && Number(free) === 0;
                return (
                  <View style={[s.dateCard, expandedCalendar && s.dateCardExpanded, { borderColor: available ? activeColor : unavailable ? '#C98B8B' : theme.border, backgroundColor: theme.card }]} testID="border-booking-date-card">
                    <Text style={[s.dateText, { color: theme.text }]}>{formatShortDate(item.date, lang)}</Text>
                    {item.is_day_off ? <Text style={[s.dateState, { color: theme.textDim }]}>{L.dayOff}</Text>
                      : available ? <Text style={s.dateFree}>{free}</Text>
                        : <Text style={[s.dateState, { color: unavailable ? '#B42318' : theme.textDim }]}>{unavailable ? L.noPlaces : L.noData}</Text>}
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
            <TouchableOpacity onPress={() => Linking.openURL(live.official_url || 'https://cgr.qoldau.kz/ru/start').catch(() => {})} style={[s.secondaryDealAction, { borderColor: theme.border }]}><Feather name="external-link" size={16} color={theme.textMuted} /><Text style={[s.secondaryDealActionText, { color: theme.textMuted }]}>{L.details}</Text></TouchableOpacity>
          </View>
        ) : null}
        </>) : null}

        <View style={{ height: 34 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 14, paddingTop: 0, paddingBottom: 18 },
  screenTabs: { flexDirection: 'row', marginHorizontal: 14, marginTop: 7, marginBottom: 10, padding: 4, borderWidth: 1, borderRadius: 15, gap: 4 },
  screenTab: { flex: 1, minHeight: 44, borderWidth: 1.5, borderColor: 'transparent', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 8 },
  screenTabText: { fontSize: 11, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  vehicleSearchWrap: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11 },
  vehicleSearchInput: { flex: 1, fontSize: 14, minHeight: 42 },
  vehicleListRow: { minHeight: 69, borderWidth: 1, borderRadius: 14, padding: 8, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  vehicleStatusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  pairSides: { fontSize: 11.5, lineHeight: 16, fontWeight: '650', marginTop: 3 },
  secondaryCycle: { alignItems: 'center', paddingTop: 8 },
  contextCard: { borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 10 },
  contextHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  contextTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  contextTitle: { fontSize: 16, fontWeight: '850' },
  smallAction: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },
  smallActionText: { fontSize: 12.5, fontWeight: '750' },
  vehicleBody: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 11 },
  vehicleIconWrap: { width: 68, height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  vehicleName: { fontSize: 18, fontWeight: '900' },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  plateBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, fontSize: 15, fontWeight: '900', letterSpacing: 0.4 },
  countryBadge: { fontSize: 11.5, fontWeight: '800' },
  routeLine: { fontSize: 13, marginTop: 6, fontWeight: '650' },
  emptyContext: { fontSize: 13, lineHeight: 19, marginTop: 10, textAlign: 'center' },
  emptyVehicleState: { alignItems: 'center', paddingTop: 8 },
  emptyVehicleIcon: { width: 82, height: 68, borderRadius: 20, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  emptyVehiclePlus: { position: 'absolute', right: 5, bottom: 3, width: 27, height: 27, borderRadius: 14, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  emptyVehiclePrimary: { width: '100%', minHeight: 48, borderRadius: 12, marginTop: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyVehiclePrimaryText: { color: '#fff', fontSize: 14, fontWeight: '850' },
  emptyVehicleSecondary: { width: '100%', minHeight: 48, borderRadius: 12, borderWidth: 1, marginTop: 9, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerPills: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  countPill: { backgroundColor: '#E9F2FF', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  countPillText: { color: '#1769E0', fontSize: 11.5, fontWeight: '800' },
  onlinePill: { backgroundColor: '#E9F8EE', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#168759' },
  onlineText: { color: '#168759', fontSize: 11.5, fontWeight: '800' },
  unavailablePill: { backgroundColor: '#FFF4E5' },
  unavailableDot: { backgroundColor: '#B7791F' },
  unavailableText: { color: '#8A4B08' },
  shipmentRow: { borderWidth: 1, borderRadius: 14, padding: 10, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  shipmentTruck: { width: 48, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  shipmentRoute: { fontSize: 14.5, fontWeight: '850' },
  shipmentMeta: { fontSize: 11.5, marginTop: 4 },
  personalStatusCard: { borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 10 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontSize: 11.5, fontWeight: '850' },
  personalCheckpoint: { fontSize: 19, fontWeight: '900', marginTop: 10, marginBottom: 6 },
  personalMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  manualToggle: { minHeight: 44, borderWidth: 1, borderRadius: 12, marginTop: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  gpsCard: { borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 10 },
  gpsMetrics: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, columnGap: 18, marginTop: 12 },
  gpsValue: { fontSize: 14, fontWeight: '850', marginTop: 4 },
  timelineCard: { borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 10 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 14 },
  timelineItem: { flex: 1, alignItems: 'center', gap: 6 },
  timelineDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  timelineLabel: { fontSize: 10.5, lineHeight: 13, fontWeight: '750', textAlign: 'center' },
  dealActions: { flexDirection: 'row', gap: 7, marginTop: 12, flexWrap: 'wrap' },
  driverActions: { flexDirection: 'row', gap: 7, marginBottom: 10, flexWrap: 'wrap' },
  primaryDealAction: { minHeight: 44, borderRadius: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryDealActionText: { color: '#fff', fontSize: 12, fontWeight: '850' },
  secondaryDealAction: { minHeight: 44, borderRadius: 11, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
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
  bookingTiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bookingTier: { flexGrow: 1, flexBasis: 132, minWidth: 0, padding: 12 },
  calendarHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 17, marginBottom: 9 },
  swipeHint: { fontSize: 10.5, fontWeight: '650' },
  calendarList: { width: '100%', overflow: 'visible' },
  dateStrip: { gap: 8, paddingRight: 4, paddingBottom: 4 },
  calendarToggle: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  dateCardExpanded: { flex: 1, margin: 3 },
  dateCard: { width: 68, minHeight: 66, borderWidth: 1, borderRadius: 13, padding: 9, alignItems: 'center', justifyContent: 'center' },
  dateText: { fontSize: 12, fontWeight: '850' },
  dateFree: { color: '#738396', fontSize: 20, fontWeight: '950', marginTop: 5 },
  datePremium: { color: '#B7791F', fontSize: 20, fontWeight: '950', marginTop: 5 },
  dateState: { fontSize: 9.5, fontWeight: '700', textAlign: 'center', marginTop: 3 },
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
  recentWrap: { marginTop: 14, gap: 8 },
  recentRow: { gap: 8, paddingRight: 12 },
  recentChip: { minHeight: 48, minWidth: 118, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 7, justifyContent: 'center' },
  recentPlate: { fontSize: 12.5, fontWeight: '900', letterSpacing: 0.3 },
  recentStatus: { fontSize: 10.5, marginTop: 2 },
});
