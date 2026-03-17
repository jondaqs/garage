// src/lib/constants/countries.js
// Comprehensive list of countries with regional grouping

export const COUNTRIES = [
  // East Africa (Priority)
  'Kenya',
  'Uganda',
  'Tanzania',
  'Rwanda',
  'Burundi',
  'South Sudan',
  'Ethiopia',
  'Somalia',
  'Eritrea',
  'Djibouti',
  
  // Southern Africa
  'South Africa',
  'Botswana',
  'Zimbabwe',
  'Zambia',
  'Malawi',
  'Mozambique',
  'Namibia',
  'Lesotho',
  'Eswatini',
  
  // West Africa
  'Nigeria',
  'Ghana',
  'Senegal',
  'Côte d\'Ivoire',
  'Mali',
  'Burkina Faso',
  'Niger',
  'Guinea',
  'Benin',
  'Togo',
  'Sierra Leone',
  'Liberia',
  'Mauritania',
  'Gambia',
  'Guinea-Bissau',
  'Cape Verde',
  
  // North Africa
  'Egypt',
  'Morocco',
  'Algeria',
  'Tunisia',
  'Libya',
  'Sudan',
  
  // Central Africa
  'Democratic Republic of Congo',
  'Republic of Congo',
  'Cameroon',
  'Central African Republic',
  'Chad',
  'Gabon',
  'Equatorial Guinea',
  'São Tomé and Príncipe',
  
  // Other regions (for international providers)
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Italy',
  'Spain',
  'Netherlands',
  'Belgium',
  'Switzerland',
  'Austria',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Ireland',
  'Portugal',
  'Greece',
  'Poland',
  'Czech Republic',
  'India',
  'China',
  'Japan',
  'Singapore',
  'Malaysia',
  'Thailand',
  'Indonesia',
  'Philippines',
  'Vietnam',
  'South Korea',
  'Pakistan',
  'Bangladesh',
  'Sri Lanka',
  'Nepal',
  'United Arab Emirates',
  'Saudi Arabia',
  'Qatar',
  'Kuwait',
  'Bahrain',
  'Oman',
  'Turkey',
  'Israel',
  'Lebanon',
  'Jordan',
  'Brazil',
  'Argentina',
  'Chile',
  'Colombia',
  'Peru',
  'Mexico',
  'Venezuela',
  'Ecuador',
  'Bolivia',
  'Paraguay',
  'Uruguay',
  'New Zealand',
  'Russia',
  'Ukraine'
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

// Helper function to get region label
export function getCountryRegion(country) {
  const eastAfrica = ['Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Burundi', 'South Sudan', 'Ethiopia', 'Somalia', 'Eritrea', 'Djibouti']
  const southernAfrica = ['South Africa', 'Botswana', 'Zimbabwe', 'Zambia', 'Malawi', 'Mozambique', 'Namibia', 'Lesotho', 'Eswatini']
  const westAfrica = ['Nigeria', 'Ghana', 'Senegal', 'Côte d\'Ivoire', 'Mali', 'Burkina Faso', 'Niger', 'Guinea', 'Benin', 'Togo', 'Sierra Leone', 'Liberia', 'Mauritania', 'Gambia', 'Guinea-Bissau', 'Cape Verde']
  const northAfrica = ['Egypt', 'Morocco', 'Algeria', 'Tunisia', 'Libya', 'Sudan']
  
  if (eastAfrica.includes(country)) return 'East Africa'
  if (southernAfrica.includes(country)) return 'Southern Africa'
  if (westAfrica.includes(country)) return 'West Africa'
  if (northAfrica.includes(country)) return 'North Africa'
  return 'International'
}