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
import KZ from 'country-flag-icons/string/3x2/KZ';
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
const FLAG_XML = Object.freeze({
  AE, AF, AL, AM, AT, AU, AZ, BG, BY, CA, CN, CZ, DE, EG, ES, FR, GB, GE, GR,
  IL, IN, IR, IT, JP, KG, KR, KZ, MN, PK, PL, RO, RU, SA, TH, TJ, TM, TR, UA,
  US, UZ, VN,
});
export const COUNTRY_FLAG_CODES = Object.freeze(Object.keys(FLAG_XML));
export const normalizeCountryCode = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : '');
export const isKnownCountryFlag = (value) => Boolean(FLAG_XML[normalizeCountryCode(value)]);
export const countryFlagXml = (value) => FLAG_XML[normalizeCountryCode(value)] || null;

export default function CountryFlag({ code, width = 24, height, style, testID, accessibilityLabel }) {
  const normalized = normalizeCountryCode(code);
  const xml = countryFlagXml(normalized);
  const resolvedHeight = height || Math.round(Number(width) * 2 / 3);
  const label = accessibilityLabel || (xml ? `Country flag: ${normalized}` : `Unknown country: ${normalized || 'none'}`);
  if (!xml) {
    return <View testID={testID} accessibilityLabel={label} accessibilityRole="image" style={[s.unknown, { width, height: resolvedHeight }, style]}><Text style={s.unknownText}>?</Text></View>;
  }
  return (
    <View testID={testID} accessibilityLabel={label} accessibilityRole="image" style={[s.frame, { width, height: resolvedHeight }, style]}>
      <SvgXml xml={xml} width="100%" height="100%" />
    </View>
  );
}

const s = StyleSheet.create({
  frame: { overflow: 'hidden', borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(20,34,28,0.12)', backgroundColor: '#FFFFFF' },
  unknown: { alignItems: 'center', justifyContent: 'center', borderRadius: 3, backgroundColor: '#DDE6E0' },
  unknownText: { color: '#617067', fontSize: 10, fontWeight: '800' },
});
