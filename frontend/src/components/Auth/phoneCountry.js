/**
 * Phone country options for auth OTP fields.
 * Only USA for now — add more entries here when ready.
 */
export const PHONE_COUNTRIES = [
  {
    iso: 'US',
    name: 'United States',
    dialCode: '1',
    flag: '🇺🇸',
    nationalLength: 10,
    placeholder: '415 555 2671'
  }
];

export function getDefaultPhoneCountry() {
  return PHONE_COUNTRIES[0];
}

export function findPhoneCountry(iso) {
  return PHONE_COUNTRIES.find((c) => c.iso === iso) || PHONE_COUNTRIES[0];
}

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Build E.164 from country + national number (no country code in national).
 */
export function composeE164(countryIso, nationalRaw) {
  const country = findPhoneCountry(countryIso);
  let digits = digitsOnly(nationalRaw);

  // Pasted full US number with leading country digit
  if (country.iso === 'US' && digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  if (
    country.dialCode &&
    digits.startsWith(country.dialCode) &&
    digits.length > country.nationalLength
  ) {
    digits = digits.slice(country.dialCode.length);
  }

  digits = digits.slice(0, country.nationalLength);
  if (!digits) return '';
  return `+${country.dialCode}${digits}`;
}

/**
 * Split stored E.164 (or loose input) into country + national digits.
 */
export function parseE164(raw) {
  const s = String(raw || '').trim();
  if (!s) {
    return { countryIso: 'US', national: '' };
  }

  const digits = digitsOnly(s);

  for (const country of PHONE_COUNTRIES) {
    const withDial = `${country.dialCode}`;
    if (s.startsWith(`+${withDial}`) || (digits.startsWith(withDial) && digits.length > country.nationalLength)) {
      return {
        countryIso: country.iso,
        national: digits.slice(withDial.length).slice(0, country.nationalLength)
      };
    }
  }

  // Bare US 10-digit number
  if (digits.length <= 10) {
    return { countryIso: 'US', national: digits.slice(0, 10) };
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return { countryIso: 'US', national: digits.slice(1) };
  }

  return { countryIso: 'US', national: digits.slice(0, 10) };
}

export function isCompleteNational(countryIso, nationalRaw) {
  const country = findPhoneCountry(countryIso);
  return digitsOnly(nationalRaw).length === country.nationalLength;
}
