// src/lib/constants/countries.js
// Comprehensive list of countries with regional grouping

// Regional Arrays - Export for use in dropdowns
export const EAST_AFRICA = [
  'Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Burundi', 'South Sudan',
  'Ethiopia', 'Somalia', 'Eritrea', 'Djibouti'
]

export const SOUTHERN_AFRICA = [
  'South Africa', 'Botswana', 'Zimbabwe', 'Zambia', 'Malawi', 
  'Mozambique', 'Namibia', 'Lesotho', 'Eswatini'
]

export const WEST_AFRICA = [
  'Nigeria', 'Ghana', 'Senegal', 'Côte d\'Ivoire', 'Mali', 'Burkina Faso',
  'Niger', 'Guinea', 'Benin', 'Togo', 'Sierra Leone', 'Liberia',
  'Mauritania', 'Gambia', 'Guinea-Bissau', 'Cape Verde'
]

export const NORTH_AFRICA = [
  'Egypt', 'Morocco', 'Algeria', 'Tunisia', 'Libya', 'Sudan'
]

export const CENTRAL_AFRICA = [
  'Democratic Republic of Congo', 'Republic of Congo', 'Cameroon',
  'Central African Republic', 'Chad', 'Gabon', 'Equatorial Guinea',
  'São Tomé and Príncipe'
]

export const INTERNATIONAL = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany',
  'France', 'Italy', 'Spain', 'Netherlands', 'Belgium', 'Switzerland',
  'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland',
  'Portugal', 'Greece', 'Poland', 'Czech Republic', 'India', 'China',
  'Japan', 'Singapore', 'Malaysia', 'Thailand', 'Indonesia', 'Philippines',
  'Vietnam', 'South Korea', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal',
  'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain',
  'Oman', 'Turkey', 'Israel', 'Lebanon', 'Jordan', 'Brazil', 'Argentina',
  'Chile', 'Colombia', 'Peru', 'Mexico', 'Venezuela', 'Ecuador', 'Bolivia',
  'Paraguay', 'Uruguay', 'New Zealand', 'Russia', 'Ukraine'
]

// Flat list of all countries (for iteration or validation)
export const COUNTRIES = [
  ...EAST_AFRICA,
  ...SOUTHERN_AFRICA,
  ...WEST_AFRICA,
  ...NORTH_AFRICA,
  ...CENTRAL_AFRICA,
  ...INTERNATIONAL
]

// Kenya counties for backward compatibility
export const KENYA_COUNTIES = [
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Malindi',
  'Kitale', 'Garissa', 'Kakamega', 'Machakos', 'Meru', 'Nyeri', 'Kiambu',
  'Kajiado', 'Kilifi', 'Kwale', 'Lamu', 'Taita Taveta', 'Tana River',
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo Marakwet', 'Embu',
  'Homa Bay', 'Isiolo', 'Kericho', 'Kirinyaga', 'Kisii', 'Laikipia',
  'Makueni', 'Mandera', 'Marsabit', 'Migori', 'Murang\'a', 'Nandi',
  'Narok', 'Nyandarua', 'Nyamira', 'Samburu', 'Siaya', 'Trans Nzoia',
  'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot'
]

// Helper function to get region label for a country
export function getCountryRegion(country) {
  if (EAST_AFRICA.includes(country)) return 'East Africa'
  if (SOUTHERN_AFRICA.includes(country)) return 'Southern Africa'
  if (WEST_AFRICA.includes(country)) return 'West Africa'
  if (NORTH_AFRICA.includes(country)) return 'North Africa'
  if (CENTRAL_AFRICA.includes(country)) return 'Central Africa'
  return 'International'
}

// Helper to check if country is valid
export function isValidCountry(country) {
  return COUNTRIES.includes(country)
}

// Helper to get all countries in a specific region
export function getCountriesByRegion(region) {
  switch(region) {
    case 'East Africa': return EAST_AFRICA
    case 'Southern Africa': return SOUTHERN_AFRICA
    case 'West Africa': return WEST_AFRICA
    case 'North Africa': return NORTH_AFRICA
    case 'Central Africa': return CENTRAL_AFRICA
    case 'International': return INTERNATIONAL
    default: return []
  }
}

// All regions
export const REGIONS = [
  'East Africa',
  'Southern Africa', 
  'West Africa',
  'North Africa',
  'Central Africa',
  'International'
]