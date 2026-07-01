// src/components/admin/SmsQueueViewer.jsx
// View SMS queue status (for admin/debugging)

'use client'

import { useState, useEffect } from 'react'
import Pagination from '@/components/admin/Pagination'

const PAGE_SIZE = 20

export default function SmsQueueViewer() {
  const [messages, setMessages] = useState([])
  const [stats, setStats]       = useState(null)
  const [counts, setCounts]     = useState({ pending: 0, sent: 0, failed: 0, skipped: 0 })
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [page, setPage]         = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => { setPage(1) }, [filter])
  useEffect(() => { loadSmsQueue() }, [filter, page])

  async function loadSmsQueue() {
    try {
      setLoading(true)
      const offset = (page - 1) * PAGE_SIZE
      const response = await fetch(`/api/sms-queue?status=${filter}&limit=${PAGE_SIZE}&offset=${offset}`)
      const data = await response.json()

      if (response.ok) {
        setMessages(data.messages || [])
        setStats(data.statistics)
        setCounts(data.counts || { pending: 0, sent: 0, failed: 0, skipped: 0 })
        setTotalCount(data.total || 0)
      }
    } catch (error) {
      console.error('Load SMS queue error:')
    } finally {
      setLoading(false)
    }
  }

  if (loading && page === 1 && !messages.length) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900">SMS Queue</h2>
        <p className="text-gray-600 mt-1">Monitor SMS delivery status</p>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-6 bg-gray-50">
          <StatCard title="Total"   value={stats.total_messages}   icon="📊" color="blue" />
          <StatCard title="Sent"    value={stats.sent_messages}    icon="✅" color="green" />
          <StatCard title="Pending" value={stats.pending_messages} icon="⏳" color="yellow" />
          <StatCard title="Failed"  value={stats.failed_messages}  icon="❌" color="red" />
          <StatCard title="Skipped" value={stats.skipped_messages} icon="⏭️" color="gray" />
        </div>
      )}

      {/* Filters */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex gap-2 flex-wrap">
          <FilterButton active={filter === 'all'}     onClick={() => setFilter('all')}     count={counts.pending + counts.sent + counts.failed + counts.skipped}>All</FilterButton>
          <FilterButton active={filter === 'pending'} onClick={() => setFilter('pending')} count={counts.pending} color="yellow">Pending</FilterButton>
          <FilterButton active={filter === 'sent'}    onClick={() => setFilter('sent')}    count={counts.sent}    color="green">Sent</FilterButton>
          <FilterButton active={filter === 'failed'}  onClick={() => setFilter('failed')}  count={counts.failed}  color="red">Failed</FilterButton>
          <FilterButton active={filter === 'skipped'} onClick={() => setFilter('skipped')} count={counts.skipped} color="gray">Skipped</FilterButton>
        </div>
      </div>

      {/* Message List */}
      <div className="divide-y divide-gray-200">
        {messages.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No SMS in {filter === 'all' ? 'queue' : filter + ' status'}
          </div>
        ) : (
          messages.map(sms => (
            <SmsRow key={sms.id} sms={sms} />
          ))
        )}
      </div>

      {/* Pagination */}
      <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} />
    </div>
  )
}

function StatCard({ title, value, icon, color }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-200 text-blue-600',
    green:  'bg-green-50 border-green-200 text-green-600',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-600',
    red:    'bg-red-50 border-red-200 text-red-600',
    gray:   'bg-gray-50 border-gray-200 text-gray-600',
  }

  return (
    <div className={`rounded-lg p-4 border-2 ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm opacity-80">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className="text-2xl">{icon}</div>
      </div>
    </div>
  )
}

function FilterButton({ active, onClick, count, color = 'blue', children }) {
  const colors = {
    blue:   active ? 'bg-blue-600 text-white'   : 'bg-white text-blue-600 border-blue-600',
    green:  active ? 'bg-green-600 text-white'   : 'bg-white text-green-600 border-green-600',
    yellow: active ? 'bg-yellow-600 text-white'  : 'bg-white text-yellow-600 border-yellow-600',
    red:    active ? 'bg-red-600 text-white'     : 'bg-white text-red-600 border-red-600',
    gray:   active ? 'bg-gray-600 text-white'    : 'bg-white text-gray-600 border-gray-600',
  }

  return (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-lg border-2 font-medium transition-colors ${colors[color]}`}>
      {children} ({count})
    </button>
  )
}

function SmsRow({ sms }) {
  const [expanded, setExpanded] = useState(false)

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    sent:    'bg-green-100 text-green-800',
    failed:  'bg-red-100 text-red-800',
    skipped: 'bg-gray-100 text-gray-800',
  }

  // Mask phone for display: +2547XXXXXXXX → +254 7XX XXX XX8
  const maskPhone = (phone) => {
    if (!phone || phone.length < 8) return phone || '—'
    return phone.slice(0, 7) + '•••' + phone.slice(-2)
  }

  // Truncate message for preview
  const preview = sms.message?.length > 80
    ? sms.message.substring(0, 80) + '…'
    : sms.message || '—'

  return (
    <div className="p-4 hover:bg-gray-50">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h4 className="font-medium text-gray-900 text-sm">{maskPhone(sms.recipient_phone)}</h4>
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColors[sms.status] || 'bg-gray-100 text-gray-800'}`}>
              {sms.status}
            </span>
            {sms.provider && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-blue-50 text-blue-600">
                {sms.provider}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-600">{preview}</p>

          <p className="text-xs text-gray-500 mt-1">
            Created: {new Date(sms.created_at).toLocaleString('en-KE')}
            {sms.sent_at && ` · Sent: ${new Date(sms.sent_at).toLocaleString('en-KE')}`}
          </p>

          {sms.error_message && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
              <strong>Error:</strong> {sms.error_message.substring(0, 200)}
              {sms.error_message.length > 200 && '…'}
            </div>
          )}
        </div>

        <button onClick={() => setExpanded(!expanded)}
          className="ml-4 px-3 py-1 text-sm text-blue-600 hover:text-blue-800">
          {expanded ? 'Hide' : 'View'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="bg-gray-50 rounded p-4">
            <h5 className="font-medium text-gray-900 mb-2 text-sm">Full Message:</h5>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{sms.message}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-500">
            <div><span className="font-medium">ID:</span> {sms.id}</div>
            <div><span className="font-medium">Phone:</span> {sms.recipient_phone || '—'}</div>
            <div><span className="font-medium">Provider:</span> {sms.provider || '—'}</div>
            <div><span className="font-medium">Notification:</span> {sms.notification_id || '—'}</div>
          </div>
        </div>
      )}
    </div>
  )
}