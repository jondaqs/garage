'use client'

import { useState } from 'react'
import { X, Mail, MessageSquare, Bell, Loader2, Send, Zap } from 'lucide-react'

/**
 * AdminContactModal — send email, SMS, in-app notification, or all at once.
 */
export default function AdminContactModal({
  open, onClose,
  recipientName, recipientEmail, recipientPhone, recipientUserId,
}) {
  const [channel, setChannel] = useState('email')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState(null)

  if (!open) return null

  const hasEmail = !!recipientEmail
  const hasPhone = !!recipientPhone
  const hasUser  = !!recipientUserId
  const availableCount = [hasEmail, hasPhone, hasUser].filter(Boolean).length

  const channels = [
    { id: 'email',        label: 'Email',        icon: Mail,           available: hasEmail },
    { id: 'sms',          label: 'SMS',           icon: MessageSquare,  available: hasPhone },
    { id: 'notification', label: 'In-App',        icon: Bell,           available: hasUser },
    { id: 'all',          label: 'Send All',      icon: Zap,            available: availableCount >= 2 },
  ]

  const activeChannel = channels.find(c => c.id === channel)
  const needsSubject  = channel === 'email' || channel === 'all'
  const canSend       = message.trim() && (!needsSubject || subject.trim())

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          recipientEmail,
          recipientPhone,
          recipientUserId,
          recipientName,
          subject: subject.trim(),
          message: message.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok && res.status !== 207) throw new Error(data.error || 'Failed to send')

      // Build result summary
      if (channel === 'all' && data.results) {
        const lines = data.results.map(r =>
          `${r.channel === 'notification' ? 'In-App' : r.channel.toUpperCase()}: ${r.ok ? '✓ Sent' : '✗ ' + r.detail}`
        )
        setResult({ ok: data.success, text: lines.join('\n') })
      } else {
        setResult({ ok: true, text: data.message || 'Sent successfully' })
      }
      setSubject('')
      setMessage('')
    } catch (err) {
      setResult({ ok: false, text: err.message })
    } finally {
      setSending(false)
    }
  }

  const handleClose = () => {
    setResult(null)
    setSubject('')
    setMessage('')
    setChannel('email')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Contact {recipientName || 'User'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {[recipientEmail, recipientPhone].filter(Boolean).join(' · ') || 'No contact info'}
            </p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Channel tabs */}
        <div className="flex border-b border-gray-100">
          {channels.map(ch => (
            <button
              key={ch.id}
              onClick={() => ch.available && setChannel(ch.id)}
              disabled={!ch.available}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors
                ${channel === ch.id
                  ? ch.id === 'all'
                    ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/50'
                    : 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : ch.available
                    ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    : 'text-gray-300 cursor-not-allowed'
                }`}
            >
              <ch.icon size={15} />
              {ch.label}
              {!ch.available && ch.id !== 'all' && <span className="text-[10px] text-gray-300 ml-0.5">(N/A)</span>}
            </button>
          ))}
        </div>

        {/* "Send All" info banner */}
        {channel === 'all' && (
          <div className="mx-5 mt-3 p-2.5 bg-purple-50 border border-purple-100 rounded-lg text-xs text-purple-700">
            Will send via{' '}
            {[hasEmail && 'Email', hasPhone && 'SMS', hasUser && 'In-App'].filter(Boolean).join(' + ')}
          </div>
        )}

        {/* Form */}
        <div className="px-5 py-4 space-y-3">
          {needsSubject && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Email subject line"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {channel === 'sms' ? 'Message (160 chars recommended)' : 'Message'}
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={channel === 'sms' ? 3 : 5}
              maxLength={channel === 'sms' ? 480 : undefined}
              placeholder={
                channel === 'all' ? 'This message will be sent via all available channels...'
                : channel === 'email' ? 'Type your email message...'
                : channel === 'sms' ? 'Type your SMS message...'
                : 'Type your notification message...'
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            />
            {channel === 'sms' && (
              <p className="text-xs text-gray-400 mt-1 text-right">{message.length}/480</p>
            )}
          </div>

          {/* Result banner */}
          {result && (
            <div className={`p-3 rounded-lg text-sm whitespace-pre-line ${result.ok ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
              {result.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend || sending}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors
              ${channel === 'all'
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : channel === 'all' ? <Zap size={15} /> : <Send size={15} />}
            {sending
              ? 'Sending...'
              : channel === 'all'
                ? 'Send All'
                : `Send ${activeChannel?.label}`}
          </button>
        </div>
      </div>
    </div>
  )
}
