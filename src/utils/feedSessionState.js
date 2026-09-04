// feedSessionState — session-scoped снимок состояния ленты (Task 3, §20).
//
// ЗАЧЕМ. Сценарий: пользователь выставил маршрут и вторичные фильтры,
// пролистал вниз, открыл карточку, нажал Back — и получал ленту с начала.
// Причина: экраны ленты жили только на локальном useState, а `useFocusEffect`
// на каждый возврат вызывал load() заново. Фильтры формально сохранялись
// (экран не размонтируется в стеке), но результаты перезапрашивались, и
// позиция скролла терялась.
//
// ЧТО ЭТО НЕ ТАКОЕ. Это НЕ персист «навсегда»: снимок живёт в памяти
// модуля, то есть до перезапуска приложения. Продуктового требования
// «фильтр помнится между запусками» нет, а сохранять его в storage значит
// встречать пользователя чужим фильтром через неделю.
//
// ПОЧЕМУ НЕ NAVIGATION-REFACTOR. Graphify по затрагиваемому scope: оба
// экрана ленты импортирует ТОЛЬКО src/navigation/AppNavigator.js (по одной
// строке import каждый), и ни один из них не связан с chat / voice / deal /
// workspace. Поэтому правка навигационного файла не требуется вовсе —
// восстановление делается внутри экранов, а путь Chat/Voice не трогается.
//
// Ключи снимков: 'loads' (лента грузов) и 'trucks' (лента машин/рейсов).

const SNAPSHOTS = new Map();

/** Ленты, у которых есть собственный снимок. */
export const FEED_KEYS = { LOADS: 'loads', TRUCKS: 'trucks' };

const EMPTY = Object.freeze({
  origin: null,
  destination: null,
  filters: null,
  items: null,
  pageLimit: null,
  scrollOffset: 0,
});

/**
 * Подпись фильтра. Восстанавливать закэшированные результаты можно ТОЛЬКО
 * когда фильтр тот же: иначе Back показал бы ленту от предыдущего фильтра.
 */
export const filterSignature = ({ origin, destination, filters } = {}) => JSON.stringify([
  origin?.countryId || null,
  origin?.locationId || null,
  destination?.countryId || null,
  destination?.locationId || null,
  filters || null,
]);

export const readFeedSnapshot = (key) => SNAPSHOTS.get(key) || EMPTY;

/** Частичное обновление снимка — поля, которых нет в patch, сохраняются. */
export const writeFeedSnapshot = (key, patch) => {
  const prev = SNAPSHOTS.get(key) || EMPTY;
  const next = { ...prev, ...patch };
  SNAPSHOTS.set(key, next);
  return next;
};

/**
 * Можно ли восстановить ленту без нового запроса.
 * Требуется и совпадение фильтра, и наличие уже загруженных страниц.
 */
export const canRestoreFeed = (key, current) => {
  const snap = SNAPSHOTS.get(key);
  if (!snap || !Array.isArray(snap.items) || snap.items.length === 0) return false;
  return filterSignature(snap) === filterSignature(current);
};

/** Явный сброс — на logout/смену роли, чтобы чужая лента не «прилипла». */
export const clearFeedSnapshot = (key) => {
  if (key) SNAPSHOTS.delete(key);
  else SNAPSHOTS.clear();
};
