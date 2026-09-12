// CountryFlag — the single, offline country-flag renderer for UrTruck.
// `country-flag-icons` supplies standards-based SVG artwork bundled with the app.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';
import AE from 'country-flag-icons/string/3x2/AE';
import AF from 'country-flag-icons/string/3x2/AF';
import AL from 'country-flag-icons/string/3x2/AL';
import AM from 'country-flag-icons/string/3x2/AM';
import AT from 'country-flag-icons/string/3x2/AT';
import AU from 'country-flag-icons/string/3x2/AU';
import AZ from 'country-flag-icons/string/3x2/AZ';
import BG from 'country-flag-icons/string/3x2/BG';
import BY from 'country-flag-icons/string/3x2/BY';
import CA from 'country-flag-icons/string/3x2/CA';
import CN from 'country-flag-icons/string/3x2/CN';
import CZ from 'country-flag-icons/string/3x2/CZ';
import DE from 'country-flag-icons/string/3x2/DE';
import EG from 'country-flag-icons/string/3x2/EG';
import ES from 'country-flag-icons/string/3x2/ES';
import FR from 'country-flag-icons/string/3x2/FR';
import GB from 'country-flag-icons/string/3x2/GB';
import GE from 'country-flag-icons/string/3x2/GE';
import GR from 'country-flag-icons/string/3x2/GR';
import IL from 'country-flag-icons/string/3x2/IL';
import IN from 'country-flag-icons/string/3x2/IN';
import IR from 'country-flag-icons/string/3x2/IR';
import IT from 'country-flag-icons/string/3x2/IT';
import JP from 'country-flag-icons/string/3x2/JP';
import KG from 'country-flag-icons/string/3x2/KG';
import KR from 'country-flag-icons/string/3x2/KR';
import MN from 'country-flag-icons/string/3x2/MN';
import PK from 'country-flag-icons/string/3x2/PK';
import PL from 'country-flag-icons/string/3x2/PL';
import RO from 'country-flag-icons/string/3x2/RO';
import RU from 'country-flag-icons/string/3x2/RU';
import SA from 'country-flag-icons/string/3x2/SA';
import TH from 'country-flag-icons/string/3x2/TH';
import TJ from 'country-flag-icons/string/3x2/TJ';
import TM from 'country-flag-icons/string/3x2/TM';
import TR from 'country-flag-icons/string/3x2/TR';
import UA from 'country-flag-icons/string/3x2/UA';
import US from 'country-flag-icons/string/3x2/US';
import UZ from 'country-flag-icons/string/3x2/UZ';
import VN from 'country-flag-icons/string/3x2/VN';

// Complete country set offered by the active UrTruck country pickers. Explicit
// imports keep artwork offline and prevent a runtime network dependency.
// Approved local Kazakhstan artwork.  It is intentionally kept in the app
// bundle: no remote SVG/image URL is allowed in the country selector.
// The ornament, sun and steppe eagle are separate paths so the flag remains
// recognisable at the compact 28x18 route size.
export const KZ_APPROVED_XML = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600">
  <rect width="900" height="600" fill="#00AFCA"/>
  <g fill="#F6C744">
    <circle cx="450" cy="205" r="62"/>
    <path d="M450 120l10 27 26-13-13 26 27 10-27 10 13 26-26-13-10 27-10-27-26 13 13-26-27-10 27-10-13-26 26 13z"/>
    <path fill-rule="evenodd" d="M69 60h22v480H69zm35 0h10v480h-10zm25 0h8v480h-8zm22 0h6v480h-6z"/>
    <path d="M675 242l-37 16 21 17-54 15 42 16-68 22 74 2-27 29 63-14-5 39 35-31 24 35 7-42 39 20-18-38 45-9-43-18 31-30-46 12 2-42-34 29z"/>
  </g>
  <path d="M66 60c18 19 35 26 52 0 17 26 34 19 51 0 17 19 34 26 51 0v35c-17 22-34 15-51 0-17 15-34 22-51 0-17 22-34 15-52 0z" fill="none" stroke="#F6C744" stroke-width="8"/>
</svg>`;

const FLAG_XML = Object.freeze({
  AE, AF, AL, AM, AT, AU, AZ, BG, BY, CA, CN, CZ, DE, EG, ES, FR, GB, GE, GR,
  IL, IN, IR, IT, JP, KG, KR, KZ: KZ_APPROVED_XML, MN, PK, PL, RO, RU, SA, TH, TJ, TM, TR, UA,
  US, UZ, VN,
});
export const COUNTRY_FLAG_CODES = Object.freeze(Object.keys(FLAG_XML));
export const normalizeCountryCode = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : '');
export const isKnownCountryFlag = (value) => Boolean(FLAG_XML[normalizeCountryCode(value)]);
export const countryFlagXml = (value) => FLAG_XML[normalizeCountryCode(value)] || null;

export default function CountryFlag({ code, width = 24, height, round = false, compact = false, style, testID, accessibilityLabel }) {
  const normalized = normalizeCountryCode(code);
  const xml = countryFlagXml(normalized);
  const resolvedHeight = round ? Number(width) : (height || Math.round(Number(width) * 2 / 3));
  const label = accessibilityLabel || (xml ? `Country flag: ${normalized}` : `Unknown country: ${normalized || 'none'}`);
  if (!xml) {
    const unknownCode = normalized || '--';
    return <View testID={testID} accessibilityLabel={label} accessibilityRole="image" style={[s.unknown, compact && s.compact, round && s.round, { width, height: resolvedHeight }, style]}><Text style={s.unknownText}>{unknownCode}</Text></View>;
  }
  return (
    <View testID={testID} accessibilityLabel={label} accessibilityRole="image" style={[s.frame, compact && s.compact, round && s.round, { width, height: resolvedHeight }, style]}>
      <SvgXml xml={xml} width="100%" height="100%" preserveAspectRatio={round ? 'xMidYMid slice' : undefined} />
    </View>
  );
}

const s = StyleSheet.create({
  frame: { overflow: 'hidden', borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(20,34,28,0.12)', backgroundColor: '#FFFFFF' },
  compact: { borderRadius: 5, overflow: 'hidden' },
  round: { borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)', shadowColor: '#738396', shadowOpacity: 0.28, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  unknown: { alignItems: 'center', justifyContent: 'center', borderRadius: 3, backgroundColor: '#DDE6E0' },
  unknownText: { color: '#52645A', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
});
