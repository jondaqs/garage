import { useState, useEffect } from 'react'

export function useUserLocation() {
  const [location, setLocation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [permissionDenied, setPermissionDenied] = useState(false)

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser')
      return
    }

    setLoading(true)
    setError(null)
    setPermissionDenied(false)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        })
        setLoading(false)
      },
      (error) => {
        setLoading(false)
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setPermissionDenied(true)
            setError('Location permission denied')
            break
          case error.POSITION_UNAVAILABLE:
            setError('Location information unavailable')
            break
          case error.TIMEOUT:
            setError('Location request timed out')
            break
          default:
            setError('An unknown error occurred')
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )
  }

  return {
    location,
    loading,
    error,
    permissionDenied,
    requestLocation
  }
}