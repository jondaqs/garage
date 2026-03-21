// src/app/api/test-email/route.js
// Test endpoint to verify Mailjet configuration

import { NextResponse } from 'next/server'

export async function GET() {
  // Check all environment variables
  const config = {
    has_api_key: !!process.env.MAILJET_API_KEY,
    has_secret_key: !!process.env.MAILJET_SECRET_KEY,
    has_from_email: !!(process.env.MAILJET_FROM_EMAIL || process.env.MAILJET_SENDER_EMAIL),
    
    api_key_preview: process.env.MAILJET_API_KEY 
      ? process.env.MAILJET_API_KEY.substring(0, 8) + '...'
      : 'NOT SET',
    
    from_email: process.env.MAILJET_FROM_EMAIL || 
                process.env.MAILJET_SENDER_EMAIL || 
                'NOT SET',
    
    from_name: process.env.MAILJET_FROM_NAME || 
               process.env.MAILJET_SENDER_NAME || 
               'GariCare',
    
    // Check which variables are actually set
    env_vars_found: {
      MAILJET_API_KEY: !!process.env.MAILJET_API_KEY,
      MAILJET_SECRET_KEY: !!process.env.MAILJET_SECRET_KEY,
      MAILJET_FROM_EMAIL: !!process.env.MAILJET_FROM_EMAIL,
      MAILJET_SENDER_EMAIL: !!process.env.MAILJET_SENDER_EMAIL,
      MAILJET_FROM_NAME: !!process.env.MAILJET_FROM_NAME,
      MAILJET_SENDER_NAME: !!process.env.MAILJET_SENDER_NAME,
    }
  }
  
  const allConfigured = config.has_api_key && 
                       config.has_secret_key && 
                       config.has_from_email
  
  return NextResponse.json({
    status: allConfigured ? 'READY' : 'NOT CONFIGURED',
    config,
    message: allConfigured 
      ? '✅ All Mailjet credentials are configured'
      : '❌ Missing Mailjet credentials'
  })
}