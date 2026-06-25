// src/lib/paystack/config.js

export const PAYSTACK_CONFIG = {
  secretKey:  process.env.PAYSTACK_SECRET_KEY,
  publicKey:  process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
  baseUrl:    'https://api.paystack.co',
  currency:   'KES',                       // Default currency for Kenyan transactions
  webhookIps: [                            // Paystack webhook source IPs
    '52.31.139.75', '52.49.173.169', '52.214.14.220',
  ],
}

// Forex margin — matches the one used by M-Pesa STK Push and the UI
export const FOREX_MARGIN_PCT = 2.5