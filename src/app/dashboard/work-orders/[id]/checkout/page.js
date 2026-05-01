'use client'
import { CheckoutPageInner } from '@/components/CheckoutPage'
export default function UserCheckoutPage() {
  return (
    <CheckoutPageInner
      backPath="/dashboard/work-orders/[id]"
      canAcceptDecline={true}
    />
  )
}