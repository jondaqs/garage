'use client'

import React, { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { 
  CheckCircle, AlertCircle, Building2, Briefcase, MapPin, 
  Users, Package, DollarSign, Loader 
} from 'lucide-react'

export default function ReviewSubmitStep({ data, previousStep, userProfile }) {
  const supabase = createClient()
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    try {
      // 1. Create Service Provider
      const { data: provider, error: providerError } = await supabase
        .from('service_providers')
        .insert([{
          owner_user_id: userProfile.id,
          provider_type_id: data.providerType.id,
          name: data.providerInfo.businessName,
          registration_number: data.providerInfo.registrationNumber,
          tax_id: data.providerInfo.taxId,
          description: data.providerInfo.description,
          phone: data.providerInfo.phone,
          email: data.providerInfo.email,
          years_in_operation: data.providerInfo.yearsInOperation ? parseInt(data.providerInfo.yearsInOperation) : null,
          status: 'pending_verification',
          is_active: false,
          is_verified: false,
          submitted_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (providerError) throw providerError

      // 2. Assign service provider owner role
      const { data: ownerRole } = await supabase
        .from('user_roles_lookup')
        .select('id')
        .eq('code', 'service_provider_owner')
        .single()

      if (ownerRole) {
        await supabase
          .from('user_roles')
          .insert([{
            user_id: userProfile.id,
            role_id: ownerRole.id
          }])
      }

      // 3. Link services
      if (data.selectedServices && data.selectedServices.length > 0) {
        const serviceLinks = data.selectedServices.map(service => ({
          service_provider_id: provider.id,
          service_id: service.id,
          is_active: true
        }))

        const { error: servicesError } = await supabase
          .from('service_provider_services')
          .insert(serviceLinks)

        if (servicesError) throw servicesError
      }

      // 4. Create shops
      if (data.shops && data.shops.length > 0) {
        const shopsToInsert = data.shops.map(shop => ({
          service_provider_id: provider.id,
          name: shop.name,
          description: shop.description,
          phone: shop.phone,
          email: shop.email,
          county: shop.county,
          town: shop.town,
          street: shop.street,
          latitude: shop.latitude ? parseFloat(shop.latitude) : null,
          longitude: shop.longitude ? parseFloat(shop.longitude) : null,
          opening_time: shop.openingTime,
          closing_time: shop.closingTime,
          is_active: false // Will be activated after verification
        }))

        const { error: shopsError } = await supabase
          .from('shops')
          .insert(shopsToInsert)

        if (shopsError) throw shopsError
      }

      // 5. Store banking info if provided (you might want a separate table)
      // For now, we'll skip this or you can add a payment_info table

      // 6. Create notification for admin
      const { error: notifError } = await supabase
        .from('notifications')
        .insert([{
          recipient_type: 'admin',
          notification_type: 'new_provider_registration',
          title: 'New Service Provider Registration',
          message: `${data.providerInfo.businessName} has submitted a registration for approval`,
          reference_id: provider.id,
          reference_type: 'service_provider'
        }])

      // 7. Create notification for user
      await supabase
        .from('notifications')
        .insert([{
          recipient_user_id: userProfile.id,
          notification_type: 'registration_confirmation',
          title: 'Registration Submitted',
          message: 'Your service provider registration has been submitted and is pending verification. We will notify you once the review is complete.',
          reference_id: provider.id,
          reference_type: 'service_provider'
        }])

      setSuccess(true)

      // Wait a moment for database to fully commit
      await new Promise(resolve => setTimeout(resolve, 500))

      // Refresh the session to pick up the new role
      await supabase.auth.refreshSession()
      
      // Redirect to provider dashboard after 2 seconds
      setTimeout(() => {
        router.push('/provider/dashboard')
        router.refresh()
      }, 2000)

    } catch (err) {
      console.error('Submission error:', err)
      setError(err.message || 'Failed to submit registration. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="bg-green-50 border border-green-200 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="text-green-600" size={48} />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-4">
          Registration Submitted Successfully!
        </h2>
        <p className="text-lg text-gray-600 mb-6">
          Your application is now pending verification. Our team will review your information 
          and documents within 2-5 business days.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-left">
          <h3 className="font-semibold text-gray-800 mb-3">What happens next?</h3>
          <ul className="space-y-2 text-gray-700">
            <li className="flex items-start">
              <CheckCircle className="text-blue-600 mr-2 flex-shrink-0 mt-0.5" size={18} />
              <span>We'll review your business documents and information</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="text-blue-600 mr-2 flex-shrink-0 mt-0.5" size={18} />
              <span>You'll receive email notifications about your application status</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="text-blue-600 mr-2 flex-shrink-0 mt-0.5" size={18} />
              <span>Once approved, you'll get full access to your provider dashboard</span>
            </li>
          </ul>
        </div>
        <p className="text-sm text-gray-500 mt-6">
          Redirecting to dashboard...
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Review & Submit
        </h2>
        <p className="text-gray-600">
          Please review your information before submitting
        </p>
      </div>

      <div className="space-y-6 mb-8">
        {/* Provider Type */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Building2 className="text-blue-600 mr-3" size={24} />
            <h3 className="text-lg font-semibold text-gray-800">Provider Type</h3>
          </div>
          <p className="text-gray-700">{data.providerType?.display_name}</p>
        </div>

        {/* Business Information */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Briefcase className="text-blue-600 mr-3" size={24} />
            <h3 className="text-lg font-semibold text-gray-800">Business Information</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Business Name</p>
              <p className="text-gray-800 font-medium">{data.providerInfo?.businessName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Registration Number</p>
              <p className="text-gray-800 font-medium">{data.providerInfo?.registrationNumber}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Tax ID</p>
              <p className="text-gray-800 font-medium">{data.providerInfo?.taxId}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Contact</p>
              <p className="text-gray-800 font-medium">{data.providerInfo?.phone}</p>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm text-gray-500">Description</p>
            <p className="text-gray-700">{data.providerInfo?.description}</p>
          </div>
        </div>

        {/* Services */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Briefcase className="text-blue-600 mr-3" size={24} />
            <h3 className="text-lg font-semibold text-gray-800">Services Offered</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.selectedServices?.map(service => (
              <span key={service.id} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                {service.display_name}
              </span>
            ))}
          </div>
        </div>

        {/* Shop Locations */}
        {data.shops && data.shops.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <MapPin className="text-blue-600 mr-3" size={24} />
              <h3 className="text-lg font-semibold text-gray-800">Shop Locations</h3>
            </div>
            <div className="space-y-3">
              {data.shops.map((shop, index) => (
                <div key={index} className="bg-gray-50 rounded p-3">
                  <p className="font-medium text-gray-800">{shop.name}</p>
                  <p className="text-sm text-gray-600">{shop.street}, {shop.town}, {shop.county}</p>
                  <p className="text-sm text-gray-500">Hours: {shop.openingTime} - {shop.closingTime}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documents */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Documents Uploaded</h3>
          <div className="space-y-2">
            {data.documents?.map(doc => (
              <div key={doc.id} className="flex items-center text-gray-700">
                <CheckCircle className="text-green-500 mr-2" size={18} />
                <span>{doc.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
          <AlertCircle className="text-red-600 mr-3 flex-shrink-0" size={20} />
          <div>
            <p className="text-red-800 font-medium">Submission Error</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-yellow-800 text-sm">
          <strong>Important:</strong> By submitting this registration, you confirm that all information 
          provided is accurate and you agree to our terms and conditions. Your application will be 
          reviewed within 2-5 business days.
        </p>
      </div>

      <div className="flex justify-between">
        <button
          onClick={previousStep}
          disabled={submitting}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-8 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {submitting ? (
            <>
              <Loader className="animate-spin mr-2" size={20} />
              Submitting...
            </>
          ) : (
            <>
              <CheckCircle className="mr-2" size={20} />
              Submit for Verification
            </>
          )}
        </button>
      </div>
    </div>
  )
}
