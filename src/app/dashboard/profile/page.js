'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Camera, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    gender: '',
    dateOfBirth: '',
    profilePicture: null
  })

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      
      if (user?.user_metadata) {
        setProfileForm({
          firstName: user.user_metadata.first_name || '',
          lastName: user.user_metadata.last_name || '',
          phone: user.user_metadata.phone || '',
          gender: user.user_metadata.gender || '',
          dateOfBirth: user.user_metadata.date_of_birth || '',
          profilePicture: null
        })
      }
    }

    getUser()
  }, [supabase])

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.updateUser({
      data: {
        first_name: profileForm.firstName,
        last_name: profileForm.lastName,
        phone: profileForm.phone,
        gender: profileForm.gender,
        date_of_birth: profileForm.dateOfBirth
      }
    })

    if (error) {
      alert('Error updating profile: ' + error.message)
    } else {
      alert('Profile updated successfully!')
    }

    setLoading(false)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button 
        onClick={() => router.back()} 
        className="mb-6 text-blue-600 hover:text-blue-700 font-medium flex items-center"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back
      </button>

      <h2 className="text-3xl font-bold text-gray-800 mb-8">Profile Settings</h2>

      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <form onSubmit={handleUpdateProfile}>
          <div className="flex flex-col items-center mb-8">
            <div className="w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center mb-4 overflow-hidden">
              {profileForm.profilePicture ? (
                <img src={URL.createObjectURL(profileForm.profilePicture)} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <Camera size={48} className="text-gray-400" />
              )}
            </div>
            <label className="cursor-pointer bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition">
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={(e) => setProfileForm({...profileForm, profilePicture: e.target.files[0]})} 
              />
              {profileForm.profilePicture ? 'Change Photo' : 'Upload Photo'}
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
              <input 
                type="text" 
                value={profileForm.firstName} 
                onChange={(e) => setProfileForm({...profileForm, firstName: e.target.value})} 
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                placeholder="John" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
              <input 
                type="text" 
                value={profileForm.lastName} 
                onChange={(e) => setProfileForm({...profileForm, lastName: e.target.value})} 
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                placeholder="Doe" 
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input 
              type="email" 
              value={user?.email || ''} 
              disabled 
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50" 
            />
            <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
            <input 
              type="tel" 
              value={profileForm.phone} 
              onChange={(e) => setProfileForm({...profileForm, phone: e.target.value})} 
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
              placeholder="+254 712 345 678" 
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
              <select 
                value={profileForm.gender} 
                onChange={(e) => setProfileForm({...profileForm, gender: e.target.value})} 
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
              <input 
                type="date" 
                value={profileForm.dateOfBirth} 
                onChange={(e) => setProfileForm({...profileForm, dateOfBirth: e.target.value})} 
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  )
}