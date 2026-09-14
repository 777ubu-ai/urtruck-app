// CountryFlag — the single, offline country-flag renderer for UrTruck.
// `country-flag-icons` supplies standards-based SVG artwork bundled with the app.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';
import AC from 'country-flag-icons/string/3x2/AC';
import AD from 'country-flag-icons/string/3x2/AD';
import AE from 'country-flag-icons/string/3x2/AE';
import AF from 'country-flag-icons/string/3x2/AF';
import AG from 'country-flag-icons/string/3x2/AG';
import AI from 'country-flag-icons/string/3x2/AI';
import AL from 'country-flag-icons/string/3x2/AL';
import AM from 'country-flag-icons/string/3x2/AM';
import AO from 'country-flag-icons/string/3x2/AO';
import AQ from 'country-flag-icons/string/3x2/AQ';
import AR from 'country-flag-icons/string/3x2/AR';
import AS from 'country-flag-icons/string/3x2/AS';
import AT from 'country-flag-icons/string/3x2/AT';
import AU from 'country-flag-icons/string/3x2/AU';
import AW from 'country-flag-icons/string/3x2/AW';
import AX from 'country-flag-icons/string/3x2/AX';
import AZ from 'country-flag-icons/string/3x2/AZ';
import BA from 'country-flag-icons/string/3x2/BA';
import BB from 'country-flag-icons/string/3x2/BB';
import BD from 'country-flag-icons/string/3x2/BD';
import BE from 'country-flag-icons/string/3x2/BE';
import BF from 'country-flag-icons/string/3x2/BF';
import BG from 'country-flag-icons/string/3x2/BG';
import BH from 'country-flag-icons/string/3x2/BH';
import BI from 'country-flag-icons/string/3x2/BI';
import BJ from 'country-flag-icons/string/3x2/BJ';
import BL from 'country-flag-icons/string/3x2/BL';
import BM from 'country-flag-icons/string/3x2/BM';
import BN from 'country-flag-icons/string/3x2/BN';
import BO from 'country-flag-icons/string/3x2/BO';
import BQ from 'country-flag-icons/string/3x2/BQ';
import BR from 'country-flag-icons/string/3x2/BR';
import BS from 'country-flag-icons/string/3x2/BS';
import BT from 'country-flag-icons/string/3x2/BT';
import BV from 'country-flag-icons/string/3x2/BV';
import BW from 'country-flag-icons/string/3x2/BW';
import BY from 'country-flag-icons/string/3x2/BY';
import BZ from 'country-flag-icons/string/3x2/BZ';
import CA from 'country-flag-icons/string/3x2/CA';
import CC from 'country-flag-icons/string/3x2/CC';
import CD from 'country-flag-icons/string/3x2/CD';
import CF from 'country-flag-icons/string/3x2/CF';
import CG from 'country-flag-icons/string/3x2/CG';
import CH from 'country-flag-icons/string/3x2/CH';
import CI from 'country-flag-icons/string/3x2/CI';
import CK from 'country-flag-icons/string/3x2/CK';
import CL from 'country-flag-icons/string/3x2/CL';
import CM from 'country-flag-icons/string/3x2/CM';
import CN from 'country-flag-icons/string/3x2/CN';
import CO from 'country-flag-icons/string/3x2/CO';
import CR from 'country-flag-icons/string/3x2/CR';
import CU from 'country-flag-icons/string/3x2/CU';
import CV from 'country-flag-icons/string/3x2/CV';
import CW from 'country-flag-icons/string/3x2/CW';
import CX from 'country-flag-icons/string/3x2/CX';
import CY from 'country-flag-icons/string/3x2/CY';
import CZ from 'country-flag-icons/string/3x2/CZ';
import DE from 'country-flag-icons/string/3x2/DE';
import DJ from 'country-flag-icons/string/3x2/DJ';
import DK from 'country-flag-icons/string/3x2/DK';
import DM from 'country-flag-icons/string/3x2/DM';
import DO from 'country-flag-icons/string/3x2/DO';
import DZ from 'country-flag-icons/string/3x2/DZ';
import EC from 'country-flag-icons/string/3x2/EC';
import EE from 'country-flag-icons/string/3x2/EE';
import EG from 'country-flag-icons/string/3x2/EG';
import EH from 'country-flag-icons/string/3x2/EH';
import ER from 'country-flag-icons/string/3x2/ER';
import ES from 'country-flag-icons/string/3x2/ES';
import ET from 'country-flag-icons/string/3x2/ET';
import EU from 'country-flag-icons/string/3x2/EU';
import FI from 'country-flag-icons/string/3x2/FI';
import FJ from 'country-flag-icons/string/3x2/FJ';
import FK from 'country-flag-icons/string/3x2/FK';
import FM from 'country-flag-icons/string/3x2/FM';
import FO from 'country-flag-icons/string/3x2/FO';
import FR from 'country-flag-icons/string/3x2/FR';
import GA from 'country-flag-icons/string/3x2/GA';
import GB from 'country-flag-icons/string/3x2/GB';
import GD from 'country-flag-icons/string/3x2/GD';
import GE from 'country-flag-icons/string/3x2/GE';
import GF from 'country-flag-icons/string/3x2/GF';
import GG from 'country-flag-icons/string/3x2/GG';
import GH from 'country-flag-icons/string/3x2/GH';
import GI from 'country-flag-icons/string/3x2/GI';
import GL from 'country-flag-icons/string/3x2/GL';
import GM from 'country-flag-icons/string/3x2/GM';
import GN from 'country-flag-icons/string/3x2/GN';
import GP from 'country-flag-icons/string/3x2/GP';
import GQ from 'country-flag-icons/string/3x2/GQ';
import GR from 'country-flag-icons/string/3x2/GR';
import GS from 'country-flag-icons/string/3x2/GS';
import GT from 'country-flag-icons/string/3x2/GT';
import GU from 'country-flag-icons/string/3x2/GU';
import GW from 'country-flag-icons/string/3x2/GW';
import GY from 'country-flag-icons/string/3x2/GY';
import HK from 'country-flag-icons/string/3x2/HK';
import HM from 'country-flag-icons/string/3x2/HM';
import HN from 'country-flag-icons/string/3x2/HN';
import HR from 'country-flag-icons/string/3x2/HR';
import HT from 'country-flag-icons/string/3x2/HT';
import HU from 'country-flag-icons/string/3x2/HU';
import IC from 'country-flag-icons/string/3x2/IC';
import ID from 'country-flag-icons/string/3x2/ID';
import IE from 'country-flag-icons/string/3x2/IE';
import IL from 'country-flag-icons/string/3x2/IL';
import IM from 'country-flag-icons/string/3x2/IM';
import IN from 'country-flag-icons/string/3x2/IN';
import IO from 'country-flag-icons/string/3x2/IO';
import IQ from 'country-flag-icons/string/3x2/IQ';
import IR from 'country-flag-icons/string/3x2/IR';
import IS from 'country-flag-icons/string/3x2/IS';
import IT from 'country-flag-icons/string/3x2/IT';
import JE from 'country-flag-icons/string/3x2/JE';
import JM from 'country-flag-icons/string/3x2/JM';
import JO from 'country-flag-icons/string/3x2/JO';
import JP from 'country-flag-icons/string/3x2/JP';
import KE from 'country-flag-icons/string/3x2/KE';
import KG from 'country-flag-icons/string/3x2/KG';
import KH from 'country-flag-icons/string/3x2/KH';
import KI from 'country-flag-icons/string/3x2/KI';
import KM from 'country-flag-icons/string/3x2/KM';
import KN from 'country-flag-icons/string/3x2/KN';
import KP from 'country-flag-icons/string/3x2/KP';
import KR from 'country-flag-icons/string/3x2/KR';
import KW from 'country-flag-icons/string/3x2/KW';
import KY from 'country-flag-icons/string/3x2/KY';
import KZ from 'country-flag-icons/string/3x2/KZ';
import LA from 'country-flag-icons/string/3x2/LA';
import LB from 'country-flag-icons/string/3x2/LB';
import LC from 'country-flag-icons/string/3x2/LC';
import LI from 'country-flag-icons/string/3x2/LI';
import LK from 'country-flag-icons/string/3x2/LK';
import LR from 'country-flag-icons/string/3x2/LR';
import LS from 'country-flag-icons/string/3x2/LS';
import LT from 'country-flag-icons/string/3x2/LT';
import LU from 'country-flag-icons/string/3x2/LU';
import LV from 'country-flag-icons/string/3x2/LV';
import LY from 'country-flag-icons/string/3x2/LY';
import MA from 'country-flag-icons/string/3x2/MA';
import MC from 'country-flag-icons/string/3x2/MC';
import MD from 'country-flag-icons/string/3x2/MD';
import ME from 'country-flag-icons/string/3x2/ME';
import MF from 'country-flag-icons/string/3x2/MF';
import MG from 'country-flag-icons/string/3x2/MG';
import MH from 'country-flag-icons/string/3x2/MH';
import MK from 'country-flag-icons/string/3x2/MK';
import ML from 'country-flag-icons/string/3x2/ML';
import MM from 'country-flag-icons/string/3x2/MM';
import MN from 'country-flag-icons/string/3x2/MN';
import MO from 'country-flag-icons/string/3x2/MO';
import MP from 'country-flag-icons/string/3x2/MP';
import MQ from 'country-flag-icons/string/3x2/MQ';
import MR from 'country-flag-icons/string/3x2/MR';
import MS from 'country-flag-icons/string/3x2/MS';
import MT from 'country-flag-icons/string/3x2/MT';
import MU from 'country-flag-icons/string/3x2/MU';
import MV from 'country-flag-icons/string/3x2/MV';
import MW from 'country-flag-icons/string/3x2/MW';
import MX from 'country-flag-icons/string/3x2/MX';
import MY from 'country-flag-icons/string/3x2/MY';
import MZ from 'country-flag-icons/string/3x2/MZ';
import NA from 'country-flag-icons/string/3x2/NA';
import NC from 'country-flag-icons/string/3x2/NC';
import NE from 'country-flag-icons/string/3x2/NE';
import NF from 'country-flag-icons/string/3x2/NF';
import NG from 'country-flag-icons/string/3x2/NG';
import NI from 'country-flag-icons/string/3x2/NI';
import NL from 'country-flag-icons/string/3x2/NL';
import NO from 'country-flag-icons/string/3x2/NO';
import NP from 'country-flag-icons/string/3x2/NP';
import NR from 'country-flag-icons/string/3x2/NR';
import NU from 'country-flag-icons/string/3x2/NU';
import NZ from 'country-flag-icons/string/3x2/NZ';
import OM from 'country-flag-icons/string/3x2/OM';
import PA from 'country-flag-icons/string/3x2/PA';
import PE from 'country-flag-icons/string/3x2/PE';
import PF from 'country-flag-icons/string/3x2/PF';
import PG from 'country-flag-icons/string/3x2/PG';
import PH from 'country-flag-icons/string/3x2/PH';
import PK from 'country-flag-icons/string/3x2/PK';
import PL from 'country-flag-icons/string/3x2/PL';
import PM from 'country-flag-icons/string/3x2/PM';
import PN from 'country-flag-icons/string/3x2/PN';
import PR from 'country-flag-icons/string/3x2/PR';
import PS from 'country-flag-icons/string/3x2/PS';
import PT from 'country-flag-icons/string/3x2/PT';
import PW from 'country-flag-icons/string/3x2/PW';
import PY from 'country-flag-icons/string/3x2/PY';
import QA from 'country-flag-icons/string/3x2/QA';
import RE from 'country-flag-icons/string/3x2/RE';
import RO from 'country-flag-icons/string/3x2/RO';
import RS from 'country-flag-icons/string/3x2/RS';
import RU from 'country-flag-icons/string/3x2/RU';
import RW from 'country-flag-icons/string/3x2/RW';
import SA from 'country-flag-icons/string/3x2/SA';
import SB from 'country-flag-icons/string/3x2/SB';
import SC from 'country-flag-icons/string/3x2/SC';
import SD from 'country-flag-icons/string/3x2/SD';
import SE from 'country-flag-icons/string/3x2/SE';
import SG from 'country-flag-icons/string/3x2/SG';
import SH from 'country-flag-icons/string/3x2/SH';
import SI from 'country-flag-icons/string/3x2/SI';
import SJ from 'country-flag-icons/string/3x2/SJ';
import SK from 'country-flag-icons/string/3x2/SK';
import SL from 'country-flag-icons/string/3x2/SL';
import SM from 'country-flag-icons/string/3x2/SM';
import SN from 'country-flag-icons/string/3x2/SN';
import SO from 'country-flag-icons/string/3x2/SO';
import SR from 'country-flag-icons/string/3x2/SR';
import SS from 'country-flag-icons/string/3x2/SS';
import ST from 'country-flag-icons/string/3x2/ST';
import SV from 'country-flag-icons/string/3x2/SV';
import SX from 'country-flag-icons/string/3x2/SX';
import SY from 'country-flag-icons/string/3x2/SY';
import SZ from 'country-flag-icons/string/3x2/SZ';
import TA from 'country-flag-icons/string/3x2/TA';
import TC from 'country-flag-icons/string/3x2/TC';
import TD from 'country-flag-icons/string/3x2/TD';
import TF from 'country-flag-icons/string/3x2/TF';
import TG from 'country-flag-icons/string/3x2/TG';
import TH from 'country-flag-icons/string/3x2/TH';
import TJ from 'country-flag-icons/string/3x2/TJ';
import TK from 'country-flag-icons/string/3x2/TK';
import TL from 'country-flag-icons/string/3x2/TL';
import TM from 'country-flag-icons/string/3x2/TM';
import TN from 'country-flag-icons/string/3x2/TN';
import TO from 'country-flag-icons/string/3x2/TO';
import TR from 'country-flag-icons/string/3x2/TR';
import TT from 'country-flag-icons/string/3x2/TT';
import TV from 'country-flag-icons/string/3x2/TV';
import TW from 'country-flag-icons/string/3x2/TW';
import TZ from 'country-flag-icons/string/3x2/TZ';
import UA from 'country-flag-icons/string/3x2/UA';
import UG from 'country-flag-icons/string/3x2/UG';
import UM from 'country-flag-icons/string/3x2/UM';
import US from 'country-flag-icons/string/3x2/US';
import UY from 'country-flag-icons/string/3x2/UY';
import UZ from 'country-flag-icons/string/3x2/UZ';
import VA from 'country-flag-icons/string/3x2/VA';
import VC from 'country-flag-icons/string/3x2/VC';
import VE from 'country-flag-icons/string/3x2/VE';
import VG from 'country-flag-icons/string/3x2/VG';
import VI from 'country-flag-icons/string/3x2/VI';
import VN from 'country-flag-icons/string/3x2/VN';
import VU from 'country-flag-icons/string/3x2/VU';
import WF from 'country-flag-icons/string/3x2/WF';
import WS from 'country-flag-icons/string/3x2/WS';
import XA from 'country-flag-icons/string/3x2/XA';
import XC from 'country-flag-icons/string/3x2/XC';
import XK from 'country-flag-icons/string/3x2/XK';
import XO from 'country-flag-icons/string/3x2/XO';
import YE from 'country-flag-icons/string/3x2/YE';
import YT from 'country-flag-icons/string/3x2/YT';
import ZA from 'country-flag-icons/string/3x2/ZA';
import ZM from 'country-flag-icons/string/3x2/ZM';
import ZW from 'country-flag-icons/string/3x2/ZW';
import { countryCode } from '../../../utils/countryFlags';

// The package exports the complete ISO 3166 artwork set. Keeping the map
// bundled makes every country picker deterministic and offline on all clients.
const FLAG_XML = Object.freeze({
  AC, AD, AE, AF, AG, AI, AL, AM, AO, AQ, AR, AS,
  AT, AU, AW, AX, AZ, BA, BB, BD, BE, BF, BG, BH,
  BI, BJ, BL, BM, BN, BO, BQ, BR, BS, BT, BV, BW,
  BY, BZ, CA, CC, CD, CF, CG, CH, CI, CK, CL, CM,
  CN, CO, CR, CU, CV, CW, CX, CY, CZ, DE, DJ, DK,
  DM, DO, DZ, EC, EE, EG, EH, ER, ES, ET, EU, FI,
  FJ, FK, FM, FO, FR, GA, GB, GD, GE, GF, GG, GH,
  GI, GL, GM, GN, GP, GQ, GR, GS, GT, GU, GW, GY,
  HK, HM, HN, HR, HT, HU, IC, ID, IE, IL, IM, IN,
  IO, IQ, IR, IS, IT, JE, JM, JO, JP, KE, KG, KH,
  KI, KM, KN, KP, KR, KW, KY, KZ, LA, LB, LC, LI,
  LK, LR, LS, LT, LU, LV, LY, MA, MC, MD, ME, MF,
  MG, MH, MK, ML, MM, MN, MO, MP, MQ, MR, MS, MT,
  MU, MV, MW, MX, MY, MZ, NA, NC, NE, NF, NG, NI,
  NL, NO, NP, NR, NU, NZ, OM, PA, PE, PF, PG, PH,
  PK, PL, PM, PN, PR, PS, PT, PW, PY, QA, RE, RO,
  RS, RU, RW, SA, SB, SC, SD, SE, SG, SH, SI, SJ,
  SK, SL, SM, SN, SO, SR, SS, ST, SV, SX, SY, SZ,
  TA, TC, TD, TF, TG, TH, TJ, TK, TL, TM, TN, TO,
  TR, TT, TV, TW, TZ, UA, UG, UM, US, UY, UZ, VA,
  VC, VE, VG, VI, VN, VU, WF, WS, XA, XC, XK, XO,
  YE, YT, ZA, ZM, ZW,
});
export const COUNTRY_FLAG_CODES = Object.freeze(Object.keys(FLAG_XML));
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

export default function CountryFlag({ code, width = 24, height, round = true, style, testID, accessibilityLabel }) {
  const normalized = normalizeCountryCode(code);
  const xml = countryFlagXml(normalized);
  const resolvedHeight = round ? Number(width) : (height || Math.round(Number(width) * 2 / 3));
  const label = accessibilityLabel || (xml ? `Country flag: ${normalized}` : `Unknown country: ${normalized || 'none'}`);
  if (!xml) {
    warnMissingFlag(normalized);
    return <View testID={testID} accessibilityLabel={label} accessibilityRole="image" style={[s.unknown, round && s.round, { width, height: resolvedHeight }, style]} />;
  }
  return (
    <View testID={testID} accessibilityLabel={label} accessibilityRole="image" style={[s.frame, round && s.round, { width, height: resolvedHeight }, style]}>
      <SvgXml xml={xml} width="100%" height="100%" preserveAspectRatio={round ? 'xMidYMid slice' : undefined} />
    </View>
  );
}

const s = StyleSheet.create({
  frame: { overflow: 'hidden', borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(20,34,28,0.12)', backgroundColor: '#FFFFFF' },
  round: { borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)', shadowColor: '#738396', shadowOpacity: 0.28, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  unknown: { alignItems: 'center', justifyContent: 'center', borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(20,34,28,0.12)', backgroundColor: '#DDE6E0' },
});
