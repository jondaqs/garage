'use client'

import React, { useState } from 'react'

export default function BankingInfoStep({ data, updateData, nextStep, previousStep }) {
  const [bankingInfo, setBankingInfo] = useState(data.banking || {
    bankName: '',
    accountNumber: '',
    accountName: '',
    mobileMoneyNumber: ''
  })

  const handleContinue = () => {
    updateData({ banking: bankingInfo })
    nextStep()
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Banking Information
        </h2>
        <p className="text-gray-600">
          Add payment details for receiving payments (optional)
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Bank Name</label>
          <input
            type="text"
            value={bankingInfo.bankName}
            onChange={(e) => setBankingInfo({...bankingInfo, bankName: e.target.value})}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            placeholder="e.g., Equity Bank"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Account Number</label>
          <input
            type="text"
            value={bankingInfo.accountNumber}
            onChange={(e) => setBankingInfo({...bankingInfo, accountNumber: e.target.value})}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            placeholder="1234567890"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Account Name</label>
          <input
            type="text"
            value={bankingInfo.accountName}
            onChange={(e) => setBankingInfo({...bankingInfo, accountName: e.target.value})}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            placeholder="Business Account Name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">M-Pesa Number (Optional)</label>
          <input
            type="tel"
            value={bankingInfo.mobileMoneyNumber}
            onChange={(e) => setBankingInfo({...bankingInfo, mobileMoneyNumber: e.target.value})}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            placeholder="+254 712 345 678"
          />
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={previousStep}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
