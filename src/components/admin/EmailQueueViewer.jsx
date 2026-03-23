// src/components/admin/EmailQueueViewer.jsx
// View email queue status (for admin/debugging)

'use client'

import { useState, useEffect } from 'react'

export default function EmailQueueViewer() {
  const [emails, setEmails] = useState([])
  const [stats, setStats] = useState(null)
  const [counts, setCounts] = useState({ pending: 0, sent: 0, failed: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    loadEmailQueue()
  }, [filter])

  async function loadEmailQueue() {
    try {
      setLoading(true)
      const response = await fetch(`/api/email-queue?status=${filter}&limit=50`)
      const data = await response.json()

      if (response.ok) {
        setEmails(data.emails || [])
        setStats(data.statistics)
        setCounts(data.counts || { pending: 0, sent: 0, failed: 0 })
      }
    } catch (error) {
      console.error('Load email queue error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
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
        <h2 className="text-2xl font-bold text-gray-900">📧 Email Queue</h2>
        <p className="text-gray-600 mt-1">Monitor email delivery status</p>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-gray-50">
          <StatCard
            title="Total Emails"
            value={stats.total_emails}
            icon="📊"
            color="blue"
          />
          <StatCard
            title="Sent"
            value={stats.sent_emails}
            icon="✅"
            color="green"
          />
          <StatCard
            title="Pending"
            value={stats.pending_emails}
            icon="⏳"
            color="yellow"
          />
          <StatCard
            title="Failed"
            value={stats.failed_emails}
            icon="❌"
            color="red"
          />
        </div>
      )}

      {/* Filters */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex gap-2">
          <FilterButton
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            count={counts.pending + counts.sent + counts.failed}
          >
            All
          </FilterButton>
          <FilterButton
            active={filter === 'pending'}
            onClick={() => setFilter('pending')}
            count={counts.pending}
            color="yellow"
          >
            Pending
          </FilterButton>
          <FilterButton
            active={filter === 'sent'}
            onClick={() => setFilter('sent')}
            count={counts.sent}
            color="green"
          >
            Sent
          </FilterButton>
          <FilterButton
            active={filter === 'failed'}
            onClick={() => setFilter('failed')}
            count={counts.failed}
            color="red"
          >
            Failed
          </FilterButton>
        </div>
      </div>

      {/* Email List */}
      <div className="divide-y divide-gray-200">
        {emails.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No emails in {filter === 'all' ? 'queue' : filter + ' status'}
          </div>
        ) : (
          emails.map(email => (
            <EmailRow key={email.id} email={email} />
          ))
        )}
      </div>
    </div>
  )
}

function StatCard({ title, value, icon, color }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    green: 'bg-green-50 border-green-200 text-green-600',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-600',
    red: 'bg-red-50 border-red-200 text-red-600'
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
    blue: active ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 border-blue-600',
    green: active ? 'bg-green-600 text-white' : 'bg-white text-green-600 border-green-600',
    yellow: active ? 'bg-yellow-600 text-white' : 'bg-white text-yellow-600 border-yellow-600',
    red: active ? 'bg-red-600 text-white' : 'bg-white text-red-600 border-red-600'
  }

  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg border-2 font-medium transition-colors ${colors[color]}`}
    >
      {children} ({count})
    </button>
  )
}

function EmailRow({ email }) {
  const [expanded, setExpanded] = useState(false)

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    sent: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800'
  }

  return (
    <div className="p-4 hover:bg-gray-50">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h4 className="font-medium text-gray-900">{email.subject}</h4>
            <span className={`px-2 py-1 text-xs font-medium rounded ${statusColors[email.status]}`}>
              {email.status}
            </span>
          </div>
          
          <p className="text-sm text-gray-600">
            📧 To: <span className="font-medium">{email.recipient_email}</span>
          </p>
          
          <p className="text-xs text-gray-500 mt-1">
            Created: {new Date(email.created_at).toLocaleString()}
            {email.sent_at && ` • Sent: ${new Date(email.sent_at).toLocaleString()}`}
          </p>

          {email.error_message && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
              <strong>Error:</strong> {email.error_message.substring(0, 200)}
              {email.error_message.length > 200 && '...'}
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-4 px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
        >
          {expanded ? 'Hide' : 'View'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="bg-gray-50 rounded p-4 max-h-96 overflow-y-auto">
            <h5 className="font-medium text-gray-900 mb-2">Email Content:</h5>
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: email.body_html || email.body_text }}
            />
          </div>
        </div>
      )}
    </div>
  )
}