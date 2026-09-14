// CountryFlag — the single, offline country-flag renderer for UrTruck.
// SVG artwork comes from `country-flag-icons` and is bundled with the app.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';
import * as FLAG_XML from 'country-flag-icons/string/3x2';
import { countryCode } from '../../../utils/countryFlags';

// The package exposes the complete standards-based SVG set. Keeping the
// namespace bundled makes every country picker deterministic and offline.
export const COUNTRY_FLAG_CODES = Object.freeze(
  Object.keys(FLAG_XML).filter((key) => /^[A-Z]{2}(?:-[A-Z]{2,3})?$/.test(key))
);

export const normalizeCountryCode = (value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  return countryCode(raw) || raw.toUpperCase();
};

export const isKnownCountryFlag = (value) => Boolean(FLAG_XML[normalizeCountryCode(value)]);
export const countryFlagXml = (value) => FLAG_XML[normalizeCountryCode(value)] || null;

const warnedCodes = new Set();
const warnMissingFlag = (code) => {
  if (!code || warnedCodes.has(code)) return;
  warnedCodes.add(code);
  console.warn(`[CountryFlag] no bundled artwork for country code: ${code}`);
};

const numericSize = (value, fallback = 24) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Canonical UrTruck flag renderer.
 *
 * Round mode intentionally uses three separate layers:
 *  1) a soft offset depth disc (visible on web/iOS/Android),
 *  2) a clean white circular shell,
 *  3) an inner SVG crop.
 *
 * Keeping the shadow outside the clipped SVG fixes the old issue where a
 * round flag could lose its depth because `overflow: hidden` clipped the
 * shadow on iOS/web. The result matches the product reference: circular,
 * white rim, compact depth, no emoji and no rectangular country chips.
 */
export default function CountryFlag({
  code,
  width = 24,
  height,
  round = true,
  style,
  testID,
  accessibilityLabel,
}) {
  const normalized = normalizeCountryCode(code);
  const xml = countryFlagXml(normalized);
  const resolvedWidth = numericSize(width);
  const resolvedHeight = round
    ? resolvedWidth
    : numericSize(height, Math.round(resolvedWidth * 2 / 3));
  const label = accessibilityLabel || (
    xml ? `Country flag: ${normalized}` : `Unknown country: ${normalized || 'none'}`
  );

  if (!xml) {
    warnMissingFlag(normalized);
    if (round) {
      return (
        <View
          testID={testID}
          accessibilityLabel={label}
          accessibilityRole="image"
          style={[s.roundRoot, { width: resolvedWidth, height: resolvedHeight }, style]}
        >
          <View pointerEvents="none" style={s.depthDisc} />
          <View style={s.roundShell}>
            <View style={[s.roundClip, s.unknownRound]} />
          </View>
        </View>
      );
    }

    return (
      <View
        testID={testID}
        accessibilityLabel={label}
        accessibilityRole="image"
        style={[s.rectUnknown, { width: resolvedWidth, height: resolvedHeight }, style]}
      />
    );
  }

  if (!round) {
    return (
      <View
        testID={testID}
        accessibilityLabel={label}
        accessibilityRole="image"
        style={[s.rectFrame, { width: resolvedWidth, height: resolvedHeight }, style]}
      >
        <SvgXml xml={xml} width="100%" height="100%" />
      </View>
    );
  }

  const rim = Math.max(1, Math.round(resolvedWidth * 0.055));

  return (
    <View
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole="image"
      style={[s.roundRoot, { width: resolvedWidth, height: resolvedHeight }, style]}
    >
      <View pointerEvents="none" style={s.depthDisc} />
      <View style={s.roundShell}>
        <View style={[s.roundClip, { margin: rim }]}>
          <SvgXml xml={xml} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
        </View>
        <View pointerEvents="none" style={s.highlightRing} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  roundRoot: {
    position: 'relative',
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
  depthDisc: {
    position: 'absolute',
    left: 1.5,
    top: 2.5,
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(77, 91, 98, 0.18)',
  },
  roundShell: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(27, 39, 34, 0.12)',
    shadowColor: '#5F6E76',
    shadowOpacity: 0.18,
    shadowRadius: 2.5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  roundClip: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.94)',
    backgroundColor: '#FFFFFF',
  },
  highlightRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.98)',
    borderLeftColor: 'rgba(255,255,255,0.90)',
    borderRightColor: 'rgba(99,112,119,0.10)',
    borderBottomColor: 'rgba(99,112,119,0.16)',
  },
  unknownRound: {
    margin: 1,
    backgroundColor: '#DDE6E0',
  },
  rectFrame: {
    overflow: 'hidden',
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(20,34,28,0.12)',
    backgroundColor: '#FFFFFF',
  },
  rectUnknown: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(20,34,28,0.12)',
    backgroundColor: '#DDE6E0',
  },
});
