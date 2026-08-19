import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com'

export const metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: 'Carfix-Connect — Find Trusted Mechanics & Garages across the globe',
    template: '%s | Carfix-Connect',
  },

  description:
    'Book verified garages and mechanics across the globe. Track vehicle maintenance, manage fleet servicing, and get real-time work order updates — all in one platform.',

  keywords: [
    'garage near me', 'mechanic near me', 'car repair',
    'car service', 'vehicle maintenance', 'auto repair',
    'fleet management', 'car booking garage', 'trusted mechanics',
    'Carfix-Connect', 'carfix connect', 'car fix connect',
    'motor vehicle service', 'brake repair', 'engine service',
    'oil change', 'car inspection', 'garage management system',
    'vehicle service history', 'workshop management', 'auto garage',
    'gari', 'gari care', 'mechanic', 'mechanic Kenya', 'car servicing platform',
    'online garage booking', 'car diagnostics',
  ],

  authors: [{ name: 'Carfix-Connect' }],
  creator: 'Carfix-Connect',
  publisher: 'Carfix-Connect',

  applicationName: 'Carfix-Connect',
  generator: 'Next.js',
  referrer: 'origin-when-cross-origin',

  // ── Open Graph (Facebook, LinkedIn, WhatsApp) ──
  openGraph: {
    type: 'website',
    locale: 'en_KE',
    url: SITE_URL,
    siteName: 'Carfix-Connect',
    title: 'Carfix-Connect — Find Trusted Mechanics & Garages across the globe',
    description:
      'Book verified garages, track vehicle maintenance, and manage fleet servicing across the globe.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Carfix-Connect — Connecting Drivers to Trusted Vehicle Services',
      },
    ],
  },

  // ── Twitter / X ──
  twitter: {
    card: 'summary_large_image',
    title: 'Carfix-Connect — Find Trusted Mechanics & Garages',
    description:
      'Book verified garages, track vehicle maintenance, and manage fleet servicing across the Globe.',
    images: ['/og-image.png'],
    creator: '@carfixconnect',
  },

  // ── Icons ──
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },

  // ── PWA ──
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Carfix',
  },

  // ── Robots ──
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // ── Verification (add your codes once you register with each console) ──
  verification: {
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-code',
  },

  // ── Alternates ──
  alternates: {
    canonical: SITE_URL,
  },

  // ── Misc ──
  category: 'automotive',
}


export default function RootLayout({ children }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Carfix-Connect',
    url: SITE_URL,
    description:
      'Book verified garages and mechanics across the Globe. Track vehicle maintenance, manage fleet servicing, and get real-time work order updates.',
    applicationCategory: 'AutomotiveBusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'KES',
      description: 'Free for vehicle owners. Service providers subscribe for premium features.',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '50',
      bestRating: '5',
    },
    provider: {
      '@type': 'Organization',
      name: 'Carfix-Connect',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      sameAs: [],
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'KE',
        addressLocality: 'Nairobi',
      },
    },
  }

  const localBusinessLd = {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: 'Carfix-Connect',
    url: SITE_URL,
    image: `${SITE_URL}/logo.png`,
    description:
      'Platform connecting vehicle owners with trusted garages and mechanics across the Globe.',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'KE',
      addressLocality: 'Nairobi',
    },
    areaServed: {
      '@type': 'Continent',
      name: 'Africa',
    },
    serviceType: [
      'Car Repair',
      'Vehicle Maintenance',
      'Fleet Management',
      'Auto Diagnostics',
      'Brake Service',
      'Engine Repair',
      'Oil Change',
      'Car Inspection',
    ],
  }

  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd) }}
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  )
}