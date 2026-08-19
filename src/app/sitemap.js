// src/app/sitemap.js
// Next.js automatically serves this as /sitemap.xml

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com'

export default function sitemap() {
  const now = new Date().toISOString()

  // Static public pages
  const staticPages = [
    { url: SITE_URL,                    lastModified: now, changeFrequency: 'weekly',  priority: 1.0  },
    { url: `${SITE_URL}/about`,         lastModified: now, changeFrequency: 'monthly', priority: 0.8  },
    { url: `${SITE_URL}/garages`,       lastModified: now, changeFrequency: 'daily',   priority: 0.9  },
    { url: `${SITE_URL}/features`,      lastModified: now, changeFrequency: 'monthly', priority: 0.8  },
    { url: `${SITE_URL}/how-it-works`,  lastModified: now, changeFrequency: 'monthly', priority: 0.8  },
    { url: `${SITE_URL}/contact`,       lastModified: now, changeFrequency: 'monthly', priority: 0.7  },
    { url: `${SITE_URL}/auth/login`,    lastModified: now, changeFrequency: 'yearly',  priority: 0.5  },
    { url: `${SITE_URL}/auth/signup`,   lastModified: now, changeFrequency: 'yearly',  priority: 0.6  },
    { url: `${SITE_URL}/auth/provider-signup`, lastModified: now, changeFrequency: 'yearly', priority: 0.6 },
    { url: `${SITE_URL}/auth/company-signup`,  lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
  ]

  return staticPages
}