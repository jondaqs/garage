// src/app/twitter-image.js
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Carfix-Connect — Connecting Drivers to Trusted Vehicle Services'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', top: -100, right: -100,
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37,99,235,0.3) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: -80, left: -80,
          width: 300, height: 300, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,245,212,0.2) 0%, transparent 70%)',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, background: '#2563eb',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
          }}>
            🚗
          </div>
          <span style={{ fontSize: 42, fontWeight: 800, color: '#ffffff', letterSpacing: '-1px' }}>
            Carfix-Connect
          </span>
        </div>

        <div style={{
          fontSize: 28, color: '#94a3b8', textAlign: 'center',
          maxWidth: 800, lineHeight: 1.4, marginBottom: 40,
        }}>
          Find Trusted Mechanics & Garages
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          {['Verified Garages', 'Fleet Management', 'Real-time Tracking', 'Online Booking'].map(
            (label) => (
              <div key={label} style={{
                padding: '10px 20px', borderRadius: 100,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#e2e8f0', fontSize: 16, fontWeight: 500,
              }}>
                {label}
              </div>
            ),
          )}
        </div>

        <div style={{ position: 'absolute', bottom: 32, fontSize: 18, color: '#64748b', fontWeight: 500 }}>
          carfix-connect.com
        </div>
      </div>
    ),
    { ...size },
  )
}