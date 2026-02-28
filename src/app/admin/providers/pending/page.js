'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  Store, Mail, Phone, MapPin, Calendar, FileText,
  CheckCircle, XCircle, Eye, Clock, Filter
} from 'lucide-react'
import Link from 'next/link'

export default function PendingProvidersPage() {
  const router = useRouter()
  const supabase = createClient()
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, pending, recent

  useEffect(() => {
    loadPendingProviders()
  }, [filter])

  const loadPendingProviders = async () => {
    try {
      let query = supabase
        .from('service_providers')
        .select(`
          *,
          owner:user_profiles(
            id,
            first_name,
            last_name,
            email,
            phone
          ),
          provider_type:service_provider_types(
            display_name,
            code
          ),
          shops(
            id,
            name,
            county,
            town
          )
        `)

      if (filter === 'pending') {
        query = query.eq('status', 'pending_verification')
      } else if (filter === 'recent') {
        query = query.gte('submitted_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      }

      const { data, error } = await query
        .order('submitted_at', { ascending: false })

      if (error) throw error

      setProviders(data || [])
    } catch (error) {
      console.error('Error loading providers:', error)
    } finally {
      setLoading(false)
    }
  }

  const quickApprove = async (providerId, e) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!confirm('Are you sure you want to approve this provider?')) return

    try {
      const { error } = await supabase
        .from('service_providers')
        .update({
          status: 'active',
          is_active: true,
          is_verified: true,
          verified_at: new Date().toISOString()
        })
        .eq('id', providerId)

      if (error) throw error

      // Refresh list
      loadPendingProviders()
      alert('Provider approved successfully!')
    } catch (error) {
      console.error('Error approving provider:', error)
      alert('Failed to approve provider')
    }
  }

  const quickReject = async (providerId, e) => {
    e.preventDefault()
    e.stopPropagation()
    
    const reason = prompt('Please enter rejection reason:')
    if (!reason) return

    try {
      // Update provider status
      const { error: updateError } = await supabase
        .from('service_providers')
        .update({
          status: 'rejected',
          is_active: false
        })
        .eq('id', providerId)

      if (updateError) throw updateError

      // Create rejection record
      const { error: rejectError } = await supabase
        .from('provider_rejections')
        .insert({
          service_provider_id: providerId,
          rejected_by: (await supabase.auth.getUser()).data.user.id,
          rejection_reason: reason
        })

      if (rejectError) throw rejectError

      // Refresh list
      loadPendingProviders()
      alert('Provider rejected')
    } catch (error) {
      console.error('Error rejecting provider:', error)
      alert('Failed to reject provider')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Provider Applications</h1>
        <p className="text-gray-600 mt-2">Review and approve service provider registrations</p>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex items-center space-x-4">
          <Filter className="h-5 w-5 text-gray-400" />
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
                filter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
                filter === 'pending'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Pending Only
            </button>
            <button
              onClick={() => setFilter('recent')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
                filter === 'recent'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Last 7 Days
            </button>
          </div>
          <div className="ml-auto text-sm text-gray-500">
            {providers.length} provider{providers.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Providers List */}
      <div className="space-y-4">
        {providers.length === 0 ? (
          <div className="bg-white shadow rounded-lg p-12 text-center">
            <Store className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No providers found</h3>
            <p className="text-gray-500">
              {filter === 'pending' 
                ? 'No pending provider applications at this time'
                : 'No providers match the selected filter'
              }
            </p>
          </div>
        ) : (
          providers.map((provider) => (
            <div
              key={provider.id}
              className="bg-white shadow rounded-lg overflow-hidden hover:shadow-lg transition"
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4 flex-1">
                    {/* Icon */}
                    <div className="flex-shrink-0">
                      <div className="h-16 w-16 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                        <Store className="h-8 w-8 text-white" />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-xl font-semibold text-gray-900">
                          {provider.name}
                        </h3>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          provider.status === 'pending_verification'
                            ? 'bg-yellow-100 text-yellow-800'
                            : provider.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {provider.status === 'pending_verification' ? 'Pending' : 
                           provider.status === 'active' ? 'Active' : 'Rejected'}
                        </span>
                        {provider.is_verified && (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-2">
                          <div className="flex items-center text-gray-600">
                            <FileText className="h-4 w-4 mr-2 text-gray-400" />
                            <span className="font-medium">Type:</span>
                            <span className="ml-2">{provider.provider_type?.display_name}</span>
                          </div>
                          <div className="flex items-center text-gray-600">
                            <Mail className="h-4 w-4 mr-2 text-gray-400" />
                            <span className="font-medium">Email:</span>
                            <span className="ml-2">{provider.owner?.email}</span>
                          </div>
                          <div className="flex items-center text-gray-600">
                            <Phone className="h-4 w-4 mr-2 text-gray-400" />
                            <span className="font-medium">Phone:</span>
                            <span className="ml-2">{provider.phone || 'N/A'}</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center text-gray-600">
                            <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                            <span className="font-medium">Submitted:</span>
                            <span className="ml-2">
                              {provider.submitted_at 
                                ? new Date(provider.submitted_at).toLocaleDateString() 
                                : 'N/A'
                              }
                            </span>
                          </div>
                          <div className="flex items-center text-gray-600">
                            <MapPin className="h-4 w-4 mr-2 text-gray-400" />
                            <span className="font-medium">Location:</span>
                            <span className="ml-2">
                              {provider.shops?.[0]?.town || 'Not specified'}
                            </span>
                          </div>
                          <div className="flex items-center text-gray-600">
                            <Store className="h-4 w-4 mr-2 text-gray-400" />
                            <span className="font-medium">Shops:</span>
                            <span className="ml-2">{provider.shops?.length || 0}</span>
                          </div>
                        </div>
                      </div>

                      {provider.description && (
                        <p className="mt-3 text-sm text-gray-600 line-clamp-2">
                          {provider.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col space-y-2 ml-4">
                    <Link
                      href={`/admin/providers/${provider.id}`}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Review
                    </Link>
                    
                    {provider.status === 'pending_verification' && (
                      <>
                        <button
                          onClick={(e) => quickApprove(provider.id, e)}
                          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </button>
                        <button
                          onClick={(e) => quickReject(provider.id, e)}
                          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
