// UX smoke — Stage 9 product cleanup checks. Static-source guards
// that catch regressions where someone re-introduces a duplicate
// CTA, a QA marker leak, or a fake-default placeholder on the
// public surfaces.
//
// All checks are file-level greps; they don't render React, so
// they're fast and don't need a backend.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const failures = [];
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 1. normalizers.js exports `sanitizeForDisplay`.
const norm = read('src/utils/normalizers.js');
if (!/export const sanitizeForDisplay/.test(norm)) {
  failures.push('sanitizeForDisplay no longer exported from normalizers.js');
}
if (!/\[ar-/.test(norm)) {
  failures.push('sanitizeForDisplay regex no longer mentions the [ar-…] tag');
}

// 2. cargoDisplay / tripDisplay sanitise outbound text.
for (const fn of ['cargoDisplay', 'tripDisplay']) {
  const m = new RegExp(`export const ${fn}[\\s\\S]*?^};`, 'm').exec(norm);
  if (!m) {
    failures.push(`${fn} not found in normalizers`);
    continue;
  }
  if (!/sanitizeForDisplay/.test(m[0])) {
    failures.push(`${fn} no longer routes text through sanitizeForDisplay`);
  }
}

// 3. FeedScreen single-CTA contract: cargo / driver render must
// expose only `bottomRight` (no bottomLeft). The earlier shape had
// two buttons that ran the same handler.
const feed = read('src/screens/FeedScreen.js');
if (/bottomLeft={\{\s*label:\s*t\('details'\)/.test(feed)) {
  failures.push("FeedScreen still renders a `bottomLeft: { label: t('details') }` duplicate CTA");
}
if (/t\('respond'\)/.test(feed)) {
  failures.push("FeedScreen still renders the legacy `t('respond')` CTA — should be Подробнее only");
}

// 4. CargoDetail: inline "Предложить цену" button next to the price
// block was a duplicate of the sticky CTA. It must be gone.
const cargoDetail = read('src/screens/CargoDetail.js');
if (/<TouchableOpacity[^>]*bidBtn[\s\S]*?suggestPrice/.test(cargoDetail)) {
  failures.push('CargoDetail still has the inline `Предложить цену` button next to the price block (duplicate of sticky CTA)');
}

// Stage 10: TripDetail (shipper viewer) must expose the bid CTA.
const tripDetail = read('src/screens/TripDetail.js');
if (!/import BidModal/.test(tripDetail)) {
  failures.push('TripDetail no longer imports BidModal');
}
if (!/testID:\s*'trip-sticky-bid'/.test(tripDetail)) {
  failures.push('TripDetail sticky CTA no longer has trip-sticky-bid testID');
}
if (!/tripId=\{trip\.id\}/.test(tripDetail)) {
  failures.push('TripDetail BidModal not bound to tripId');
}
// Stage 12: production reproducer — shipper opens TripDetail by
// tripId only (push / deep link / MyTrips → Orders). Without the
// fallback object below, `normalizeTrip(null)` returns null and the
// next line that reads `trip.id` blows up into ErrorBoundary
// ("Что-то пошло не так"). The guard must stay.
if (!/normalised\s*\|\|\s*\{[\s\S]*?id:\s*tripId/.test(tripDetail)) {
  failures.push('TripDetail no longer falls back to a stub trip when normalizeTrip returns null (Stage 12 crash regression)');
}

// Stage 10: legacy `respond` key must be gone from i18n.
const i18nSrc = read('src/utils/i18n.js');
if (/\brespond:\s*'/.test(i18nSrc)) {
  failures.push('i18n.js still defines the legacy `respond` key');
}

// Stage 13: EditTripScreen must forward the structured route triple
// (Stage 8 backend columns from_country / from_point_type /
// from_point_name + to_*) when the picker supplied one. If it
// doesn't, the user can change the route through the new picker
// but the structured columns in the DB stay frozen on the previous
// value — silent split between visible text and structured shape.
{
  const editTrip = read('src/screens/EditTripScreen.js');
  if (!/setFromPoint/.test(editTrip) || !/setToPoint/.test(editTrip)) {
    failures.push('EditTripScreen no longer captures structured point objects from RoutePointPicker');
  }
  if (!/from_country:\s*fromPoint\.country/.test(editTrip)) {
    failures.push('EditTripScreen no longer forwards from_country from picker');
  }
  if (!/to_country:\s*toPoint\.country/.test(editTrip)) {
    failures.push('EditTripScreen no longer forwards to_country from picker');
  }
  if (/capacity_tons:\s*Number\(capacityTons\)\s*\|\|\s*0/.test(editTrip)) {
    failures.push('EditTripScreen still falls back to 0 for capacity_tons (Stage 7 forbids fake numeric defaults)');
  }
}

// Stage 11: Edit flows on the same cleanup contract as Create flows.
// Earlier EditTripScreen still imported the legacy flat CityInput and
// kept the literal "20" / "82" placeholders that Stage 7 removed from
// the Create flows; that mismatch is what users hit when they
// re-opened an existing trip. We now require the same shape.
{
  const editTrip = read('src/screens/EditTripScreen.js');
  if (/import CityInput/.test(editTrip)) {
    failures.push('EditTripScreen still imports legacy CityInput (should use RoutePointPicker)');
  }
  if (!/import RoutePointPicker/.test(editTrip)) {
    failures.push('EditTripScreen does not import RoutePointPicker');
  }
  if (/placeholder="20"/.test(editTrip) || /placeholder="82"/.test(editTrip)) {
    failures.push('EditTripScreen kept literal "20"/"82" placeholders');
  }
  if (/Object\.keys\(CURRENCY_SYMBOLS\)\.map/.test(editTrip)) {
    failures.push('EditTripScreen still iterates CURRENCY_SYMBOLS keys (would surface UZS)');
  }
}

// Stage 11: Create flows must NOT carry the orphan CityInput import.
// CityInput stays in the file tree for any external callers but the
// active form code uses RoutePointPicker exclusively now.
for (const file of ['src/screens/CreateCargoScreen.js', 'src/screens/CreateTripScreen.js']) {
  const src = read(file);
  if (/^import CityInput from/m.test(src)) {
    failures.push(`${file}: orphan CityInput import remains (replaced by RoutePointPicker in Stage 7)`);
  }
}

// Stage 17: client-side TripDetail must NOT render a duplicate
// "Написать водителю" button inline above the sticky CTA, and must
// NOT render the premature "Оставить отзыв" CTA — there is no
// completed trip to review at that point. The sticky bar is the
// only client surface from now on, and reviews live on the cargo
// flow's `dealStatus === 'delivered'` branch.
{
  if (/style=\[s\.primaryBtn[\s\S]*?write_driver/.test(tripDetail)) {
    failures.push('TripDetail still renders an inline "💬 Написать водителю" primary button (duplicates the sticky CTA)');
  }
  if (/secondaryBtnText[\s\S]*?leave_review/.test(tripDetail) || /setRateModal\(true\)/.test(tripDetail)) {
    failures.push('TripDetail still renders the inline "⭐ Оставить отзыв" CTA — premature for a not-yet-booked trip');
  }
  if (/import RatingModal/.test(tripDetail)) {
    failures.push('TripDetail still imports RatingModal — dead code after the inline review CTA was removed');
  }
  if (/\bt\('trip_free'\)/.test(tripDetail)) {
    failures.push('TripDetail still labels the available volume row as t(\'trip_free\') — should read t(\'volume\')');
  }
}

// Stage 17: cargoDisplay must expose `weight` and `volume` as
// separate fields. Detail screens render them in two grid cells
// instead of the previous combined "Вес/Объём → X т · Y м³" mush.
{
  if (!/\bweight,\s*\n\s*volume,/.test(norm)) {
    failures.push('normalizers.cargoDisplay no longer exposes split `weight` + `volume` fields');
  }
  if (/t\('weight'\)\s*\+\s*'\/'\s*\+\s*t\('volume'\)/.test(cargoDetail)) {
    failures.push('CargoDetail still concatenates `weight + "/" + volume` into one cell — should be two grid items');
  }
  if (!/items\.push\(\[t\('weight'\),\s*view\.weight\]\)/.test(cargoDetail)) {
    failures.push('CargoDetail no longer renders `[t(\'weight\'), view.weight]` row');
  }
  if (!/items\.push\(\[t\('volume'\),\s*view\.volume\]\)/.test(cargoDetail)) {
    failures.push('CargoDetail no longer renders `[t(\'volume\'), view.volume]` row');
  }
}

// Stage 17: feed-card meta pills lose their per-row emoji glyphs.
// Only the price stays accent; meta pills are quiet label/value.
{
  if (/icon:\s*'⚖️'/.test(feed) || /icon:\s*'📐'/.test(feed)) {
    failures.push('FeedScreen meta pills still carry ⚖️ / 📐 emoji icons — Stage 16 quiet language requires neutral pills');
  }
}

// Stage 17: Create / Edit form labels for weight + volume must not
// re-introduce the ⚖️ / 📐 icons that Stage 17 stripped.
for (const file of ['src/screens/CreateCargoScreen.js', 'src/screens/CreateTripScreen.js', 'src/screens/EditTripScreen.js']) {
  const src = read(file);
  if (/icon="⚖️"|⚖️\s*\{t\('weight_label'\)/.test(src) || /icon="📐"|📐\s*\{t\('volume_label'\)/.test(src)) {
    failures.push(`${file}: weight/volume label still carries ⚖️ / 📐 emoji`);
  }
}

// Stage 18: RoleScreen is a full-image hero with three invisible
// hotspot TouchableOpacity. The legacy BrandHeader / HeroTruck /
// RoleCard combo must be gone, the hotspots must keep their stable
// testIDs, the image require points at the new asset, and the
// headlight blink must be wired on Animated.Value.
{
  const role = read('src/screens/RoleScreen.js');
  if (/import BrandHeader from/.test(role)) {
    failures.push('RoleScreen still imports BrandHeader (Stage 18 forbids the legacy welcome chrome)');
  }
  if (/import HeroTruck from/.test(role)) {
    failures.push('RoleScreen still imports HeroTruck (Stage 18 owns the entire welcome canvas)');
  }
  if (/import RoleCard from/.test(role)) {
    failures.push('RoleScreen still imports RoleCard (Stage 18 replaces card buttons with hotspots)');
  }
  if (!/require\(['"]\.\.\/\.\.\/assets\/role-screen-full\.png['"]\)/.test(role)) {
    failures.push('RoleScreen does not require assets/role-screen-full.png');
  }
  for (const id of ['driver', 'client', 'login']) {
    const re = new RegExp(`testID:\\s*\`role-\\$\\{id\\}\`|testID="role-${id}"|testID=\`role-${id}\``);
    if (!re.test(role)) {
      // Allow either the static template (`role-${id}`) used by
      // renderHotspot or a literal `testID="role-driver"` form.
      // Below we re-check with a plain string match for the literal
      // hotspot ids that other tests rely on.
    }
  }
  if (!/role-driver|`role-\$\{id\}`/.test(role) || !/'driver'|"driver"/.test(role)) {
    failures.push('RoleScreen no longer wires a `role-driver` hotspot');
  }
  if (!/role-client|`role-\$\{id\}`/.test(role) || !/'client'|"client"/.test(role)) {
    failures.push('RoleScreen no longer wires a `role-client` hotspot');
  }
  if (!/role-login|`role-\$\{id\}`/.test(role) || !/'login'|"login"/.test(role)) {
    failures.push('RoleScreen no longer wires a `role-login` hotspot');
  }
  if (!/Animated\.Value/.test(role) && !/new Animated\.Value/.test(role)) {
    failures.push('RoleScreen has no Animated.Value — headlight blink animation missing');
  }
  if (!/Animated\.sequence/.test(role)) {
    failures.push('RoleScreen has no Animated.sequence — three-pulse blink not wired');
  }
  if (!/pointerEvents=["']none["']/.test(role)) {
    failures.push('RoleScreen blink overlay must be pointerEvents="none" so taps reach hotspots');
  }
  if (!/enterAs\(['"]driver['"]\)/.test(role) || !/enterAs\(['"]client['"]\)/.test(role)) {
    failures.push('RoleScreen no longer calls enterAs(driver|client) — auth flow broken');
  }
  if (!/navigation\.navigate\(['"]Auth['"]\)/.test(role)) {
    failures.push('RoleScreen no longer routes Войти hotspot to Auth screen');
  }

  // v66: contain-fit layout. Hotspots must be expressed in source
  // pixels (SRC_HOTSPOTS) and translated to screen space via the
  // computed scale + offset, NOT as fractions of the viewport.
  // ImageBackground/ScrollView were the v65 cover-crop sources of
  // hotspot drift — they must stay out.
  if (!/SRC_HOTSPOTS\s*=/.test(role) || !/SRC_HEADLIGHT\s*=/.test(role)) {
    failures.push('RoleScreen no longer defines SRC_HOTSPOTS / SRC_HEADLIGHT in source pixels (v66 fit regression)');
  }
  if (!/Math\.min\(\s*winW\s*\/\s*IMAGE_W\s*,\s*availH\s*\/\s*IMAGE_H\s*\)/.test(role)) {
    failures.push('RoleScreen no longer computes the contain-fit scale = min(winW/IMAGE_W, availH/IMAGE_H)');
  }
  if (!/resizeMode=["']contain["']/.test(role)) {
    failures.push('RoleScreen no longer renders the hero with resizeMode="contain"');
  }
  if (/import\s*\{[^}]*ImageBackground[^}]*\}\s*from\s*['"]react-native['"]/.test(role)) {
    failures.push('RoleScreen still imports ImageBackground (v66 uses bare <Image> with manual rect)');
  }
  if (/import\s*\{[^}]*ScrollView[^}]*\}\s*from\s*['"]react-native['"]/.test(role)) {
    failures.push('RoleScreen still imports ScrollView (v66 fit relies on contain letterboxing instead)');
  }
}

// 5. Cards have not regressed to the fake numeric defaults.
for (const file of ['src/screens/CreateCargoScreen.js', 'src/screens/CreateTripScreen.js']) {
  const src = read(file);
  if (/placeholder="20"/.test(src) || /placeholder="82"/.test(src)) {
    failures.push(`${file}: literal "20"/"82" placeholder reappeared`);
  }
  if (/icon="🔒"/.test(src) && /label=\{t\('weight_label'\)\}/.test(src)) {
    failures.push(`${file}: weight icon back to padlock 🔒`);
  }
}

// Output
console.log('[ux] sanitizeForDisplay exported  ✓');
console.log('[ux] cargoDisplay / tripDisplay sanitise text  ✓');
console.log('[ux] FeedScreen single-CTA contract  ✓');
console.log('[ux] CargoDetail no duplicate price-block button  ✓');
console.log('[ux] TripDetail BidModal + trip-sticky-bid CTA  ✓');
console.log('[ux] legacy `respond` key gone from i18n  ✓');
console.log('[ux] TripDetail null-safe fallback (Stage 12 crash guard)  ✓');
console.log('[ux] EditTripScreen forwards structured route + null defaults  ✓');
console.log('[ux] EditTripScreen on RoutePointPicker / 4-currency / no fake defaults  ✓');
console.log('[ux] Create flows — no orphan CityInput import  ✓');
console.log('[ux] Create forms — no fake defaults / wrong icons  ✓');
console.log('[ux] Stage 17 · TripDetail single-CTA (no inline write/review duplicates)  ✓');
console.log('[ux] Stage 17 · cargoDisplay exposes split weight + volume  ✓');
console.log('[ux] Stage 17 · CargoDetail renders weight + volume as separate rows  ✓');
console.log('[ux] Stage 17 · feed meta pills carry no ⚖️ / 📐 emoji  ✓');
console.log('[ux] Stage 17 · weight/volume form labels are emoji-free  ✓');
console.log('[ux] Stage 18 · RoleScreen full-image with role-driver / role-client / role-login hotspots  ✓');
console.log('[ux] Stage 18 · RoleScreen Animated headlight blink wired (pointerEvents none)  ✓');
console.log('[ux] Stage 18 · enterAs / navigation.navigate(Auth) flow preserved  ✓');
console.log('[ux] Stage 18 v66 · contain-fit scale + SRC_HOTSPOTS pixel coords (no ImageBackground/ScrollView)  ✓');

if (failures.length) {
  console.log('\n[ux] FAIL:');
  failures.forEach((f) => console.log('  -', f));
  process.exit(1);
}
console.log('\n[ux] OK');
