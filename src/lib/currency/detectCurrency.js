// src/lib/currency/detectCurrency.js

/**
 * Detects the user's likely currency from their browser timezone.
 * No external API calls, no PII, instant result.
 *
 * Fallback chain:
 *   1. Intl timezone → country → currency
 *   2. navigator.language locale → country → currency
 *   3. 'USD'
 */

// Timezone → currency code (covers ~120 major timezones)
const TZ_TO_CURRENCY = {
  // Africa
  'Africa/Nairobi': 'KES', 'Africa/Dar_es_Salaam': 'TZS', 'Africa/Kampala': 'UGX',
  'Africa/Addis_Ababa': 'ETB', 'Africa/Mogadishu': 'SOS', 'Africa/Kigali': 'RWF',
  'Africa/Bujumbura': 'BIF', 'Africa/Juba': 'SSP', 'Africa/Asmara': 'ERN',
  'Africa/Lagos': 'NGN', 'Africa/Accra': 'GHS', 'Africa/Abidjan': 'XOF',
  'Africa/Dakar': 'XOF', 'Africa/Bamako': 'XOF', 'Africa/Ouagadougou': 'XOF',
  'Africa/Niamey': 'XOF', 'Africa/Lome': 'XOF', 'Africa/Conakry': 'GNF',
  'Africa/Freetown': 'SLL', 'Africa/Monrovia': 'LRD', 'Africa/Banjul': 'GMD',
  'Africa/Nouakchott': 'MRU', 'Africa/Bissau': 'XOF',
  'Africa/Johannesburg': 'ZAR', 'Africa/Harare': 'ZWL', 'Africa/Lusaka': 'ZMW',
  'Africa/Maputo': 'MZN', 'Africa/Blantyre': 'MWK', 'Africa/Gaborone': 'BWP',
  'Africa/Windhoek': 'NAD', 'Africa/Maseru': 'LSL', 'Africa/Mbabane': 'SZL',
  'Africa/Cairo': 'EGP', 'Africa/Tripoli': 'LYD', 'Africa/Tunis': 'TND',
  'Africa/Algiers': 'DZD', 'Africa/Casablanca': 'MAD',
  'Africa/Douala': 'XAF', 'Africa/Libreville': 'XAF', 'Africa/Brazzaville': 'XAF',
  'Africa/Kinshasa': 'CDF', 'Africa/Lubumbashi': 'CDF', 'Africa/Bangui': 'XAF',
  'Africa/Ndjamena': 'XAF', 'Africa/Malabo': 'XAF',
  'Africa/Luanda': 'AOA', 'Africa/Khartoum': 'SDG',
  'Indian/Antananarivo': 'MGA', 'Indian/Mauritius': 'MUR', 'Indian/Mahe': 'SCR',

  // Europe
  'Europe/London': 'GBP', 'Europe/Dublin': 'EUR', 'Europe/Paris': 'EUR',
  'Europe/Berlin': 'EUR', 'Europe/Rome': 'EUR', 'Europe/Madrid': 'EUR',
  'Europe/Amsterdam': 'EUR', 'Europe/Brussels': 'EUR', 'Europe/Vienna': 'EUR',
  'Europe/Lisbon': 'EUR', 'Europe/Helsinki': 'EUR', 'Europe/Athens': 'EUR',
  'Europe/Zurich': 'CHF', 'Europe/Stockholm': 'SEK', 'Europe/Oslo': 'NOK',
  'Europe/Copenhagen': 'DKK', 'Europe/Warsaw': 'PLN', 'Europe/Prague': 'CZK',
  'Europe/Budapest': 'HUF', 'Europe/Bucharest': 'RON', 'Europe/Sofia': 'BGN',
  'Europe/Belgrade': 'RSD', 'Europe/Zagreb': 'EUR', 'Europe/Ljubljana': 'EUR',
  'Europe/Bratislava': 'EUR', 'Europe/Tallinn': 'EUR', 'Europe/Riga': 'EUR',
  'Europe/Vilnius': 'EUR', 'Europe/Moscow': 'RUB', 'Europe/Kiev': 'UAH',
  'Europe/Istanbul': 'TRY', 'Europe/Minsk': 'BYN',

  // Americas
  'America/New_York': 'USD', 'America/Chicago': 'USD', 'America/Denver': 'USD',
  'America/Los_Angeles': 'USD', 'America/Anchorage': 'USD', 'Pacific/Honolulu': 'USD',
  'America/Toronto': 'CAD', 'America/Vancouver': 'CAD', 'America/Edmonton': 'CAD',
  'America/Winnipeg': 'CAD', 'America/Halifax': 'CAD',
  'America/Mexico_City': 'MXN', 'America/Cancun': 'MXN',
  'America/Sao_Paulo': 'BRL', 'America/Fortaleza': 'BRL', 'America/Manaus': 'BRL',
  'America/Argentina/Buenos_Aires': 'ARS', 'America/Bogota': 'COP',
  'America/Lima': 'PEN', 'America/Santiago': 'CLP', 'America/Caracas': 'VES',
  'America/Guayaquil': 'USD', 'America/La_Paz': 'BOB', 'America/Asuncion': 'PYG',
  'America/Montevideo': 'UYU', 'America/Panama': 'PAB',
  'America/Guatemala': 'GTQ', 'America/Tegucigalpa': 'HNL',
  'America/Costa_Rica': 'CRC', 'America/Jamaica': 'JMD',
  'America/Port-au-Prince': 'HTG', 'America/Santo_Domingo': 'DOP',

  // Asia
  'Asia/Dubai': 'AED', 'Asia/Riyadh': 'SAR', 'Asia/Qatar': 'QAR',
  'Asia/Bahrain': 'BHD', 'Asia/Kuwait': 'KWD', 'Asia/Muscat': 'OMR',
  'Asia/Kolkata': 'INR', 'Asia/Colombo': 'LKR', 'Asia/Dhaka': 'BDT',
  'Asia/Karachi': 'PKR', 'Asia/Kathmandu': 'NPR',
  'Asia/Bangkok': 'THB', 'Asia/Ho_Chi_Minh': 'VND', 'Asia/Jakarta': 'IDR',
  'Asia/Manila': 'PHP', 'Asia/Singapore': 'SGD', 'Asia/Kuala_Lumpur': 'MYR',
  'Asia/Yangon': 'MMK', 'Asia/Phnom_Penh': 'KHR',
  'Asia/Tokyo': 'JPY', 'Asia/Seoul': 'KRW', 'Asia/Shanghai': 'CNY',
  'Asia/Hong_Kong': 'HKD', 'Asia/Taipei': 'TWD',
  'Asia/Tehran': 'IRR', 'Asia/Baghdad': 'IQD', 'Asia/Amman': 'JOD',
  'Asia/Beirut': 'LBP', 'Asia/Jerusalem': 'ILS',
  'Asia/Almaty': 'KZT', 'Asia/Tashkent': 'UZS', 'Asia/Tbilisi': 'GEL',
  'Asia/Baku': 'AZN', 'Asia/Yerevan': 'AMD',

  // Oceania
  'Australia/Sydney': 'AUD', 'Australia/Melbourne': 'AUD', 'Australia/Perth': 'AUD',
  'Australia/Brisbane': 'AUD', 'Australia/Adelaide': 'AUD',
  'Pacific/Auckland': 'NZD', 'Pacific/Fiji': 'FJD',
}

// Country code → currency code (fallback for navigator.language)
const COUNTRY_TO_CURRENCY = {
  KE: 'KES', TZ: 'TZS', UG: 'UGX', ET: 'ETB', RW: 'RWF', NG: 'NGN',
  GH: 'GHS', ZA: 'ZAR', EG: 'EGP', MA: 'MAD', TN: 'TND', DZ: 'DZD',
  US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CO: 'COP',
  GB: 'GBP', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', RU: 'RUB',
  TR: 'TRY', UA: 'UAH', IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR',
  JP: 'JPY', KR: 'KRW', CN: 'CNY', HK: 'HKD', TW: 'TWD', SG: 'SGD',
  MY: 'MYR', TH: 'THB', PH: 'PHP', ID: 'IDR', VN: 'VND',
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', IL: 'ILS',
  AU: 'AUD', NZ: 'NZD',
}

// Continent fallbacks
const CONTINENT_FALLBACK = {
  Africa: 'USD', Europe: 'EUR', America: 'USD', Asia: 'USD',
  Australia: 'AUD', Pacific: 'USD', Indian: 'USD',
}

/**
 * Detect the user's likely currency code from browser environment.
 * Returns { currencyCode, source }
 */
export function detectCurrencyFromBrowser() {
  // 1. Try timezone
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && TZ_TO_CURRENCY[tz]) {
      return { currencyCode: TZ_TO_CURRENCY[tz], source: 'timezone', timezone: tz }
    }
    // Try continent fallback
    if (tz) {
      const continent = tz.split('/')[0]
      if (CONTINENT_FALLBACK[continent]) {
        return { currencyCode: CONTINENT_FALLBACK[continent], source: 'timezone_continent', timezone: tz }
      }
    }
  } catch (e) { /* Intl not available */ }

  // 2. Try navigator.language (e.g. 'en-KE' → KE → KES)
  try {
    const lang = navigator.language || navigator.userLanguage || ''
    const parts = lang.split('-')
    if (parts.length >= 2) {
      const country = parts[parts.length - 1].toUpperCase()
      if (COUNTRY_TO_CURRENCY[country]) {
        return { currencyCode: COUNTRY_TO_CURRENCY[country], source: 'locale', locale: lang }
      }
    }
  } catch (e) { /* navigator not available */ }

  // 3. Default
  return { currencyCode: 'USD', source: 'default' }
}

/**
 * Given a currency code, find the matching currency in a list from the DB.
 * Returns the matched currency object or null.
 */
export function matchCurrencyInList(currencyCode, currencies = []) {
  return currencies.find(c => c.code === currencyCode) || null
}