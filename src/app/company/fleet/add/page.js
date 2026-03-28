// src/app/company/fleet/add/page.js
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function AddFleetVehiclePage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    plateNumber: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    vin: '',
    color: '',
    mileage: '',
    fuelType: 'petrol',
    assignedDriver: '',
    notes: '',
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      // Get user's company
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, company_id, company_users!inner(is_admin)')
        .eq('auth_user_id', user.id)
        .single();
      
      if (!profile?.company_id) {
        throw new Error('You are not associated with a company');
      }
      
      if (!profile.company_users?.[0]?.is_admin) {
        throw new Error('Only admins can add vehicles');
      }
      
      // Check if plate number already exists
      const { data: existing } = await supabase
        .from('vehicles')
        .select('id')
        .eq('plate_number', formData.plateNumber.toUpperCase())
        .maybeSingle();
      
      if (existing) {
        throw new Error('A vehicle with this plate number already exists');
      }
      
      // Create vehicle
      const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .insert({
          plate_number: formData.plateNumber.toUpperCase(),
          make: formData.make,
          model: formData.model,
          year_of_manufacture: parseInt(formData.year),
          vin: formData.vin || null,
          color: formData.color,
          updated_by: user.id,
        })
        .select()
        .single();
      
      if (vehicleError) throw vehicleError;
      
      // Set company ownership
      const { error: ownershipError } = await supabase
        .from('vehicle_ownership')
        .insert({
          vehicle_id: vehicle.id,
          owner_company_id: profile.company_id,
        });
      
      if (ownershipError) throw ownershipError;
      
      // If driver assigned, create assignment
      if (formData.assignedDriver) {
        await supabase
          .from('company_vehicle_assignments')
          .insert({
            company_id: profile.company_id,
            vehicle_id: vehicle.id,
            assigned_to_user_id: formData.assignedDriver,
            primary_driver: true,
            is_active: true,
            notes: formData.notes || null,
          });
      }
      
      // Create initial vehicle history entry
      if (formData.mileage) {
        await supabase
          .from('vehicle_history')
          .insert({
            vehicle_id: vehicle.id,
            mileage: parseInt(formData.mileage),
            recorded_at: new Date().toISOString(),
          });
      }
      
      router.push('/company/dashboard?tab=fleet');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:underline mb-4"
          >
            ← Back to Fleet
          </button>
          <h1 className="text-3xl font-bold mb-2">Add Vehicle to Fleet</h1>
          <p className="text-gray-600">Register a new company vehicle</p>
        </div>

        <div className="bg-white rounded-lg shadow">
          {error && (
            <div className="m-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Plate Number * <span className="text-gray-500">(e.g., KAA 123A)</span>
                </label>
                <input
                  type="text"
                  value={formData.plateNumber}
                  onChange={(e) => handleChange('plateNumber', e.target.value.toUpperCase())}
                  className="w-full p-3 border rounded-lg uppercase"
                  placeholder="KAA 123A"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Make *</label>
                <input
                  type="text"
                  value={formData.make}
                  onChange={(e) => handleChange('make', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                  placeholder="Toyota"
                  required
                  list="make-suggestions"
                />
                <datalist id="make-suggestions">
                  <option value="Toyota" />
                  <option value="Nissan" />
                  <option value="Mazda" />
                  <option value="Mitsubishi" />
                  <option value="Subaru" />
                  <option value="Isuzu" />
                  <option value="Mercedes-Benz" />
                  <option value="BMW" />
                  <option value="Volkswagen" />
                  <option value="Ford" />
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Model *</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => handleChange('model', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                  placeholder="Hilux"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Year *</label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) => handleChange('year', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Color</label>
                <input
                  type="text"
                  value={formData.color}
                  onChange={(e) => handleChange('color', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                  placeholder="White"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">VIN (Optional)</label>
                <input
                  type="text"
                  value={formData.vin}
                  onChange={(e) => handleChange('vin', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                  placeholder="17-character VIN"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Current Mileage (km)</label>
                <input
                  type="number"
                  value={formData.mileage}
                  onChange={(e) => handleChange('mileage', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                  placeholder="50000"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Fuel Type</label>
                <select
                  value={formData.fuelType}
                  onChange={(e) => handleChange('fuelType', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                >
                  <option value="petrol">Petrol</option>
                  <option value="diesel">Diesel</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="electric">Electric</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                className="w-full p-3 border rounded-lg h-24"
                placeholder="Additional information about this vehicle..."
              />
            </div>

            <div className="border-t pt-6">
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="px-6 py-3 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Adding Vehicle...' : 'Add to Fleet'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}