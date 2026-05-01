'use client'
import { CheckoutPageInner } from '@/components/CheckoutPage'
export default function CompanyMemberCheckoutPage() {
  return (
    <CheckoutPageInner
      backPath="/dashboard/company/[companyId]/work-orders/[id]"
      canAcceptDecline={true}
    />
  )
}