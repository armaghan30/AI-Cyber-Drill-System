import React, { useState } from 'react'
import { FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaSave, FaCamera, FaEdit } from 'react-icons/fa'

const Profile = () => {
  const [isEditing, setIsEditing] = useState(false)
  const [profile, setProfile] = useState({
    name: 'Armaghan',
    email: 'Armaghan@example.com',
    phone: '+92 234 567 8900',
    location: 'Lahore, Pakistan',
    bio: 'Software engineer and robot enthusiast. Passionate about AI and automation.',
    avatar: 'A'
  })

  const handleChange = (e) => {
    setProfile({
      ...profile,
      [e.target.name]: e.target.value
    })
  }

  const handleSave = () => {
    setIsEditing(false)
    // Save profile logic here
    alert('Profile updated successfully!')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-green-100 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>Profile</h1>
        <p className="text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>Manage your personal information</p>
      </div>

      {/* Profile Header */}
      <div className="bg-gray-800/20 backdrop-blur-sm border-2 border-green-900/50 p-8 shadow-xl">
        <div className="flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6">
          <div className="relative">
            <div className="w-32 h-32 bg-green-900/50 border-2 border-green-800/50 text-green-100 rounded-full flex items-center justify-center text-4xl font-bold" style={{ fontFamily: 'Gugi, sans-serif' }}>
              {profile.avatar}
            </div>
            {isEditing && (
              <button className="absolute bottom-0 right-0 w-10 h-10 bg-green-900/50 border-2 border-green-800/50 text-green-100 rounded-full flex items-center justify-center hover:bg-green-800/50 transition-colors shadow-lg">
                <FaCamera />
              </button>
            )}
          </div>
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-2xl font-bold text-green-100 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>{profile.name}</h2>
            <p className="text-green-200/70 mb-4" style={{ fontFamily: 'Gugi, sans-serif' }}>{profile.bio}</p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-green-200/70">
              <div className="flex items-center space-x-2">
                <FaEnvelope />
                <span style={{ fontFamily: 'Gugi, sans-serif' }}>{profile.email}</span>
              </div>
              <div className="flex items-center space-x-2">
                <FaPhone />
                <span style={{ fontFamily: 'Gugi, sans-serif' }}>{profile.phone}</span>
              </div>
              <div className="flex items-center space-x-2">
                <FaMapMarkerAlt />
                <span style={{ fontFamily: 'Gugi, sans-serif' }}>{profile.location}</span>
              </div>
            </div>
          </div>
          <div>
            {isEditing ? (
              <button
                onClick={handleSave}
                className="flex items-center space-x-2 bg-transparent border-2 border-green-900/50 text-green-100 px-6 py-3 hover:bg-green-900/30 transition-colors shadow-xl"
                style={{ fontFamily: 'Gugi, sans-serif' }}
              >
                <FaSave />
                <span>Save</span>
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center space-x-2 bg-transparent border-2 border-green-900/50 text-green-100 px-6 py-3 hover:bg-green-900/30 transition-colors"
                style={{ fontFamily: 'Gugi, sans-serif' }}
              >
                <FaEdit />
                <span>Edit</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Profile Details */}
      <div className="bg-gray-800/20 backdrop-blur-sm border-2 border-green-900/50 p-6 shadow-xl">
        <h2 className="text-xl font-bold text-green-100 mb-6" style={{ fontFamily: 'Gugi, sans-serif' }}>Personal Information</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-green-200 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>
              <FaUser className="inline mr-2" />
              Full Name
            </label>
            <input
              type="text"
              name="name"
              value={profile.name}
              onChange={handleChange}
              disabled={!isEditing}
              className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:border-green-800 transition-all ${
                !isEditing ? 'bg-gray-900/20 border-green-900/30 text-green-200/50' : 'bg-gray-900/50 border-green-900/50 text-green-100'
              }`}
              style={{ fontFamily: 'Gugi, sans-serif' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-green-200 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>
              <FaEnvelope className="inline mr-2" />
              Email
            </label>
            <input
              type="email"
              name="email"
              value={profile.email}
              onChange={handleChange}
              disabled={!isEditing}
              className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:border-green-800 transition-all ${
                !isEditing ? 'bg-gray-900/20 border-green-900/30 text-green-200/50' : 'bg-gray-900/50 border-green-900/50 text-green-100'
              }`}
              style={{ fontFamily: 'Gugi, sans-serif' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-green-200 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>
              <FaPhone className="inline mr-2" />
              Phone
            </label>
            <input
              type="tel"
              name="phone"
              value={profile.phone}
              onChange={handleChange}
              disabled={!isEditing}
              className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:border-green-800 transition-all ${
                !isEditing ? 'bg-gray-900/20 border-green-900/30 text-green-200/50' : 'bg-gray-900/50 border-green-900/50 text-green-100'
              }`}
              style={{ fontFamily: 'Gugi, sans-serif' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-green-200 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>
              <FaMapMarkerAlt className="inline mr-2" />
              Location
            </label>
            <input
              type="text"
              name="location"
              value={profile.location}
              onChange={handleChange}
              disabled={!isEditing}
              className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:border-green-800 transition-all ${
                !isEditing ? 'bg-gray-900/20 border-green-900/30 text-green-200/50' : 'bg-gray-900/50 border-green-900/50 text-green-100'
              }`}
              style={{ fontFamily: 'Gugi, sans-serif' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-green-200 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>
              Bio
            </label>
            <textarea
              name="bio"
              value={profile.bio}
              onChange={handleChange}
              disabled={!isEditing}
              rows={4}
              className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:border-green-800 transition-all ${
                !isEditing ? 'bg-gray-900/20 border-green-900/30 text-green-200/50' : 'bg-gray-900/50 border-green-900/50 text-green-100'
              }`}
              style={{ fontFamily: 'Gugi, sans-serif' }}
            />
          </div>
        </div>
      </div>

      {/* Account Settings */}
      <div className="bg-gray-800/20 backdrop-blur-sm border-2 border-green-900/50 p-6 shadow-xl">
        <h2 className="text-xl font-bold text-green-100 mb-6" style={{ fontFamily: 'Gugi, sans-serif' }}>Account Settings</h2>
        <div className="space-y-4">
          <button className="w-full text-left px-4 py-3 border-2 border-green-900/50 bg-gray-900/20 hover:bg-gray-900/50 hover:border-green-800 transition-all">
            <span className="font-medium text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>Change Password</span>
            <p className="text-sm text-green-200/70 mt-1" style={{ fontFamily: 'Gugi, sans-serif' }}>Update your password to keep your account secure</p>
          </button>
          <button className="w-full text-left px-4 py-3 border-2 border-green-900/50 bg-gray-900/20 hover:bg-gray-900/50 hover:border-green-800 transition-all">
            <span className="font-medium text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>Privacy Settings</span>
            <p className="text-sm text-green-200/70 mt-1" style={{ fontFamily: 'Gugi, sans-serif' }}>Manage your privacy and data preferences</p>
          </button>
          <button className="w-full text-left px-4 py-3 border-2 border-green-600/50 bg-green-900/20 hover:bg-green-900/30 hover:border-green-500 transition-all">
            <span className="font-medium text-green-300" style={{ fontFamily: 'Gugi, sans-serif' }}>Delete Account</span>
            <p className="text-sm text-green-200/70 mt-1" style={{ fontFamily: 'Gugi, sans-serif' }}>Permanently delete your account and all data</p>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Profile

