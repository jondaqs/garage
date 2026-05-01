'use client'
import { CheckoutPageInner } from '@/components/CheckoutPage'
export default function CompanyCheckoutPage() {
  return (
    <CheckoutPageInner
      backPath="/company/work-orders/[id]"
      canAcceptDecline={true}
    />
  )
}