// src/app/api/email-queue/route.js
// View email queue status and statistics

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request) {
  try {
    // Create Supabase client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // 'pending', 'sent', 'failed', or 'all'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('email_queue_secure')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Filter by status if provided
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: emails, error: emailsError, count } = await query

    if (emailsError) {
      return NextResponse.json({ error: emailsError.message }, { status: 500 })
    }

    // Get statistics
    const { data: stats, error: statsError } = await supabase
      .rpc('get_email_queue_stats')

    if (statsError) {
      console.error('Stats error:', statsError)
    }

    // Get counts by status
    const { data: statusCounts } = await supabase
      .from('email_queue_secure')
      .select('status')

    const countsByStatus = {
      pending: 0,
      sent: 0,
      failed: 0
    }

    statusCounts?.forEach(item => {
      if (item.status in countsByStatus) {
        countsByStatus[item.status]++
      }
    })

    return NextResponse.json({
      emails,
      total: count,
      limit,
      offset,
      statistics: stats?.[0] || null,
      counts: countsByStatus
    })

  } catch (error) {
    console.error('Email queue fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Clean up old sent emails
export async function DELETE(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    // Delete emails older than X days with status 'sent'
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const { error } = await supabase
      .from('email_queue')
      .delete()
      .eq('status', 'sent')
      .lt('sent_at', cutoffDate.toISOString())

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Deleted sent emails older than ${days} days`
    })

  } catch (error) {
    console.error('Email queue cleanup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}