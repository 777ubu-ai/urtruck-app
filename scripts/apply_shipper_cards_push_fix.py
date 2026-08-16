from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    p = ROOT / path
    src = p.read_text(encoding='utf-8')
    if old not in src:
        raise RuntimeError(f'pattern not found in {path}: {old[:80]!r}')
    src2 = src.replace(old, new, 1)
    p.write_text(src2, encoding='utf-8')


# 1) Route normalization: strip legacy emoji flags for ALL locales before UI
# adds countryFlag(). This fixes the 4-flag bug in MyTrips, FeedCard and Deals.
replace_once(
    'src/utils/places.js',
    """export function localizePlace(raw, lang) {
  const l = String(lang || '').toLowerCase();
  if (!raw) return raw;
  if (l !== 'zh' && l !== 'en') return raw;
  const clean = cleanPlaceName(raw);
  return localizeHead(clean, l);
}""",
    """export function localizePlace(raw, lang) {
  const l = String(lang || '').toLowerCase();
  if (!raw) return raw;
  // Always remove legacy presentation decorations first. RU/KK previously
  // returned raw DB text, so a city stored as \"Иу, 🇨🇳\" plus countryFlag(CN)
  // rendered two flags for the same point. Flags are a UI entity, never data.
  const clean = cleanPlaceName(raw);
  if (l !== 'zh' && l !== 'en') return clean;
  return localizeHead(clean, l);
}""",
)

# 2) Replace the old marketplace FeedCard. The new card mirrors the approved
# driver cargo card: route owns the full width, price is quieter/lower, and
# Save is one consistent filled bookmark instead of red/white hearts.
feed_card = r'''// FeedCard — unified marketplace card for cargo and trips.
// Route is the primary visual anchor; price and save action are secondary.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, v1AccentFor } from '../../../theme/designV1';
import { colors as v2 } from '../../../theme/designSystemV2';
import { useI18n } from '../../../utils/useI18n';
import { localizePlace } from '../../../utils/places';
import { countryFlag } from '../../../utils/countryFlags';

const SAVE = '#34936B';
const SAVE_SOFT = '#EAF5EF';

export default function FeedCard({
  variant = 'cargo',
  accent = 'driver',
  route,
  title,
  subtitle,
  meta = [],
  priceText,
  priceCaption, // kept for API compatibility; intentionally not rendered
  status,
  responses,
  bottomLeft,
  bottomRight,
  onPress,
  favActive,
  onToggleFav,
  compact = false,
  testID,
}) {
  const colors = useV1Colors();
  const { t, lang } = useI18n();
  const a = v1AccentFor(accent === 'cargo' ? 'client' : 'driver');
  const iconName = variant === 'trip' ? 'truck' : 'package';

  const trimSafe = (v) => (typeof v === 'string' ? v.trim() : '');
  const isEmptyOrDash = (s) => !s || s === '—' || s === '-' || s === '–';
  const fromText = trimSafe(route && route.from);
  const toText = trimSafe(route && route.to);
  const fromCountry = trimSafe(route && route.fromCountry);
  const toCountry = trimSafe(route && route.toCountry);
  const hasRoute = !(isEmptyOrDash(fromText) && isEmptyOrDash(toText));
  const loc = (v) => localizePlace(v, lang);
  const ff = (code) => countryFlag(code);
  const routeText = hasRoute
    ? `${isEmptyOrDash(fromText) ? '—' : `${ff(fromCountry) || ''} ${loc(fromText)}`.trim()} → ${isEmptyOrDash(toText) ? '—' : `${ff(toCountry) || ''} ${loc(toText)}`.trim()}`
    : t('route_pending');

  const titleOverride = typeof title === 'string' ? title.trim() : '';
  const titleText = titleOverride || routeText;
  const titleStrong = !!titleOverride || hasRoute;
  const compactMeta = meta.map((m) => m.value).filter(Boolean).join('  ·  ');
  const Card = onPress ? TouchableOpacity : View;

  return (
    <Card
      onPress={onPress}
      activeOpacity={0.85}
      style={[s.card, compact && s.cardCompact, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={testID}
    >
      <View style={[s.primaryRow, compact && s.primaryRowCompact]}>
        {compact ? null : (
          <View style={[s.iconBox, { backgroundColor: colors.surfaceLift, borderColor: colors.border }]}>
            <Feather name={iconName} size={20} color={v2.textSecondary} />
          </View>
        )}
        <View style={s.primaryText}>
          <Text
            style={[s.route, compact && s.routeCompact, { color: titleStrong ? colors.text : v2.textTertiary }]}
            numberOfLines={compact ? 1 : 2}
          >
            {titleText}
          </Text>
          {!compact && subtitle ? (
            <Text style={[s.subtitle, { color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text>
          ) : null}
          {compact && (compactMeta || subtitle) ? (
            <Text style={[s.metaCompact, { color: colors.textDim }]} numberOfLines={1}>
              {compactMeta || subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {meta.length && !compact ? (
        <View style={[s.metaRow, { borderTopColor: colors.border }]}>
          {meta.map((m, i) => (
            <View key={i} style={s.metaPill}>
              {m.icon ? <Text style={[s.metaIcon, { color: colors.textDim }]}>{m.icon}</Text> : null}
              <View>
                {m.label ? <Text style={[s.metaLabel, { color: colors.textDim }]}>{m.label}</Text> : null}
                <Text style={[s.metaValue, { color: colors.text }]} numberOfLines={1}>{m.value}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {(status || priceText || onToggleFav) ? (
        <View style={[s.valueRow, compact && s.valueRowCompact]}>
          <View style={s.valueLeft}>
            {status ? (
              <View style={[s.statusPill, { borderColor: colors.border }]}>
                <Text style={[s.statusText, { color: colors.textMuted }]}>{status}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.valueRight}>
            {priceText ? (
              <Text style={[s.price, compact && s.priceCompact, { color: colors.text }]} numberOfLines={1}>
                {priceText}
              </Text>
            ) : null}
            {onToggleFav ? (
              <TouchableOpacity
                onPress={(e) => { e?.stopPropagation?.(); onToggleFav(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[s.bookmarkBtn, favActive && s.bookmarkBtnActive]}
                testID="feed-fav"
                accessibilityRole="button"
                accessibilityState={{ selected: !!favActive }}
              >
                <Feather
                  name="bookmark"
                  size={20}
                  color={favActive ? SAVE : colors.textMuted}
                  fill={favActive ? SAVE : 'transparent'}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {responses != null && responses > 0 ? (
        <Text style={[s.responses, { color: colors.textMuted }]}>
          {responses} {responses === 1 ? t('feed_response_one') : t('feed_response_many')}
        </Text>
      ) : null}

      {(bottomLeft || bottomRight) && !compact ? (
        <View style={s.bottomRow}>
          {bottomLeft ? (
            <TouchableOpacity
              onPress={bottomLeft.onPress}
              activeOpacity={0.85}
              style={[s.btn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: bottomLeft.filled ? a.main : colors.border }]}
              testID={bottomLeft.testID}
            >
              <Text style={[s.btnText, { color: bottomLeft.filled ? a.main : colors.text }]}>{bottomLeft.label}</Text>
            </TouchableOpacity>
          ) : null}
          {bottomRight ? (
            <TouchableOpacity
              onPress={bottomRight.onPress}
              activeOpacity={0.85}
              style={[s.btn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: a.main }]}
              testID={bottomRight.testID}
            >
              <Text style={[s.btnText, { color: a.main }]}>{bottomRight.label}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardCompact: { padding: 12, marginBottom: 8 },
  primaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  primaryRowCompact: { gap: 0 },
  primaryText: { flex: 1, minWidth: 0 },
  iconBox: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  route: { fontSize: 17, lineHeight: 21, fontWeight: '700', letterSpacing: -0.2 },
  routeCompact: { fontSize: 16, lineHeight: 20 },
  subtitle: { fontSize: 14, marginTop: 4 },
  metaCompact: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 5 },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    marginTop: 8,
  },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  metaIcon: { fontSize: 14 },
  metaLabel: { fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  metaValue: { fontSize: 13, fontWeight: '700' },
  valueRow: { minHeight: 44, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  valueRowCompact: { minHeight: 38, marginTop: 5 },
  valueLeft: { flex: 1, alignItems: 'flex-start' },
  valueRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, backgroundColor: 'transparent' },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  price: { fontSize: 20, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  priceCompact: { fontSize: 18, lineHeight: 22 },
  bookmarkBtn: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  bookmarkBtnActive: { backgroundColor: SAVE_SOFT },
  responses: { fontSize: 11, marginTop: 2, marginBottom: 6 },
  bottomRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { flex: 1, minHeight: 44, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 14, fontWeight: '600' },
});
'''
(ROOT / 'src/components/ui/v1/FeedCard.js').write_text(feed_card, encoding='utf-8')

# 3) My cargos: route is primary; price no longer screams orange. The central
# route clean-up above removes embedded flag duplicates before these two
# explicit country flags are added.
replace_once(
    'src/screens/MyTripsScreen.js',
    "route: { fontSize: 14, fontWeight: '700', marginBottom: 2 },",
    "route: { fontSize: 16, lineHeight: 20, fontWeight: '700', marginBottom: 4, letterSpacing: -0.15 },",
)
replace_once(
    'src/screens/MyTripsScreen.js',
    "price: { fontSize: 16, fontWeight: '700', color: '#E06D00', fontVariant: ['tabular-nums'], flexShrink: 1 },",
    "price: { fontSize: 18, lineHeight: 22, fontWeight: '700', color: v1.text, fontVariant: ['tabular-nums'], flexShrink: 1 },",
)

# 4) Push: InvalidCredentials is an app/credential problem, not a dead device.
# Never deactivate a real driver's token for that response. Add safe aggregate
# diagnostics so production can prove whether native registrations exist.
push_path = ROOT / 'backend/services/push_sender.py'
push_src = push_path.read_text(encoding='utf-8')
push_src = push_src.replace(
    '            if isinstance(tk, dict) and tk.get("status") == "error":\n'
    '                err = (tk.get("details") or {}).get("error")\n'
    '                if err in ("DeviceNotRegistered", "InvalidCredentials"):\n'
    '                    dead.append(tokens[i])',
    '            if isinstance(tk, dict) and tk.get("status") == "error":\n'
    '                err = (tk.get("details") or {}).get("error")\n'
    '                # DeviceNotRegistered is token-specific and may be safely\n'
    '                # deactivated. InvalidCredentials is an APNs/FCM/Expo app\n'
    '                # credential failure: deactivating the driver token here\n'
    '                # destroys a valid registration and prevents recovery after\n'
    '                # credentials are fixed. Keep it active and make it visible.\n'
    '                if err == "DeviceNotRegistered":\n'
    '                    dead.append(tokens[i])\n'
    '                else:\n'
    '                    log.error("expo ticket error token=%s error=%s message=%s",\n'
    '                              (tokens[i][:4] + "..." + tokens[i][-4:]) if tokens[i] else "-",\n'
    '                              err or "unknown", tk.get("message") or "")'
)
old_info = '''def info() -> dict:
    return {
        "web": {"mode": "MOCK" if PUSH_MOCK_WEB else "REAL", "vapid_public": VAPID_PUBLIC or None,
                "subject": VAPID_SUBJECT},
        "native": {
            "expo": {"endpoint": EXPO_ENDPOINT, "token_set": bool(EXPO_TOKEN)},
            "fcm": {"mode": "MOCK" if FCM_MOCK else "REAL"},
        },
    }'''
new_info = '''def info() -> dict:
    # Safe production diagnostics: counts only, never raw endpoints/tokens or
    # user ids. This lets release QA distinguish \"sender is broken\" from
    # \"driver never registered a token\" without exposing private data.
    counts = {"web_active": 0, "native_active": 0, "native_ios": 0, "native_android": 0}
    try:
        with get_conn() as c:
            counts["web_active"] = int(c.execute(
                "SELECT COUNT(*) FROM push_subscriptions WHERE active = 1 OR active IS NULL"
            ).fetchone()[0])
            counts["native_active"] = int(c.execute(
                "SELECT COUNT(*) FROM push_tokens_native WHERE active = 1 OR active IS NULL"
            ).fetchone()[0])
            counts["native_ios"] = int(c.execute(
                "SELECT COUNT(*) FROM push_tokens_native WHERE (active = 1 OR active IS NULL) AND platform = 'ios'"
            ).fetchone()[0])
            counts["native_android"] = int(c.execute(
                "SELECT COUNT(*) FROM push_tokens_native WHERE (active = 1 OR active IS NULL) AND platform = 'android'"
            ).fetchone()[0])
    except Exception as e:
        log.warning("push diagnostics count failed: %s", e)
    return {
        "web": {"mode": "MOCK" if PUSH_MOCK_WEB else "REAL", "vapid_public": bool(VAPID_PUBLIC),
                "subject": VAPID_SUBJECT},
        "native": {
            "expo": {"endpoint": EXPO_ENDPOINT, "access_token_set": bool(EXPO_TOKEN)},
            "fcm": {"mode": "MOCK" if FCM_MOCK else "REAL"},
        },
        "registrations": counts,
    }'''
if old_info not in push_src:
    raise RuntimeError('push_sender.info pattern not found')
push_src = push_src.replace(old_info, new_info, 1)
push_path.write_text(push_src, encoding='utf-8')

# 5) Regression gates.
frontend_test = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const feed = fs.readFileSync('src/components/ui/v1/FeedCard.js', 'utf8');
const places = fs.readFileSync('src/utils/places.js', 'utf8');
const myTrips = fs.readFileSync('src/screens/MyTripsScreen.js', 'utf8');

test('shipper machine cards use bookmark, not hearts or orange price', () => {
  assert.doesNotMatch(feed, /❤️|🤍/);
  assert.match(feed, /name="bookmark"/);
  assert.match(feed, /fill=\{favActive \? SAVE : 'transparent'\}/);
  assert.doesNotMatch(feed, /color: '#E06D00'/);
});

test('route owns primary row and legacy flags are cleaned for RU too', () => {
  assert.match(feed, /numberOfLines=\{compact \? 1 : 2\}/);
  assert.match(places, /const clean = cleanPlaceName\(raw\);[\s\S]*return clean;/);
  assert.match(myTrips, /countryFlag\(item\.from_country\).*localizePlace\(from, lang\).*countryFlag\(item\.to_country\)/s);
});
'''
(ROOT / 'tests/frontend/shipper_cards_unified.test.mjs').write_text(frontend_test, encoding='utf-8')

backend_test = r'''from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_expo_invalid_credentials_does_not_deactivate_driver_token():
    src = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')
    assert 'if err == "DeviceNotRegistered"' in src
    assert 'if err in ("DeviceNotRegistered", "InvalidCredentials")' not in src
    assert 'expo ticket error' in src


def test_trip_bid_push_targets_driver_id():
    src = (ROOT / 'backend/api/marketplace.py').read_text(encoding='utf-8')
    assert 'post_notifs.append((row["driver_id"]' in src
    assert 'send_to_user(recipient, title, text, url=url)' in src


def test_push_info_has_safe_registration_counts():
    src = (ROOT / 'backend/services/push_sender.py').read_text(encoding='utf-8')
    assert '"native_android"' in src
    assert '"native_ios"' in src
    assert '"web_active"' in src
'''
(ROOT / 'backend/tests/test_push_delivery_regressions.py').write_text(backend_test, encoding='utf-8')

# 6) Frontend release/cache bump so Huawei/Safari/PWA cannot keep the old card.
version_path = ROOT / '.version'
try:
    current = int(version_path.read_text(encoding='utf-8').strip())
except Exception:
    current = 107
version_path.write_text(str(max(current + 1, 108)) + '\n', encoding='utf-8')

sw = ROOT / 'sw-template.js'
sw_src = sw.read_text(encoding='utf-8')
m = re.search(r'urtruck-v(\d+)-market', sw_src)
if not m:
    raise RuntimeError('SW cache epoch not found')
old_epoch = int(m.group(1))
new_epoch = max(old_epoch + 1, 17)
sw_src = re.sub(r'urtruck-v\d+-market', f'urtruck-v{new_epoch}-market', sw_src)
sw_src = re.sub(r'urtruck-static-v\d+', f'urtruck-static-v{new_epoch}', sw_src)
sw_src = re.sub(r'UrTruck Service Worker · v\d+', f'UrTruck Service Worker · v{new_epoch}', sw_src)
sw.write_text(sw_src, encoding='utf-8')

print('Applied shipper-card + route + driver-push fixes')
