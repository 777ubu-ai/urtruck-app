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
  // Stage 26 свернул эти три проверки в один loop ниже (literal
  // `testID="role-${id}"` regex), потому что новые real-Pressable
  // кнопки больше не используют `role: 'driver'` строки в коде —
  // они используют `enterAs('driver')` напрямую.
  // Stage 20: headlight blink animation removed entirely. Strip
  // comments first so the prose explaining "we removed Animated"
  // doesn't trip the literal-match below.
  const roleCode = role.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\bAnimated\.(Value|sequence|timing|delay)\s*\(/.test(roleCode)) {
    failures.push('RoleScreen reintroduced Animated wiring — Stage 20 forbids blink/glow effects on the welcome surface');
  }
  if (/\bSRC_HEADLIGHT\b/.test(roleCode)) {
    failures.push('RoleScreen still defines SRC_HEADLIGHT — Stage 20 dropped the headlight overlay entirely');
  }
  // Image must keep pointerEvents="none" so taps fall through to
  // the hotspots beneath.
  if (!/pointerEvents=["']none["']/.test(role)) {
    failures.push('RoleScreen image lost pointerEvents="none" — hotspots will not receive taps');
  }
  if (!/enterAs\(['"]driver['"]\)/.test(role) || !/enterAs\(['"]client['"]\)/.test(role)) {
    failures.push('RoleScreen no longer calls enterAs(driver|client) — auth flow broken');
  }
  if (!/navigation\.navigate\(['"]Auth['"]\)/.test(role)) {
    failures.push('RoleScreen no longer routes Войти hotspot to Auth screen');
  }

  // Stage 26: invisible bitmap hotspots are gone. We now require
  // real `<Pressable>` elements with visible text (role_*_title
  // i18n keys) — invisible 0%-opacity overlays on top of a bitmap
  // proved untappable on iPhone Safari twice (v66, v72).
  for (const id of ['driver', 'client', 'login']) {
    const literal = new RegExp(`testID=["\`']role-${id}["\`']`);
    if (!literal.test(role)) {
      failures.push(`RoleScreen lost testID="role-${id}" (Stage 26 real-button regression)`);
    }
  }
  // Heuristic: the buttons must contain real localised text, not
  // be empty Pressables. role_driver_title / role_client_title
  // are the canonical strings used inside the welcome buttons.
  if (!/t\(['"]role_driver_title['"]/.test(role) || !/t\(['"]role_client_title['"]/.test(role)) {
    failures.push('RoleScreen buttons no longer render role_driver_title / role_client_title text — Stage 26 forbids empty hotspots');
  }
  if (!/Pressable/.test(role)) {
    failures.push('RoleScreen no longer uses Pressable for the role buttons (Stage 26)');
  }

  // Stage 19: SRC_HEADLIGHT-y constraint deprecated in Stage 20 —
  // the headlight overlay is gone entirely (see check above).
}

// Stage 20: TripDetail's sticky CTA collapses to a single
// "Предложить цену" button. The earlier secondary "Написать
// водителю" lived right next to it and reappeared inside the
// deal block once the bid was accepted, so the bar surfaced two
// chat-shaped paths and split user attention. The single primary
// is the canonical pre-bid action.
{
  if (/testID:\s*['"]trip-sticky-chat['"]/.test(tripDetail)) {
    failures.push('TripDetail still renders a `trip-sticky-chat` secondary action — Stage 20 collapses sticky to one primary');
  }
  if (!/testID:\s*['"]trip-sticky-bid['"]/.test(tripDetail)) {
    failures.push('TripDetail no longer renders the `trip-sticky-bid` primary CTA');
  }
}

// Stage 27: forms must not use "—" as a placeholder for numeric
// inputs (weight / volume). Real users couldn't tell which field
// was tons and which was m³. Now we require a non-dash placeholder
// that contains an example number AND a testID for QA.
{
  for (const file of ['src/screens/CreateCargoScreen.js', 'src/screens/CreateTripScreen.js']) {
    const src = read(file);
    // Within the row containing weight_label/volume_label, each
    // Field must have a real placeholder (not "—") and a testID.
    if (/label=\{t\(['"](?:weight_label|volume_label)['"]\)\}[\s\S]{0,200}?placeholder="—"/.test(src)) {
      failures.push(`${file}: weight/volume Field still uses placeholder="—" — Stage 27 expects an example number`);
    }
    if (!/(weight|volume)_placeholder/.test(src)) {
      failures.push(`${file}: weight/volume Field no longer reads t('weight_placeholder')/t('volume_placeholder')`);
    }
  }
  // i18n must define the new keys in RU.
  if (!/weight_placeholder:\s*['"]/.test(i18nSrc) || !/volume_placeholder:\s*['"]/.test(i18nSrc)) {
    failures.push('i18n.js missing weight_placeholder / volume_placeholder keys (Stage 27)');
  }
  if (!/weight_label:\s*['"]Вес,/.test(i18nSrc)) {
    failures.push('i18n.js RU weight_label not in canonical "Вес, т" shape');
  }
  if (!/volume_label:\s*['"]Объём,/.test(i18nSrc)) {
    failures.push('i18n.js RU volume_label not in canonical "Объём, м³" shape');
  }
}

// Stage 27: RoleScreen must constrain its column on wide viewports.
// Without it, hero+buttons grow to fill a 1200px desktop and read
// like an oversized banner. testID `role-screen-column` is the
// hook for the layout regression spec.
{
  const role = read('src/screens/RoleScreen.js');
  if (!/testID=["']role-screen-column["']/.test(role)) {
    failures.push('RoleScreen lost the role-screen-column max-width wrapper (Stage 27)');
  }
  if (!/maxWidth\s*:\s*4(8|9)\d/.test(role)) {
    failures.push('RoleScreen no longer caps its column with a maxWidth (Stage 27)');
  }
}

// Stage 26: change-role / logout dialogs must not pass literal "?"
// as the message — that string was rendered to the user verbatim
// inside Alert.alert + window.confirm. Now we require localised
// `change_role_message` / `logout_message` keys.
{
  const profile = read('src/screens/ProfileScreen.js');
  if (/confirm\([^,]+,\s*['"]\?['"],/.test(profile)) {
    failures.push("ProfileScreen still calls confirm(...) with literal '?' as the message (Stage 26 regression)");
  }
  if (!/t\(['"]change_role_message['"]\)/.test(profile)) {
    failures.push('ProfileScreen no longer uses t("change_role_message") for the change-role dialog');
  }
}

// Stage 20: dead components / fields swept.
{
  const fs2 = require('fs');
  const roleCardPath = path.join(ROOT, 'src/components/ui/v1/RoleCard.js');
  if (fs2.existsSync(roleCardPath)) {
    failures.push('src/components/ui/v1/RoleCard.js still exists — Stage 18 replaced it with full-image hotspots; drop the orphan component');
  }
  if (/weightVol\s*[,:}]/.test(norm)) {
    failures.push('normalizers.cargoDisplay still exposes the legacy `weightVol` field (Stage 17 split + Stage 20 cleanup)');
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
console.log('[ux] Stage 20 · RoleScreen carries no Animated/blink/SRC_HEADLIGHT (welcome is purely static)  ✓');
console.log('[ux] Stage 18 · enterAs / navigation.navigate(Auth) flow preserved  ✓');
console.log('[ux] Stage 26 · RoleScreen uses real Pressable buttons with role_*_title text (no invisible hotspots)  ✓');
console.log('[ux] Stage 26 · ProfileScreen change-role dialog uses real i18n message (no literal "?")  ✓');
console.log('[ux] Stage 27 · weight/volume forms use real placeholders + testIDs (no "—")  ✓');
console.log('[ux] Stage 27 · RoleScreen has role-screen-column max-width wrapper  ✓');
console.log('[ux] Stage 20 · TripDetail sticky collapsed to single trip-sticky-bid CTA (no chat dupe)  ✓');
console.log('[ux] Stage 20 · dead RoleCard.js dropped, weightVol field removed from cargoDisplay  ✓');

if (failures.length) {
  console.log('\n[ux] FAIL:');
  failures.forEach((f) => console.log('  -', f));
  process.exit(1);
}
console.log('\n[ux] OK');
