// src/lib/guards/companyAccess.js
// Server-side company subscription guard for API routes.
// Call requireCompanyWrite(supabase, companyId) at the top of
// any POST/PATCH/DELETE handler that modifies company data.

import { NextResponse } from 'next/server'

/**
 * Checks if the company has write access (active subscription or trial).
 * Returns null if allowed, or a NextResponse error if denied.
 *
 * Usage:
 *   const denied = await requireCompanyWrite(supabase, companyId)
 *   if (denied) return denied
 */
export async function requireCompanyWrite(supabase, companyId) {
  const { data, error } = await supabase.rpc('check_company_access', {
    p_company_id: companyId,
  })

  if (error) {
    console.error('check_company_access error:', error)
    return NextResponse.json(
      { error: 'Failed to verify company subscription status' },
      { status: 500 }
    )
  }

  if (!data?.can_write) {
    return NextResponse.json(
      {
        error: data?.reason || 'Company subscription is inactive. Write access denied.',
        access_state: data?.state,
        subscription_status: data?.subscription_status,
      },
      { status: 403 }
    )
  }

  return null // access granted
}

/**
 * Checks if the company can add more vehicles.
 * Returns null if allowed, or a NextResponse error if at limit.
 */
export async function requireCanAddVehicle(supabase, companyId) {
  const denied = await requireCompanyWrite(supabase, companyId)
  if (denied) return denied

  const { data } = await supabase.rpc('check_company_access', {
    p_company_id: companyId,
  })

  if (data && !data.can_add_vehicle) {
    return NextResponse.json(
      {
        error: `Vehicle limit reached. ${data.current_vehicles} of ${data.max_vehicles} vehicles used on your ${data.plan_name} plan.`,
        limit_info: data,
      },
      { status: 403 }
    )
  }

  return null
}

/**
 * Checks if the company can add more staff.
 * Returns null if allowed, or a NextResponse error if at limit.
 */
export async function requireCanAddStaff(supabase, companyId) {
  const denied = await requireCompanyWrite(supabase, companyId)
  if (denied) return denied

  const { data } = await supabase.rpc('check_company_access', {
    p_company_id: companyId,
  })

  if (data && !data.can_add_staff) {
    return NextResponse.json(
      {
        error: `Staff limit reached. ${data.current_staff} of ${data.max_staff} members on your ${data.plan_name} plan.`,
        limit_info: data,
      },
      { status: 403 }
    )
  }

  return null
}