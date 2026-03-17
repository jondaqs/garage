'use client'

import { useEffect, useRef } from 'react'
import { MapPin } from 'lucide-react'

// This component will dynamically import Leaflet to avoid SSR issues
export default function ShopLocationMap({ shop, userLocation }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return

    // Dynamically import Leaflet
    import('leaflet').then((L) => {
      // Clean up previous map instance
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }

      // Initialize map
      if (mapRef.current && shop?.latitude && shop?.longitude) {
        const map = L.map(mapRef.current).setView(
          [shop.latitude, shop.longitude],
          13
        )

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19
        }).addTo(map)

        // Custom icons
        const shopIcon = L.divIcon({
          className: 'custom-icon',
          html: `
            <div style="
              background: #2563eb;
              width: 40px;
              height: 40px;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              border: 3px solid white;
              box-shadow: 0 4px 6px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <svg style="
                width: 20px;
                height: 20px;
                transform: rotate(45deg);
                fill: white;
              " viewBox="0 0 24 24">
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
              </svg>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 40],
          popupAnchor: [0, -40]
        })

        const userIcon = L.divIcon({
          className: 'custom-icon',
          html: `
            <div style="
              background: #10b981;
              width: 40px;
              height: 40px;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              border: 3px solid white;
              box-shadow: 0 4px 6px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <svg style="
                width: 20px;
                height: 20px;
                transform: rotate(45deg);
                fill: white;
              " viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 40],
          popupAnchor: [0, -40]
        })

        // Add shop marker
        const shopMarker = L.marker([shop.latitude, shop.longitude], { 
          icon: shopIcon 
        }).addTo(map)

        shopMarker.bindPopup(`
          <div style="font-family: system-ui, -apple-system, sans-serif;">
            <strong style="font-size: 14px; color: #1f2937;">${shop.name}</strong>
            <div style="margin-top: 4px; font-size: 12px; color: #6b7280;">
              ${shop.street ? shop.street + '<br>' : ''}
              ${shop.town}, ${shop.county || shop.country}
            </div>
            ${shop.phone ? `<div style="margin-top: 4px; font-size: 12px; color: #2563eb;">📞 ${shop.phone}</div>` : ''}
          </div>
        `)

        markersRef.current.push(shopMarker)

        // Add user marker if location available
        if (userLocation?.latitude && userLocation?.longitude) {
          const userMarker = L.marker(
            [userLocation.latitude, userLocation.longitude],
            { icon: userIcon }
          ).addTo(map)

          userMarker.bindPopup(`
            <div style="font-family: system-ui, -apple-system, sans-serif;">
              <strong style="font-size: 14px; color: #1f2937;">Your Location</strong>
            </div>
          `)

          markersRef.current.push(userMarker)

          // Fit map to show both markers
          const bounds = L.latLngBounds([
            [shop.latitude, shop.longitude],
            [userLocation.latitude, userLocation.longitude]
          ])
          map.fitBounds(bounds, { padding: [50, 50] })

          // Draw a line between user and shop
          const polyline = L.polyline([
            [userLocation.latitude, userLocation.longitude],
            [shop.latitude, shop.longitude]
          ], {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.7,
            dashArray: '10, 10'
          }).addTo(map)

          // Calculate distance
          const distance = map.distance(
            [userLocation.latitude, userLocation.longitude],
            [shop.latitude, shop.longitude]
          )
          const distanceKm = (distance / 1000).toFixed(2)

          // Add distance label at midpoint
          const midpoint = [
            (userLocation.latitude + shop.latitude) / 2,
            (userLocation.longitude + shop.longitude) / 2
          ]

          L.marker(midpoint, {
            icon: L.divIcon({
              className: 'distance-label',
              html: `
                <div style="
                  background: white;
                  padding: 4px 8px;
                  border-radius: 4px;
                  border: 2px solid #3b82f6;
                  font-size: 12px;
                  font-weight: 600;
                  color: #1f2937;
                  white-space: nowrap;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                ">
                  ${distanceKm} km
                </div>
              `,
              iconSize: [0, 0]
            })
          }).addTo(map)
        } else {
          // Just shop marker, open popup by default
          shopMarker.openPopup()
        }

        mapInstanceRef.current = map
      }
    })

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [shop, userLocation])

  // If no coordinates, show message
  if (!shop?.latitude || !shop?.longitude) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <MapPin className="mx-auto text-gray-400 mb-3" size={48} />
        <p className="text-gray-600 font-medium">Location coordinates not available</p>
        <p className="text-gray-500 text-sm mt-1">
          {shop?.town && shop?.county ? `${shop.town}, ${shop.county}` : 'Address information incomplete'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Map Container */}
      <div 
        ref={mapRef} 
        className="w-full h-80 rounded-lg border-2 border-gray-200 shadow-sm"
        style={{ zIndex: 0 }}
      />

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow"></div>
          <span className="text-gray-700">Shop Location</span>
        </div>
        {userLocation && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow"></div>
            <span className="text-gray-700">Your Location</span>
          </div>
        )}
      </div>
    </div>
  )
}