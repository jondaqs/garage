'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Building2, Users, Wrench, ClipboardList,
  Phone, Mail, MapPin, Shield, CheckCircle, AlertCircle,
  Loader2, Award, Calendar
} from 'lucide-react'

export default function ProviderOverviewPage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const { data: { user } } = await supabase.auth.getUser()

      // ── 1. Get current user's profile ──────────────────────────────────────
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) throw new Error('Profile not found')

      // ── 2. Verify membership via service_provider_users (all roles) ──────────
      const { data: spuRow, error: spuErr } = await supabase
        .from('service_provider_users')
        .select('id, role, is_verified, is_active, joined_at, can_approve_work, can_manage_inventory, can_manage_team, can_send_estimates, can_send_invoice')
        .eq('user_id', profile.id)
        .eq('service_provider_id', params.providerId)
        .eq('is_active', true)
        .maybeSingle()

      if (spuErr) throw spuErr
      if (!spuRow) throw new Error('You are not a member of this service provider.')

      // Also get mechanic-specific data if they have a mechanic role
      const { data: mechanic } = await supabase
        .from('mechanics')
        .select('id, role, specialization, experience_years, is_verified, can_approve_work, can_manage_inventory, can_manage_team, can_send_estimates, can_send_invoice')
        .eq('user_id', profile.id)
        .eq('service_provider_id', params.providerId)
        .eq('is_active', true)
        .maybeSingle()

      // Merge: SPU is source of truth for role, mechanic for specialization
      const memberRecord = {
        created_at: spuRow.joined_at,  // alias so JSX using mechanic.created_at still works
        ...spuRow,
        mechanic_id:      mechanic?.id || null,
        specialization:   mechanic?.specialization || null,
        experience_years: mechanic?.experience_years || null,
        // Merge permissions from both sources
        can_approve_work:     !!(spuRow.can_approve_work     || mechanic?.can_approve_work),
        can_manage_inventory: !!(spuRow.can_manage_inventory || mechanic?.can_manage_inventory),
        can_manage_team:      !!(spuRow.can_manage_team      || mechanic?.can_manage_team),
        can_send_estimates:   !!(spuRow.can_send_estimates   || mechanic?.can_send_estimates),
        can_send_invoice:     !!(spuRow.can_send_invoice || mechanic?.can_send_invoice),
        is_verified:          !!(spuRow.is_verified || mechanic?.is_verified),
      }

      // ── 3. Get service provider details (public read) ──────────────────────
      const { data: provider, error: provErr } = await supabase
        .from('service_providers')
        .select(`
          id, name, phone, email, description,
          years_in_operation, is_verified, status,
          owner_user_id
        `)
        .eq('id', params.providerId)
        .single()

      if (provErr) throw provErr

      // ── 4. Get team member count ───────────────────────────────────────────
      const { count: teamCount } = await supabase
        .from('service_provider_users')
        .select('id', { count: 'exact', head: true })
        .eq('service_provider_id', params.providerId)
        .eq('is_active', true)

      // ── 5. Get owner profile (public read via service_providers join) ──────
      // owner_user_id is a user_profiles.id — fetch directly
      let ownerName = 'Unknown'
      if (provider.owner_user_id) {
        const { data: ownerProfile } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, phone, email')
          .eq('id', provider.owner_user_id)
          .maybeSingle()

        if (ownerProfile) {
          ownerName = `${ownerProfile.first_name || ''} ${ownerProfile.last_name || ''}`.trim() || 'Unknown'
        }
      }

      // ── 6. Get own assigned work orders summary ────────────────────────────
      const { data: woResult } = await supabase.rpc(
        'get_mechanic_assigned_work_orders',
        { p_mechanic_user_id: user.id }
      )
      const assignedWOs  = woResult?.work_orders || []
      const pendingWOs   = assignedWOs.filter(w => w.mechanic_assignment_status === 'pending')
      const activeWOs    = assignedWOs.filter(w => w.mechanic_assignment_status === 'acknowledged')

      // ── 7. Get shop(s) ─────────────────────────────────────────────────────
      const { data: shops } = await supabase
        .from('shops')
        .select('id, name, town, county, street, phone')
        .eq('service_provider_id', params.providerId)
        .eq('is_active', true)
        .limit(3)

      setData({
        provider,
        mechanic: memberRecord,
        ownerName,
        teamCount:  teamCount || 0,
        assignedWOs,
        pendingWOs,
        activeWOs,
        shops:      shops || [],
        myName:     `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [params.providerId])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )

  if (error) return (
    <div className="max-w-2xl mx-auto p-6">
      <button onClick={() => router.push('/dashboard/my-teams')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
        <ArrowLeft size={16} /> Back to My Teams
      </button>
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
        <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
        <div>
          <p className="font-semibold text-red-900">Access denied</p>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
      </div>
    </div>
  )

  const { provider, mechanic, ownerName, teamCount, pendingWOs, activeWOs, assignedWOs, shops } = data

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Wrench size={22} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{provider.name}</h1>
            {provider.is_verified && (
              <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                <CheckCircle size={11} /> Verified
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">{provider.status?.replace(/_/g, ' ')}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{teamCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Team Members</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-orange-600">{pendingWOs.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Pending Response</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{activeWOs.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Active Work Orders</p>
        </div>
      </div>

      {/* Provider details */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Provider Info</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {/* Admin / Owner */}
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <Shield size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Admin / Owner</p>
              <p className="font-semibold text-gray-900">{ownerName}</p>
            </div>
          </div>

          {/* Team size */}
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <Users size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Team Size</p>
              <p className="font-semibold text-gray-900">{teamCount} active member{teamCount !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Contact */}
          {provider.phone && (
            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
              <Phone size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Phone</p>
                <p className="font-medium text-gray-900">{provider.phone}</p>
              </div>
            </div>
          )}
          {provider.email && (
            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
              <Mail size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Email</p>
                <p className="font-medium text-gray-900">{provider.email}</p>
              </div>
            </div>
          )}
          {provider.years_in_operation > 0 && (
            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
              <Calendar size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Experience</p>
                <p className="font-medium text-gray-900">{provider.years_in_operation} years in operation</p>
              </div>
            </div>
          )}
        </div>

        {provider.description && (
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{provider.description}</p>
        )}

        {/* Shops */}
        {shops.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-2">Location{shops.length > 1 ? 's' : ''}</p>
            <div className="space-y-2">
              {shops.map(shop => (
                <div key={shop.id} className="flex items-start gap-2 text-sm text-gray-700">
                  <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <span>
                    {shop.name}
                    {shop.town ? `, ${shop.town}` : ''}
                    {shop.county ? `, ${shop.county}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* My membership */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">My Membership</h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Role</p>
            <p className="font-semibold text-gray-900 capitalize">{mechanic.role?.replace(/_/g, ' ') || 'Mechanic'}</p>
          </div>
          {mechanic.specialization && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Specialization</p>
              <p className="font-medium text-gray-900">{mechanic.specialization}</p>
            </div>
          )}
          {mechanic.experience_years > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Experience</p>
              <p className="font-medium text-gray-900">{mechanic.experience_years} yr{mechanic.experience_years !== 1 ? 's' : ''}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Member Since</p>
            <p className="font-medium text-gray-900">{new Date(mechanic.created_at).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Verified</p>
            <p className={`font-medium ${mechanic.is_verified ? 'text-green-700' : 'text-gray-400'}`}>
              {mechanic.is_verified ? '✓ Verified' : 'Pending verification'}
            </p>
          </div>
        </div>

        {/* Permissions */}
        <div>
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-2">Permissions</p>
          <div className="flex flex-wrap gap-2">
            {mechanic.can_approve_work && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-xs font-medium text-purple-700">
                <Wrench size={11} /> Can approve & manage work orders
              </span>
            )}
            {mechanic.can_send_estimates && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg text-xs font-medium text-yellow-700">
                <Award size={11} /> Can send estimates to customer
              </span>
            )}
            {mechanic.can_manage_inventory && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-medium text-blue-700">
                <Award size={11} /> Can manage inventory
              </span>
            )}
            {mechanic.can_manage_team && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-xs font-medium text-orange-700">
                <Users size={11} /> Can manage team
              </span>
            )}
            {!mechanic.can_approve_work && !mechanic.can_send_estimates && !mechanic.can_manage_inventory && !mechanic.can_manage_team && !mechanic.can_send_invoice && (
              <span className="text-xs text-gray-400 italic">Acknowledge / decline assignments only</span>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => router.push('/dashboard/my-teams')}
          className="flex items-center justify-center gap-2 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition text-sm font-medium text-gray-700 hover:text-blue-700">
          <Users size={16} />
          My Teams
        </button>
        <button onClick={() => router.push('/dashboard/my-teams/work-orders')}
          className="flex items-center justify-center gap-2 p-4 bg-white rounded-xl border border-gray-200 hover:border-green-300 hover:bg-green-50 transition text-sm font-medium text-gray-700 hover:text-green-700">
          <ClipboardList size={16} />
          Assigned Work Orders
          {assignedWOs.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white rounded-full text-[10px] font-bold">
              {assignedWOs.length}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}