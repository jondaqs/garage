// src/app/admin/sms-queue/page.js
// Admin page to view SMS queue

import SmsQueueViewer from '@/components/admin/SmsQueueViewer'

export default function AdminSmsQueuePage() {
  return (
    <div className="p-8">
      <SmsQueueViewer />
    </div>
  )
}