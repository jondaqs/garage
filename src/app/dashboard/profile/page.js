'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Camera, ArrowLeft, Shield, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import TwoFactorSetup from '@/components/TwoFactorSetup'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState(null)
  const [profileId, setProfileId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)       // persisted URL from DB
  const [avatarPreview, setAvatarPreview] = useState(null) // local preview before save
  const [avatarFile, setAvatarFile] = useState(null)       // File object to upload
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    gender: '',
    dateOfBirth: '',
  })

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUser(user)

      // Load from user_metadata (auth)
      if (user.user_metadata) {
        setProfileForm({
          firstName: user.user_metadata.first_name || '',
          lastName: user.user_metadata.last_name || '',
          phone: user.user_metadata.phone || '',
          gender: user.user_metadata.gender || '',
          dateOfBirth: user.user_metadata.date_of_birth || '',
        })
      }

      // Load profile picture URL from user_profiles
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, profile_picture_url')
        .eq('auth_user_id', user.id)
        .single()

      if (profile) {
        setProfileId(profile.id)
        if (profile.profile_picture_url) {
          setAvatarUrl(profile.profile_picture_url)
        }
      }
    }
    load()
  }, [supabase])

  // Handle file selection — show preview immediately
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5 MB')
      return
    }

    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  // Upload avatar to Supabase Storage and save URL to user_profiles
  const uploadAvatar = async () => {
    if (!avatarFile || !user) return null

    const fileExt = avatarFile.name.split('.').pop()
    const filePath = `${user.id}/avatar-${Date.now()}.${fileExt}`

    // Delete old avatar if it exists in storage
    if (avatarUrl) {
      try {
        const oldPath = avatarUrl.split('/avatars/')[1]
        if (oldPath) {
          await supabase.storage.from('avatars').remove([oldPath])
        }
      } catch {} // ignore cleanup errors
    }

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(filePath, avatarFile, {
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadErr) throw new Error('Failed to upload photo: ' + uploadErr.message)

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    return publicUrl
  }

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // 1. Upload avatar if a new file was selected
      let newAvatarUrl = avatarUrl
      if (avatarFile) {
        setAvatarUploading(true)
        newAvatarUrl = await uploadAvatar()
        setAvatarUploading(false)
      }

      // 2. Update auth user metadata
      const { error: authErr } = await supabase.auth.updateUser({
        data: {
          first_name: profileForm.firstName,
          last_name: profileForm.lastName,
          phone: profileForm.phone,
          gender: profileForm.gender,
          date_of_birth: profileForm.dateOfBirth,
        }
      })
      if (authErr) throw authErr

      // 3. Update profile_picture_url in user_profiles
      if (profileId && newAvatarUrl !== avatarUrl) {
        const { error: profileErr } = await supabase
          .from('user_profiles')
          .update({ profile_picture_url: newAvatarUrl })
          .eq('id', profileId)
        if (profileErr) throw profileErr
      }

      // Clean up
      setAvatarUrl(newAvatarUrl)
      setAvatarFile(null)
      setAvatarPreview(null)
      alert('Profile updated successfully!')
    } catch (err) {
      alert('Error updating profile: ' + err.message)
    } finally {
      setLoading(false)
      setAvatarUploading(false)
    }
  }

  // Display: preview (if selecting new file) > saved URL > placeholder
  const displayImage = avatarPreview || avatarUrl

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
            <div className="w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center mb-4 overflow-hidden relative">
              {displayImage ? (
                <img src={displayImage} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <Camera size={48} className="text-gray-400" />
              )}
              {avatarUploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
                  <Loader2 size={24} className="text-white animate-spin" />
                </div>
              )}
            </div>
            <label className="cursor-pointer bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition">
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileSelect} 
              />
              {displayImage ? 'Change Photo' : 'Upload Photo'}
            </label>
            {avatarPreview && (
              <p className="text-xs text-gray-400 mt-2">New photo will be saved when you click Save Changes</p>
            )}
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
            {loading ? (avatarUploading ? 'Uploading photo...' : 'Saving...') : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* ── Two-Factor Authentication ── */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 mt-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Shield size={20} className="text-blue-600" />
          Account Security
        </h3>
        <TwoFactorSetup accentColor="blue" />
      </div>
    </div>
  )
}