import React, { useState } from 'react'
import { FaSave, FaBell, FaShieldAlt, FaPalette, FaDatabase } from 'react-icons/fa'

const Settings = () => {
  const [settings, setSettings] = useState({
    notifications: {
      email: true,
      push: false,
      sms: true,
    },
    security: {
      twoFactor: false,
      sessionTimeout: '30',
    },
    appearance: {
      theme: 'light',
      language: 'en',
    },
    general: {
      autoSave: true,
      backup: true,
    }
  })

  const handleToggle = (category, key) => {
    setSettings({
      ...settings,
      [category]: {
        ...settings[category],
        [key]: !settings[category][key]
      }
    })
  }

  const handleChange = (category, key, value) => {
    setSettings({
      ...settings,
      [category]: {
        ...settings[category],
        [key]: value
      }
    })
  }

  const handleSave = () => {
    // Save settings logic here
    alert('Settings saved successfully!')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-green-100 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>Settings</h1>
          <p className="text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>Manage your application settings</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center space-x-2 bg-transparent border-2 border-green-900/50 text-green-100 px-6 py-3 hover:bg-green-900/30 transition-colors shadow-xl"
          style={{ fontFamily: 'Gugi, sans-serif' }}
        >
          <FaSave />
          <span>Save Changes</span>
        </button>
      </div>

      {/* Notifications */}
      <div className="bg-gray-800/20 backdrop-blur-sm border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center space-x-3 mb-6">
          <FaBell className="text-green-300 text-xl" />
          <h2 className="text-xl font-bold text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>Notifications</h2>
        </div>
        <div className="space-y-4">
          {Object.entries(settings.notifications).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between py-3 border-b border-green-900/30 last:border-0">
              <div>
                <h3 className="font-medium text-green-100 capitalize" style={{ fontFamily: 'Gugi, sans-serif' }}>{key} Notifications</h3>
                <p className="text-sm text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>Receive {key} notifications</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={() => handleToggle('notifications', key)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-900/50 peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Security */}
      <div className="bg-gray-800/20 backdrop-blur-sm border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center space-x-3 mb-6">
          <FaShieldAlt className="text-green-300 text-xl" />
          <h2 className="text-xl font-bold text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>Security</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-green-900/30">
            <div>
              <h3 className="font-medium text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>Two-Factor Authentication</h3>
              <p className="text-sm text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>Add an extra layer of security</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.security.twoFactor}
                onChange={() => handleToggle('security', 'twoFactor')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-900/50 peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
            </label>
          </div>
          <div className="py-3">
            <label className="block text-sm font-medium text-green-200 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>
              Session Timeout (minutes)
            </label>
            <input
              type="number"
              value={settings.security.sessionTimeout}
              onChange={(e) => handleChange('security', 'sessionTimeout', e.target.value)}
              className="w-full px-4 py-2 bg-gray-900/50 border-2 border-green-900/50 text-green-100 placeholder-green-300/40 focus:outline-none focus:border-green-800 transition-all"
              style={{ fontFamily: 'Gugi, sans-serif' }}
            />
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-gray-800/20 backdrop-blur-sm border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center space-x-3 mb-6">
          <FaPalette className="text-green-300 text-xl" />
          <h2 className="text-xl font-bold text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>Appearance</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-green-200 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>Theme</label>
            <select
              value={settings.appearance.theme}
              onChange={(e) => handleChange('appearance', 'theme', e.target.value)}
              className="w-full px-4 py-2 bg-gray-900/50 border-2 border-green-900/50 text-green-100 focus:outline-none focus:border-green-800 transition-all"
              style={{ fontFamily: 'Gugi, sans-serif' }}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-green-200 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>Language</label>
            <select
              value={settings.appearance.language}
              onChange={(e) => handleChange('appearance', 'language', e.target.value)}
              className="w-full px-4 py-2 bg-gray-900/50 border-2 border-green-900/50 text-green-100 focus:outline-none focus:border-green-800 transition-all"
              style={{ fontFamily: 'Gugi, sans-serif' }}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
            </select>
          </div>
        </div>
      </div>

      {/* General */}
      <div className="bg-gray-800/20 backdrop-blur-sm border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center space-x-3 mb-6">
          <FaDatabase className="text-green-300 text-xl" />
          <h2 className="text-xl font-bold text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>General</h2>
        </div>
        <div className="space-y-4">
          {Object.entries(settings.general).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between py-3 border-b border-green-900/30 last:border-0">
              <div>
                <h3 className="font-medium text-green-100 capitalize" style={{ fontFamily: 'Gugi, sans-serif' }}>{key.replace(/([A-Z])/g, ' $1').trim()}</h3>
                <p className="text-sm text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>Enable {key.replace(/([A-Z])/g, ' $1').toLowerCase()}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={() => handleToggle('general', key)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-900/50 peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Settings

