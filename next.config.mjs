import withPWAModule from 'next-pwa';

const withPWA = withPWAModule({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // Disable PWA in dev mode
})

// ── Content Security Policy ────────────────────────────────────────────
// Whitelists only the domains this app actually uses.
// 'unsafe-inline' is required for Next.js inline scripts and React style objects.
// If something breaks after deploying, check the browser console for CSP violations —
// it will say exactly which directive blocked which resource.

const cspDirectives = [
  // Fallback for any resource type not listed below
  "default-src 'self'",

  // JavaScript — self + Next.js inline scripts + third-party payment/captcha
  "script-src 'self' 'unsafe-inline' https://js.paystack.co https://challenges.cloudflare.com",

  // CSS — self + inline styles (React style={} objects) + Google Fonts CSS
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

  // Fonts — self + Google Fonts files
  "font-src 'self' https://fonts.gstatic.com",

  // Images — self + base64 data URIs + blob previews + Supabase Storage
  "img-src 'self' data: blob: https://*.supabase.co",

  // XHR/fetch/WebSocket — self + Supabase (REST + Realtime) + payment + Google OAuth/Calendar + Turnstile
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paystack.co https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://challenges.cloudflare.com",

  // Iframes we embed — Google Maps + Turnstile widget + Paystack checkout
  "frame-src https://maps.google.com https://challenges.cloudflare.com https://js.paystack.co",

  // Prevent our app from being embedded in other sites (clickjacking defense)
  "frame-ancestors 'none'",

  // Lock down <base> and <form action> to prevent hijacking
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",

  // Block all <object>, <embed>, <applet>
  "object-src 'none'",

  // PWA service worker — self only
  "worker-src 'self'",

  // Manifest — self only
  "manifest-src 'self'",
]

const ContentSecurityPolicy = cspDirectives.join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  turbopack: {},

  // ── Security headers ─────────────────────────────────────────────────
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: [
          // CSP — primary XSS defense
          {
            key: 'Content-Security-Policy',
            value: ContentSecurityPolicy,
          },
          // Prevent clickjacking (older browsers that don't support CSP frame-ancestors)
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // Prevent MIME-type sniffing (browser guessing content types)
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Force HTTPS for 1 year + include subdomains + allow HSTS preload
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          // Control what referrer info is sent with requests
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Restrict browser features the app doesn't need
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
          },
          // Prevent browsers from doing DNS prefetch to unknown hosts
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
    ]
  },
}

//module.exports = withPWA(nextConfig)

export default withPWA(nextConfig);
