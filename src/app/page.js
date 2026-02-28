'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Car, Wrench, Building2, User, Calendar, History, Bell, LogIn } from 'lucide-react'

export default function LandingPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-md border-b border-white/20">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Car className="text-white mr-2" size={32} />
            <h1 className="text-2xl font-bold text-white">GariCare</h1>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
          Your Vehicle,<br />Our Priority
        </h2>
        <p className="text-xl text-blue-100 mb-12 max-w-2xl mx-auto">
          Connect with trusted service providers, manage your fleet, and keep your vehicles running smoothly.
        </p>

        {/* User Type Selection */}
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-8 hover:shadow-2xl transition transform hover:-translate-y-2">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="text-blue-600" size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Vehicle Owner</h3>
            <p className="text-gray-600 mb-6">Book services, track maintenance, and manage your vehicles</p>
            
            <div className="space-y-2">
              <button
                onClick={() => router.push('/auth/signup?type=normal')}
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Sign Up
              </button>
              <button
                onClick={() => router.push('/auth/login?type=normal')}
                className="w-full bg-white border-2 border-blue-600 text-blue-600 px-6 py-3 rounded-lg hover:bg-blue-50 transition font-medium flex items-center justify-center"
              >
                <LogIn size={18} className="mr-2" />
                Sign In
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 hover:shadow-2xl transition transform hover:-translate-y-2">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Wrench className="text-green-600" size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Service Provider</h3>
            <p className="text-gray-600 mb-6">Register your garage and connect with customers</p>
            
            <div className="space-y-2">
              <button
                onClick={() => router.push('/auth/provider-signup')}
                className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-medium"
              >
                Register Business
              </button>
              <button
                onClick={() => router.push('/auth/login?type=provider')}
                className="w-full bg-white border-2 border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-50 transition font-medium flex items-center justify-center"
              >
                <LogIn size={18} className="mr-2" />
                Sign In
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 hover:shadow-2xl transition transform hover:-translate-y-2">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 className="text-purple-600" size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Company Fleet</h3>
            <p className="text-gray-600 mb-6">Manage your company vehicles and maintenance</p>
            
            <div className="space-y-2">
              <button
                onClick={() => router.push('/auth/signup?type=company')}
                className="w-full bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition font-medium"
              >
                Sign Up
              </button>
              <button
                onClick={() => router.push('/auth/login?type=company')}
                className="w-full bg-white border-2 border-purple-600 text-purple-600 px-6 py-3 rounded-lg hover:bg-purple-50 transition font-medium flex items-center justify-center"
              >
                <LogIn size={18} className="mr-2" />
                Sign In
              </button>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="max-w-3xl mx-auto bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20">
          <div className="grid md:grid-cols-3 gap-6 text-white">
            <div>
              <Calendar className="mx-auto mb-3" size={32} />
              <h4 className="font-semibold mb-2">Easy Booking</h4>
              <p className="text-sm text-blue-100">Schedule services with verified providers</p>
            </div>
            <div>
              <History className="mx-auto mb-3" size={32} />
              <h4 className="font-semibold mb-2">Service History</h4>
              <p className="text-sm text-blue-100">Track all your vehicle maintenance</p>
            </div>
            <div>
              <Bell className="mx-auto mb-3" size={32} />
              <h4 className="font-semibold mb-2">Smart Reminders</h4>
              <p className="text-sm text-blue-100">Never miss scheduled maintenance</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}