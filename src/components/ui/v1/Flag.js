// Compatibility export. New UI imports CountryFlag directly.
import CountryFlag, { countryFlagXml, isKnownCountryFlag } from './CountryFlag';
export default CountryFlag;
export { countryFlagXml, isKnownCountryFlag };

// Existing consumers can keep asking whether an ISO code is supported. The
// visual data is deliberately one source: the bundled standards SVG string.
export const flagColors = (code) => {
  const xml = countryFlagXml(code);
  return xml ? { xml } : null;
};
export const isKnownFlagCode = (code) => {
  return isKnownCountryFlag(code);
};
