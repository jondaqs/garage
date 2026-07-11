/**
 * POST /api/work-orders/[id]/qc
 * Provider submits QC result.
 * On fail: status → rework, no notifications sent.
 * On pass: stays at quality_check, provider then calls /complete.
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse }  from 'next/server'
import { writeLimiter } from '@/lib/rateLimiters'
import { requireUUID, sanitizeText } from '@/lib/validation'

export async function POST(request, { params }) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

  try {
    const supabase            = await createClient()
    const { id: workOrderId } = await params
    if (!requireUUID(workOrderId)) return NextResponse.json({ error: 'Invalid work order ID' }, { status: 400 })
    const body                = await request.json().catch(() => ({}))
    const { passed, notes: rawNotes, checklist }   = body
    if (typeof passed !== 'boolean') return NextResponse.json({ error: 'passed must be true or false' }, { status: 400 })
    const notes = sanitizeText(rawNotes, 2000)

    if (typeof passed !== 'boolean') {
      return NextResponse.json({ error: 'passed (boolean) is required' }, { status: 400 })
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: result, error: rpcErr } = await supabase.rpc('submit_quality_check', {
      p_work_order_id:    workOrderId,
      p_provider_user_id: user.id,
      p_passed:           passed,
      p_notes:            notes || null,
      p_checklist:        checklist || null,
    })

    if (rpcErr) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })

    return NextResponse.json({
      success: true,
      passed:  result.passed,
      status:  result.status,
    })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/qc error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}