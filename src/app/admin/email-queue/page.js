// src/app/admin/email-queue/page.js
// Admin page to view email queue

import EmailQueueViewer from '@/components/admin/EmailQueueViewer'

export default function AdminEmailQueuePage() {
  return (
    <div className="p-8">
      <EmailQueueViewer />
    </div>
  )
}