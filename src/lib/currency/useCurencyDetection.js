// src/lib/currency/useCurrencyDetection.js
'use client'

/**
 * useCurrencyDetection
 *
 * Detects user's currency from browser timezone, fetches the exchange rate,
 * and provides conversion utilities.
 *
 * @param {object} options
 * @param {string} options.overrideCurrencyCode  - Force a specific currency (e.g. from provider.currency_id)
 * @param {Array}  options.currencies            - Pre-fetched currencies list from DB (avoids re-fetch)
 * @param {string} options.baseCurrency          - Base currency for rates (default: 'USD')
 */

import { useState, useEffect, useCallback } from 'react'
import { detectCurrencyFromBrowser, matchCurrencyInList } from '@/lib/currency/detectCurrency'

export function useCurrencyDetection({ overrideCurrencyCode, currencies = [], baseCurrency = 'USD' } = {}) {
  const [currencyCode, setCurrencyCode] = useState(overrideCurrencyCode || baseCurrency)
  const [currencySymbol, setCurrencySymbol] = useState('$')
  const [conversionRate, setConversionRate] = useState(1)
  const [marginPct, setMarginPct] = useState(0)
  const [rateSource, setRateSource] = useState('identity')
  const [isLoading, setIsLoading] = useState(false)
  const [detectionSource, setDetectionSource] = useState('')
  const [isDetected, setIsDetected] = useState(false)

  // Auto-detect on mount (only if no override)
  useEffect(() => {
    if (overrideCurrencyCode) {
      setCurrencyCode(overrideCurrencyCode)
      setDetectionSource('override')
      setIsDetected(true)
      // Find symbol from currencies list
      const match = matchCurrencyInList(overrideCurrencyCode, currencies)
      if (match) setCurrencySymbol(match.symbol || overrideCurrencyCode)
      return
    }

    const { currencyCode: detected, source } = detectCurrencyFromBrowser()
    setDetectionSource(source)
    setIsDetected(true)

    // Verify the detected currency exists in the DB currencies list
    if (currencies.length > 0) {
      const match = matchCurrencyInList(detected, currencies)
      if (match) {
        setCurrencyCode(match.code)
        setCurrencySymbol(match.symbol || match.code)
      } else {
        // Detected currency not in DB — fall back to base
        setCurrencyCode(baseCurrency)
        setCurrencySymbol('$')
        setDetectionSource('fallback')
      }
    } else {
      setCurrencyCode(detected)
    }
  }, [overrideCurrencyCode, currencies.length, baseCurrency])

  // Fetch exchange rate when currency changes
  useEffect(() => {
    if (currencyCode === baseCurrency) {
      setConversionRate(1)
      setMarginPct(0)
      setRateSource('identity')
      return
    }

    const fetchRate = async () => {
      setIsLoading(true)
      try {
        const resp = await fetch(`/api/pricing/exchange-rate?currency_code=${currencyCode}`)
        if (!resp.ok) throw new Error('Rate unavailable')
        const data = await resp.json()
        setConversionRate(data.margined_rate || 1)
        setCurrencySymbol(data.currency_symbol || currencyCode)
        setMarginPct(data.margin_pct || 0)
        setRateSource(data.source || 'unknown')
      } catch (e) {
        console.error('Currency rate fetch error:')
        // Fall back to base currency
        setConversionRate(1)
        setCurrencySymbol('$')
        setCurrencyCode(baseCurrency)
        setMarginPct(0)
      } finally {
        setIsLoading(false)
      }
    }
    fetchRate()
  }, [currencyCode, baseCurrency])

  // Convert a single price value (always rounds UP)
  const convert = useCallback((amount) => {
    if (conversionRate === 1 || !amount) return Number(amount || 0)
    return Math.ceil(Number(amount) * conversionRate)
  }, [conversionRate])

  // Format a price with the currency symbol
  const format = useCallback((amount) => {
    const converted = convert(amount)
    return `${currencySymbol}${converted.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }, [convert, currencySymbol])

  // Convert all price fields on an object (e.g. a tier or package)
  const convertPriceFields = useCallback((obj, fields) => {
    if (conversionRate === 1) return { ...obj, currency_symbol: currencySymbol }
    const converted = { ...obj, currency_symbol: currencySymbol }
    fields.forEach(f => {
      if (converted[f] != null) converted[f] = Math.ceil(Number(converted[f]) * conversionRate)
    })
    return converted
  }, [conversionRate, currencySymbol])

  return {
    currencyCode,
    currencySymbol,
    conversionRate,
    marginPct,
    rateSource,
    detectionSource,
    isLoading,
    isDetected,

    // Manual override
    setCurrencyCode,

    // Conversion utilities
    convert,
    format,
    convertPriceFields,
  }
}