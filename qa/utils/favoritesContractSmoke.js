// favoritesContractSmoke — статический regression-guard для бага с
// прод-скриншотов владельца (2026-08-18): «сохраняю груз/водителя — в
// Избранном пусто» + флажок вместо сердечка + не видно отзывов на карточке.
//
// Три первопричины, три группы проверок (см. PR/CHANGELOG для деталей):
//   1. Иконка избранного — сердце (heart), а не bookmark, в обоих местах,
//      где пользователь сохраняет (карточка водителя И карточка груза).
//   2. FavoritesScreen обязан запрашивать ВСЕ типы одним запросом
//      (favList('') — backend уже поддерживал это, фронт не пользовался)
//      и уметь открыть/удалить оба типа (driver → DriverDetail,
//      cargo → CargoDetail).
//   3. Отзывы (priceCaption) реально рендерятся на карточке ленты, а не
//      "kept for API compatibility; intentionally not rendered".
//
// Плюс регрессия на двойной тап (busy-guard) и accessibility-лейбл.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const feedCard = fs.readFileSync('src/components/ui/v1/FeedCard.js', 'utf8');
const feedScreen = fs.readFileSync('src/screens/FeedScreen.js', 'utf8');
const cargoFeed = fs.readFileSync('src/screens/CargoFeedScreen.js', 'utf8');
const favScreen = fs.readFileSync('src/screens/FavoritesScreen.js', 'utf8');

// ─── 1. Иконка: сердце, не флажок ───────────────────────────────────────
assert.ok(/name="heart"/.test(feedCard), 'FeedCard (карточка водителя в ленте клиента) должна использовать сердце');
assert.ok(!/name="bookmark"/.test(feedCard), 'FeedCard не должен содержать флажок (bookmark) как иконку избранного');
assert.ok(/name="heart"/.test(cargoFeed), 'CargoFeedScreen (карточка груза в ленте водителя) должна использовать сердце');
assert.ok(!/name="bookmark"/.test(cargoFeed), 'CargoFeedScreen не должен содержать флажок (bookmark) как иконку избранного');
assert.ok(/name="heart".*solid/.test(favScreen) || /FontAwesome5 name="heart"/.test(favScreen),
  'FavoritesScreen должен использовать то же сердце, что и карточки (визуальная консистентность)');

// Accessibility: лейбл обязан отличаться по состоянию (не статичная строка).
assert.ok(/accessibilityLabel=\{favActive \? t\('in_favorites'\) : t\('add_to_favorites'\)\}/.test(feedCard),
  'Кнопка избранного на FeedCard должна иметь accessibilityLabel, зависящий от состояния (сохранено/не сохранено)');
assert.ok(/accessibilityLabel=\{saved \?/.test(cargoFeed),
  'Кнопка избранного на CargoFeedScreen должна иметь accessibilityLabel, зависящий от состояния');

// testID не менялся (контракт Maestro/Playwright).
assert.ok(/testID="feed-fav"/.test(feedCard), 'testID="feed-fav" обязателен для Maestro feed-favorite-heart.yaml');
assert.ok(/testID=\{`cargo-card-bookmark-\$\{item\.id\}`\}/.test(cargoFeed), 'testID карточки груза не должен меняться (контракт QA)');

// ─── 2. FavoritesScreen: оба типа одним запросом ────────────────────────
assert.ok(/favList\(''\)/.test(favScreen),
  'FavoritesScreen обязан запрашивать ВСЕ типы избранного одним запросом (favList(\'\')) — иначе cargo-избранное невидимо (первопричина бага)');
// Строка комментария выше документирует СТАРЫЙ баг (favList('driver')) —
// исключаем строки-комментарии, ищем только активный код.
const favScreenCode = favScreen.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
assert.ok(!/favList\('driver'\)/.test(favScreenCode),
  'FavoritesScreen не должен жёстко фильтровать только driver в коде — это и была первопричина «сохраняю груз — не вижу»');
assert.ok(/item_type === 'cargo'/.test(favScreen) && /navigate\('CargoDetail'/.test(favScreen),
  'FavoritesScreen обязан уметь открыть cargo-запись в CargoDetail');
assert.ok(/navigate\('DriverDetail'/.test(favScreen),
  'FavoritesScreen обязан уметь открыть driver-запись в DriverDetail');
assert.ok(/removeItem/.test(favScreen) && /favRemove/.test(favScreen),
  'FavoritesScreen обязан поддерживать удаление из избранного прямо из списка');

// ─── 3. Отзывы реально рендерятся ────────────────────────────────────────
assert.ok(!/intentionally not rendered/.test(feedCard),
  'priceCaption (счётчик отзывов на карточке водителя) не должен быть мёртвым пропом');
assert.ok(/\{priceCaption \?/.test(feedCard), 'FeedCard обязан рендерить priceCaption, если он передан');
assert.ok(/reviews: rawT\.driver_reviews_count \|\| 0/.test(feedScreen),
  'Карточки из /market/trips обязаны брать реальный driver_reviews_count с бэкенда (не выдумывать на фронте)');
assert.ok(/reviews: d\.reviews_count \|\| 0/.test(feedScreen),
  'Карточки из /market/drivers обязаны брать реальный reviews_count с бэкенда (не выдумывать на фронте)');

// ─── Двойной тап: busy-guard на обоих экранах сохранения ────────────────
assert.ok(/favBusyRef/.test(feedScreen), 'FeedScreen.toggleFav обязан игнорировать повторный тап, пока запрос в полёте');
assert.ok(/savedBusyRef/.test(cargoFeed), 'CargoFeedScreen.toggleSaved обязан игнорировать повторный тап, пока запрос в полёте');

console.log('favorites contract OK: heart-иконка везде, favList(\'\') покрывает оба типа, отзывы рендерятся, busy-guard на месте');
