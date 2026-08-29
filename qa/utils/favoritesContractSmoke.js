// favoritesContractSmoke — regression guard for server-side bookmarks.
// Product contract (29.08.2026):
// - driver saves a concrete cargo by cargo.id;
// - shipper saves a concrete published trip by trip.id (NOT the driver id);
// - FavoritesScreen loads every type and routes cargo/trip/driver correctly;
// - canonical saved icon is bookmark; repeated taps are guarded in-flight.

import fs from 'node:fs';
import assert from 'node:assert/strict';

const feedCard = fs.readFileSync('src/components/ui/v1/FeedCard.js', 'utf8');
const shipperFeed = fs.readFileSync('src/screens/FeedScreen.js', 'utf8');
const driverFeed = fs.readFileSync('src/screens/CargoFeedScreen.js', 'utf8');
const favorites = fs.readFileSync('src/screens/FavoritesScreen.js', 'utf8');

// Canonical icon remains a bookmark everywhere.
assert.ok(/name="bookmark"/.test(feedCard), 'FeedCard bookmark icon required');
assert.ok(!/name="heart"/.test(feedCard), 'FeedCard must not regress to a heart icon');
assert.ok(/name="bookmark"/.test(driverFeed), 'Driver cargo feed bookmark icon required');
assert.ok(/name="bookmark"/.test(shipperFeed), 'Shipper trip feed bookmark icon required');
assert.ok(/FontAwesome5 name="bookmark"/.test(favorites), 'FavoritesScreen bookmark icon required');

// Driver side: each saved cargo is keyed by its own cargo id.
assert.ok(/favList\('cargo'\)/.test(driverFeed), 'Driver feed must load cargo favorites');
assert.ok(/favAdd\('cargo', id/.test(driverFeed), 'Driver feed must save cargo.id');
assert.ok(/favRemove\('cargo', id/.test(driverFeed), 'Driver feed must remove cargo.id');
assert.ok(/savedIds\.has\(String\(item\.id\)\)/.test(driverFeed), 'Driver saved state must be item.id based');
assert.ok(/savedBusyRef/.test(driverFeed), 'Driver saved toggle needs an in-flight guard');
assert.ok(/testID="cargo-filter-favorites"/.test(driverFeed), 'Driver Saved filter is part of the feed contract');

// Shipper side: save the concrete trip, never all trips of the same driver.
assert.ok(/favList\('trip'\)/.test(shipperFeed), 'Shipper feed must load trip favorites');
assert.ok(/favAdd\('trip', id/.test(shipperFeed), 'Shipper feed must save trip.id');
assert.ok(/favRemove\('trip', id/.test(shipperFeed), 'Shipper feed must remove trip.id');
assert.ok(/savedIds\.has\(String\(item\.id\)\)/.test(shipperFeed), 'Shipper saved state must be item.id based');
assert.ok(/savedBusyRef/.test(shipperFeed), 'Shipper saved toggle needs an in-flight guard');
assert.ok(/testID="trip-filter-favorites"/.test(shipperFeed), 'Shipper Saved filter is part of the feed contract');
assert.ok(!/favList\('driver'\)/.test(shipperFeed), 'Shipper feed must not group saved state by driver');
assert.ok(!/driverId \|\| item\.id/.test(shipperFeed), 'Shipper feed must not fall back to driverId for a saved trip');

// Favorites hub must expose every saved type and open it in the correct detail screen.
assert.ok(/favList\(''\)/.test(favorites), 'FavoritesScreen must request all item types');
assert.ok(/item_type === 'cargo'/.test(favorites) && /navigate\('CargoDetail'/.test(favorites), 'Saved cargo must open CargoDetail');
assert.ok(/item_type === 'trip'/.test(favorites) && /navigate\('TripDetail'/.test(favorites), 'Saved trip must open TripDetail');
assert.ok(/navigate\('DriverDetail'/.test(favorites), 'Legacy/saved driver must open DriverDetail');
assert.ok(/favRemove\(fav\.item_type, fav\.item_id\)/.test(favorites), 'FavoritesScreen must remove the exact type+id pair');

console.log('favorites contract OK: cargo.id + trip.id bookmarks, Saved filters, correct Favorites routing, no per-driver grouping');
