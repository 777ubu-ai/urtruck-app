// Международный номер в регистрации: данные хранятся в полном формате.
import { toAsciiDigits } from './phone';
import { COUNTRIES, DEFAULT_COUNTRY } from './countries';

export function registrationCountry(value) {
  const digits = toAsciiDigits(value);
  return [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => digits.startsWith(c.dial)) || DEFAULT_COUNTRY;
}

export function registrationNational(value, country) {
  const digits = toAsciiDigits(value);
  return digits.startsWith(country.dial) ? digits.slice(country.dial.length) : digits;
}

export function registrationNumber(value, country) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = toAsciiDigits(raw);
  if (raw.startsWith('+')) return '+' + digits;
  if (country.dial === '7' && digits.length === 11 && /^[78]/.test(digits)) return '+7' + digits.slice(1);
  return '+' + country.dial + digits;
}

export function validRegistrationPhone(value, country) {
  const raw = String(value || '');
  if (!/^\+[0-9]{7,15}$/.test(raw)) return false;
  if (!raw.startsWith('+' + country.dial)) return false;
  const national = raw.slice(country.dial.length + 1);
  const lengths = { KZ: [10], RU: [10], CN: [11], US: [10], CA: [10], KG: [9], UZ: [9], TJ: [9] };
  return lengths[country.iso] ? lengths[country.iso].includes(national.length) : national.length >= 6;
}
