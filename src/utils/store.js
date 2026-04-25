// Простое in-memory хранилище для опубликованных рейсов/грузов/чатов
// (для демо-режима без БД)

const listeners = new Set();
const notify = () => listeners.forEach(cb => cb());

export const subscribe = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

// Рейсы водителей с системой согласия на трекинг
let trips = [
  { id: 't1', from: 'Москва, RU', to: 'Иу, CN', transit: 'Казахстан',
    departure: '15.04.2026', arrival: '25.04.2026', truckType: 'tent',
    status: 'loading', driverName: 'Ержан К.',
    tracking_allowed: false,        // согласие водителя
    tracking_request: null,          // 'pending' | 'approved' | 'denied'
    tracking_requested_by: null,     // user_id клиента
  },
];
export const getTrips = () => trips;
export const getTrip = (id) => trips.find(t => t.id === id);
export const TRIP_STATES = ['planned', 'picked_up', 'in_transit', 'delivered'];
export const TRIP_STATE_INFO = {
  planned:    { icon: '📝', label: 'Запланирован', color: '#78716C' },
  picked_up:  { icon: '📦', label: 'Груз принят',  color: '#F59E0B' },
  in_transit: { icon: '🚛', label: 'В пути',       color: '#2563EB' },
  delivered:  { icon: '✅', label: 'Доставлен',    color: '#22C55E' },
};

export const addTrip = (t) => {
  trips = [{
    ...t, id: 't' + Date.now(),
    status: 'active',
    trip_state: 'planned',
    state_history: [{ state: 'planned', at: Date.now() }],
    tracking_allowed: false, tracking_request: null,
    isMine: true, createdAt: Date.now(),
  }, ...trips];
  notify();
};

export const advanceTripState = (tripId, nextState) => {
  trips = trips.map(t => {
    if (t.id !== tripId) return t;
    const history = [...(t.state_history || []), { state: nextState, at: Date.now() }];
    return { ...t, trip_state: nextState, state_history: history };
  });
  const info = TRIP_STATE_INFO[nextState];
  if (info) {
    addNotification({
      type: 'trip_state',
      icon: info.icon,
      title: `Рейс: ${info.label}`,
      text: `Статус обновлён: ${info.label.toLowerCase()}`,
    });
  }
  notify();
};

// Клиент запрашивает трекинг → водитель видит уведомление
export const requestTracking = (tripId, clientId) => {
  trips = trips.map(t => t.id === tripId
    ? { ...t, tracking_request: 'pending', tracking_requested_by: clientId }
    : t
  );
  // Уведомление водителю
  addNotification({
    type: 'tracking_request',
    icon: '📍',
    title: 'Запрос на отслеживание',
    text: `Клиент просит включить GPS-трекинг для рейса ${tripId}`,
  });
  notify();
};

// Водитель отвечает на запрос
export const respondTracking = (tripId, allow) => {
  trips = trips.map(t => t.id === tripId
    ? { ...t, tracking_allowed: !!allow, tracking_request: allow ? 'approved' : 'denied' }
    : t
  );
  addNotification({
    type: allow ? 'tracking_approved' : 'tracking_denied',
    icon: allow ? '✅' : '❌',
    title: allow ? 'Трекинг разрешён' : 'Трекинг отклонён',
    text: `Водитель ${allow ? 'разрешил' : 'отклонил'} GPS-трекинг`,
  });
  notify();
};

// Водитель в любой момент может выключить
export const stopTrackingPermission = (tripId) => {
  trips = trips.map(t => t.id === tripId
    ? { ...t, tracking_allowed: false, tracking_request: 'denied' }
    : t
  );
  notify();
};

// Грузы клиентов
let cargos = [
  { id: 'c1', from: 'Иу, CN', to: 'Алматы, KZ', cargo: 'Электросамокаты', tons: 18, m3: 75, price: 3200, type: 'tent', bids: 4, pickup: '15.04 ±2 дн.' },
  { id: 'c2', from: 'Москва, RU', to: 'Ташкент, UZ', cargo: 'Стройматериалы', tons: 20, m3: 110, price: 2200, type: 'tent', bids: 7, pickup: '20.04' },
  { id: 'c3', from: 'Шэньчжэнь, CN', to: 'Новосибирск, RU', cargo: 'LED-панели', tons: 15, m3: 60, price: 5800, type: 'ref', bids: 2, pickup: '18.04 ±3 дн.' },
  { id: 'c4', from: 'Алматы, KZ', to: 'Иу, CN', cargo: 'Мёд экспорт', tons: 12, m3: 40, price: 2400, type: 'ref', bids: 5, pickup: '22.04' },
  { id: 'c5', from: 'Бишкек, KG', to: 'Пекин, CN', cargo: 'Мясо говяжье', tons: 22, m3: 65, price: 3500, type: 'ref', bids: 1, pickup: '16.04 ±1 дн.' },
  { id: 'c6', from: 'Гамбург, DE', to: 'Астана, KZ', cargo: 'Оборудование', tons: 18, m3: 85, price: 6200, type: 'tent', bids: 3, pickup: '25.04' },
];
export const getCargos = () => cargos;
export const addCargo = (c) => { cargos = [{ ...c, id: 'c' + Date.now(), bids: 0, isMine: true, createdAt: Date.now() }, ...cargos]; notify(); };

// Чаты
let chats = [
  { id: 'ch1', partnerName: 'Бахтиёр У.', partnerCountry: 'UZ', lastMessage: 'Выезжаю сегодня', time: '15м', unread: 2, online: true, status: 'sent' },
  { id: 'ch2', partnerName: 'Ержан К.', partnerCountry: 'KZ', lastMessage: 'OK, договорились', time: '2ч', unread: 0, online: false, status: 'read' },
  { id: 'ch3', partnerName: 'Asia Import', partnerCountry: 'KZ', lastMessage: 'Фото груза пришлите', time: '1д', unread: 5, online: true, status: 'sent' },
  { id: 'ch4', partnerName: 'Wang Lei', partnerCountry: 'CN', lastMessage: '货物已到达', time: '3д', unread: 0, online: false, status: 'read' },
  { id: 'ch5', partnerName: 'Marat T.', partnerCountry: 'KG', lastMessage: '🎤 0:15', time: '5д', unread: 1, online: false, status: 'sent' },
];
export const getChats = () => chats;
export const markChatRead = (id) => { chats = chats.map(c => c.id === id ? { ...c, unread: 0, status: 'read' } : c); notify(); };

// Архив сделок
let archive = [
  { id: 'a1', from: 'Иу, CN', to: 'Алматы, KZ', cargo: 'Одежда', price: 2800, rating: 5, date: '15.03.2026', status: 'completed' },
  { id: 'a2', from: 'Москва, RU', to: 'Ташкент, UZ', cargo: 'Металл', price: 3200, rating: 5, date: '02.03.2026', status: 'completed' },
  { id: 'a3', from: 'Шэньчжэнь, CN', to: 'Новосибирск, RU', cargo: 'Электроника', price: 5500, rating: 4, date: '18.02.2026', status: 'completed' },
];
export const getArchive = () => archive;

// Чёрный список
let blacklist = [];
export const getBlacklist = () => blacklist;
export const addBlacklist = (u) => { blacklist = [...blacklist, u]; notify(); };
export const removeBlacklistItem = (id) => { blacklist = blacklist.filter(b => b.id !== id); notify(); };

// Избранное (лайки)
let favorites = new Set();
export const getFavorites = () => Array.from(favorites);
export const isFavorite = (id) => favorites.has(id);
export const toggleFavorite = (id) => {
  if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
  notify();
};

// Удаление своих публикаций
export const removeCargo = (id) => { cargos = cargos.filter(c => c.id !== id); notify(); };
export const removeTrip = (id) => { trips = trips.filter(t => t.id !== id); notify(); };

// Профили пользователей (локальный демо-режим заменяет drivers/customers из БД)
let profiles = {};
export const saveProfile = (userId, data) => { profiles[userId] = { ...(profiles[userId] || {}), ...data, updatedAt: Date.now() }; notify(); };
export const getProfile = (userId) => profiles[userId] || null;

// Live GPS-симуляция движения водителя
let liveTracking = null;
let liveInterval = null;

export const startTracking = (tripId, fromCoord, toCoord, transitCoord) => {
  if (liveInterval) clearInterval(liveInterval);
  let progress = 0;
  liveTracking = {
    tripId, fromCoord, toCoord, transitCoord,
    currentCoord: fromCoord, progress: 0, isActive: true, startTime: Date.now(),
  };
  liveInterval = setInterval(() => {
    if (!liveTracking || !liveTracking.isActive) return;
    progress += 0.01; // 1% в 5 секунд (для демо)
    if (progress >= 1) progress = 1;
    let coord;
    if (transitCoord && progress < 0.5) {
      const p = progress * 2;
      coord = [fromCoord[0] + (transitCoord[0] - fromCoord[0]) * p, fromCoord[1] + (transitCoord[1] - fromCoord[1]) * p];
    } else if (transitCoord) {
      const p = (progress - 0.5) * 2;
      coord = [transitCoord[0] + (toCoord[0] - transitCoord[0]) * p, transitCoord[1] + (toCoord[1] - transitCoord[1]) * p];
    } else {
      coord = [fromCoord[0] + (toCoord[0] - fromCoord[0]) * progress, fromCoord[1] + (toCoord[1] - fromCoord[1]) * progress];
    }
    liveTracking.currentCoord = coord;
    liveTracking.progress = progress;
    notify();
    if (progress >= 1) stopTracking();
  }, 5000);
  notify();
};

export const stopTracking = () => {
  if (liveInterval) clearInterval(liveInterval);
  liveInterval = null;
  if (liveTracking) liveTracking.isActive = false;
  notify();
};

export const getTracking = () => liveTracking;

// Уведомления
let notifications = [
  { id: 'n1', type: 'bid', icon: '💰', title: 'Новая ставка', text: 'Бахтиёр У. предложил $3400 за груз Иу→Алматы', time: '5м', read: false },
  { id: 'n2', type: 'message', icon: '💬', title: 'Новое сообщение', text: 'Ержан К.: Выезжаю сегодня', time: '15м', read: false },
  { id: 'n3', type: 'status', icon: '🚚', title: 'Статус рейса', text: 'Москва→Иу: пересёк границу Казахстана', time: '2ч', read: false },
  { id: 'n4', type: 'bid_accepted', icon: '✓', title: 'Ставка принята', text: 'Клиент принял вашу ставку $3500', time: '4ч', read: true },
  { id: 'n5', type: 'review', icon: '⭐', title: 'Новый отзыв', text: 'Asia Import: 5★ "Всё чётко, рекомендую"', time: '1д', read: true },
];
export const getNotifications = () => notifications;
export const addNotification = (n) => {
  const entry = { ...n, id: 'n' + Date.now(), time: 'сейчас', read: false };
  notifications = [entry, ...notifications];
  notify();
  // Отправляем push если разрешено
  try {
    const { pushSupported, getPermission, showLocalNotification } = require('./pushNotifications');
    if (pushSupported() && getPermission() === 'granted') {
      showLocalNotification(`${n.icon || '🚛'} ${n.title || 'UrTruck'}`, {
        body: n.text || '',
        tag: n.type || 'urtruck',
      });
    }
  } catch {}
};
export const markNotificationRead = (id) => { notifications = notifications.map(n => n.id === id ? { ...n, read: true } : n); notify(); };
export const markAllNotificationsRead = () => { notifications = notifications.map(n => ({ ...n, read: true })); notify(); };
export const getUnreadNotifications = () => notifications.filter(n => !n.read).length;

// Транзакции (история кошелька)
let transactions = [
  { id: 'tx1', type: 'deal_income', amount: 3200, currency: 'USD', desc: 'Иу → Алматы · Электросамокаты', date: '14.03.2026', status: 'completed' },
  { id: 'tx2', type: 'contact_purchase', amount: -2, currency: 'USD', desc: 'Контакт: Бахтиёр У.', date: '12.03.2026', status: 'completed' },
  { id: 'tx3', type: 'deal_income', amount: 4500, currency: 'USD', desc: 'Гуанчжоу → Ташкент · Текстиль', date: '02.03.2026', status: 'completed' },
  { id: 'tx4', type: 'topup', amount: 100, currency: 'USD', desc: 'Пополнение Visa', date: '01.03.2026', status: 'completed' },
  { id: 'tx5', type: 'contact_purchase', amount: -2, currency: 'USD', desc: 'Контакт: Ержан К.', date: '28.02.2026', status: 'completed' },
];
export const getTransactions = () => transactions;
export const addTransaction = (t) => { transactions = [{ ...t, id: 'tx' + Date.now() }, ...transactions]; notify(); };

// Push-фильтр
let pushSettings = {
  onlyMyRoutes: false,
  minTons: '',
  minPrice: '',
  truckTypes: [],
};
export const getPushSettings = () => pushSettings;
export const setPushSettings = (s) => { pushSettings = { ...pushSettings, ...s }; notify(); };
