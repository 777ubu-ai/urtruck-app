// In-memory client-side cache for trips/cargos/chats actually published in
// the current session. Production runtime starts fully empty: real data
// always comes from /api/v1/market/* via marketAPI.js. Demo seed lists were
// removed from default state to stop polluting the public feed; if a future
// dev flow needs sample data, gate it behind a build-time `__DEV__` check
// AND an explicit env flag — never import demo data in production bundles.
const listeners = new Set();
const notify = () => listeners.forEach(cb => cb());

export const subscribe = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

// Production default: no fake trips. addTrip() pushes user-published items.
let trips = [];
export const getTrips = () => trips;
export const getTrip = (id) => trips.find(t => t.id === id);
export const TRIP_STATES = ['planned', 'picked_up', 'in_transit', 'delivered'];
// Labels use i18n keys — resolved at render time via t()
export const TRIP_STATE_INFO = {
  planned:    { icon: '📝', labelKey: 'trip_planned',        color: '#78716C' },
  picked_up:  { icon: '📦', labelKey: 'trip_cargo_accepted', color: '#FF8400' },
  // in_transit = warning/orange (in-flight), delivered = success/emerald.
  // Splitting them avoids two phases reading as the same confirmed state.
  in_transit: { icon: '🚛', labelKey: 'trip_in_transit',     color: '#FF8400' },
  delivered:  { icon: '✅', labelKey: 'trip_delivered',      color: '#22C55E' },
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

// Pilot cleanup: removed hardcoded demo cargos fallback. Driver feed shows
// only server-returned cargos; without records the FlatList renders the
// existing empty state.
let cargos = [];
export const getCargos = () => cargos;
export const addCargo = (c) => { cargos = [{ ...c, id: 'c' + Date.now(), bids: 0, isMine: true, createdAt: Date.now() }, ...cargos]; notify(); };

// Production default: no fake chats. ChatsListScreen pulls real rooms from
// /api/v1/chat/rooms; this local cache is only for transient UI state.
let chats = [];
export const getChats = () => chats;
export const markChatRead = (id) => { chats = chats.map(c => c.id === id ? { ...c, unread: 0, status: 'read' } : c); notify(); };

// Production default: no fake archived deals. Real history comes from
// /api/v1/market/deals (delivered status filter).
let archive = [];
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

// Production default: no fake notifications. Real notifications arrive via
// /api/v1/notifications and addNotification() runtime calls.
let notifications = [];
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

// Production default: no fake wallet transactions. Real history is loaded
// per-user from server when wallet API is wired.
let transactions = [];
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
