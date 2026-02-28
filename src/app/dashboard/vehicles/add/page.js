// src/app/dashboard/vehicles/add/page.js
// FIXED VERSION - Matches your actual database schema

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function AddVehiclePage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [vehicleForm, setVehicleForm] = useState({
    plateNumber: '',
    make: '',
    model: '',
    year: '',
    color: '',
    vin: ''
  })

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()
  }, [supabase])

  const validatePlateNumber = (plate) => {
    const kenyaFormat = /^[A-Z]{3}\s?\d{3}[A-Z]?$/i
    return kenyaFormat.test(plate)
  }

  const handleAddVehicle = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (!validatePlateNumber(vehicleForm.plateNumber)) {
      setError('Invalid plate number format. Use format: KXX 123X')
      setLoading(false)
      return
    }

    try {
      console.log('Starting vehicle addition...')
      
      // Step 1: Check if plate exists
      const { data: existingVehicles, error: checkError } = await supabase
        .from('vehicles')
        .select('id, plate_number')
        .eq('plate_number', vehicleForm.plateNumber.toUpperCase())

      if (checkError) {
        console.error('Check error:', checkError)
        throw checkError
      }

      if (existingVehicles && existingVehicles.length > 0) {
        setError('A vehicle with this plate number already exists')
        setLoading(false)
        return
      }

      // Step 2: Insert vehicle - MATCHES YOUR SCHEMA
      const vehicleData = {
        plate_number: vehicleForm.plateNumber.toUpperCase(),
        make: vehicleForm.make,
        model: vehicleForm.model,
        year_of_manufacture: parseInt(vehicleForm.year), // ← Changed from 'year'
        color: vehicleForm.color,
        vin: vehicleForm.vin.toUpperCase() || null,
        updated_by: user.id // ← Added this field
      }

      console.log('Inserting vehicle:', vehicleData)

      const { data: newVehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .insert([vehicleData])
        .select()

      if (vehicleError) {
        console.error('Vehicle insert error:', vehicleError)
        throw vehicleError
      }

      if (!newVehicle || newVehicle.length === 0) {
        throw new Error('Failed to create vehicle')
      }

      const vehicle = newVehicle[0]
      console.log('Vehicle created:', vehicle)

      // Step 3: Get or create user profile
      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)

      if (profileError) {
        console.error('Profile fetch error:', profileError)
        throw profileError
      }

      let profileId = null

      if (profiles && profiles.length > 0) {
        profileId = profiles[0].id
        console.log('Profile found:', profileId)
      } else {
        console.log('Creating new profile...')
        const { data: newProfiles, error: createError } = await supabase
          .from('user_profiles')
          .insert([{
            auth_user_id: user.id,
            first_name: user.user_metadata?.first_name || '',
            last_name: user.user_metadata?.last_name || '',
            phone: user.user_metadata?.phone || '',
          }])
          .select()

        if (createError) {
          console.error('Profile create error:', createError)
          throw createError
        }

        if (!newProfiles || newProfiles.length === 0) {
          throw new Error('Failed to create profile')
        }
        
        profileId = newProfiles[0].id
        console.log('Profile created:', profileId)
      }

      // Step 4: Create ownership
      console.log('Creating ownership...')
      const { error: ownershipError } = await supabase
        .from('vehicle_ownership')
        .insert([{
          vehicle_id: vehicle.id,
          owner_user_id: profileId,
        }])

      if (ownershipError) {
        console.error('Ownership error:', ownershipError)
        throw ownershipError
      }

      console.log('Success! Vehicle added')

      // Success
      setSuccess('Vehicle added successfully!')
      setVehicleForm({
        plateNumber: '',
        make: '',
        model: '',
        year: '',
        color: '',
        vin: ''
      })

      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)

    } catch (err) {
      console.error('Full error:', err)
      console.error('Error message:', err?.message)
      console.error('Error details:', err?.details)
      console.error('Error hint:', err?.hint)
      
      const errorMessage = err?.message || err?.details || 'Failed to add vehicle. Please try again.'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button 
        onClick={() => router.back()} 
        className="mb-6 text-blue-600 hover:text-blue-700 font-medium flex items-center"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back
      </button>

      <h2 className="text-3xl font-bold text-gray-800 mb-8">Add New Vehicle</h2>

      <div className="bg-white rounded-xl p-6 border border-gray-200">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="text-red-600 mr-3 mt-0.5" size={20} />
            <div>
              <h4 className="font-semibold text-red-800">Error</h4>
              <p className="text-red-600 text-sm whitespace-pre-wrap">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
            <AlertCircle className="text-green-600 mr-3 mt-0.5" size={20} />
            <div>
              <h4 className="font-semibold text-green-800">Success!</h4>
              <p className="text-green-600 text-sm">{success}</p>
              <p className="text-green-600 text-sm">Redirecting to dashboard...</p>
            </div>
          </div>
        )}

        <form onSubmit={handleAddVehicle}>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Plate Number *</label>
            <input 
              type="text" 
              value={vehicleForm.plateNumber} 
              onChange={(e) => setVehicleForm({...vehicleForm, plateNumber: e.target.value.toUpperCase()})} 
              required 
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase" 
              placeholder="KXX 123X" 
              maxLength={8}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Make *</label>
              <input 
                type="text" 
                value={vehicleForm.make} 
                onChange={(e) => setVehicleForm({...vehicleForm, make: e.target.value})} 
                required 
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                placeholder="Toyota" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Model *</label>
              <input 
                type="text" 
                value={vehicleForm.model} 
                onChange={(e) => setVehicleForm({...vehicleForm, model: e.target.value})} 
                required 
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                placeholder="Corolla" 
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Year *</label>
              <input 
                type="number" 
                value={vehicleForm.year} 
                onChange={(e) => setVehicleForm({...vehicleForm, year: e.target.value})} 
                required 
                min="1900" 
                max={new Date().getFullYear() + 1}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                placeholder="2020" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Color *</label>
              <input 
                type="text" 
                value={vehicleForm.color} 
                onChange={(e) => setVehicleForm({...vehicleForm, color: e.target.value})} 
                required 
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                placeholder="White" 
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">VIN (Optional)</label>
            <input 
              type="text" 
              value={vehicleForm.vin} 
              onChange={(e) => setVehicleForm({...vehicleForm, vin: e.target.value.toUpperCase()})} 
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase" 
              placeholder="1HGBH41JXMN109186"
              maxLength={17}
            />
          </div>

          <div className="flex gap-4">
            <button 
              type="button"
              onClick={() => router.back()}
              className="flex-1 bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition font-medium"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading} 
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
            >
              {loading ? 'Adding Vehicle...' : 'Add Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}