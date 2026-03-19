import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { FaEye, FaEyeSlash, FaArrowRight, FaArrowLeft, FaCheck, FaUser, FaEnvelope, FaLock } from 'react-icons/fa'

const Register = ({ setIsAuthenticated }) => {
  const [formData, setFormData] = useState({ username: '', email: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError('')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword) {
      setError('Please fill in all fields')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    // save user to localStorage
    const users = JSON.parse(localStorage.getItem('users') || '[]')
    if (users.find(u => u.username === formData.username)) {
      setError('Username already taken')
      return
    }
    if (users.find(u => u.email === formData.email)) {
      setError('Email already registered')
      return
    }

    users.push({ username: formData.username, email: formData.email, password: formData.password })
    localStorage.setItem('users', JSON.stringify(users))
    localStorage.setItem('token', 'local-token-' + Date.now())
    localStorage.setItem('username', formData.username)
    setIsAuthenticated(true)
    navigate('/home')
  }

  const passwordRequirements = [
    { text: 'At least 6 characters', met: formData.password.length >= 6 },
    { text: 'Contains uppercase', met: /[A-Z]/.test(formData.password) },
    { text: 'Contains number', met: /[0-9]/.test(formData.password) },
  ]

  return (
    <div className="relative w-full min-h-screen flex items-center justify-end overflow-hidden">
      <video className="absolute top-1/2 left-1/2 min-w-full min-h-full w-auto h-auto -translate-x-1/2 -translate-y-1/2 z-0 object-cover" autoPlay loop muted playsInline>
        <source src="/265432_small.mp4" type="video/mp4" />
      </video>

      <div className="relative z-20 w-full max-w-md px-4 sm:px-8 pr-4 sm:pr-16 lg:pr-24 py-8">
        <div className="bg-black/30 backdrop-blur-md border-2 border-gray-600/50 p-6 sm:p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-wider mb-6" style={{ fontFamily: 'Geo, sans-serif' }}>CyberDrill</h1>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-gray-300 tracking-wider" style={{ fontFamily: 'Gugi, sans-serif' }}>REGISTRATION</h2>
            <p className="text-gray-400 text-base sm:text-lg" style={{ fontFamily: 'Gugi, sans-serif' }}>CREATE NEW ACCOUNT</p>
          </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-500/20 backdrop-blur-sm border-2 border-red-500 text-red-300 p-4 text-sm text-center" style={{ fontFamily: 'Gugi, sans-serif' }}>{error}</div>
          )}

          <div className="relative flex items-center bg-black/40 backdrop-blur-md border-2 border-gray-600/50 p-3 sm:p-4 hover:border-gray-500 transition-all">
            <FaUser className="text-gray-400 text-base sm:text-lg lg:text-xl mr-2 sm:mr-3 flex-shrink-0" />
            <input type="text" name="username" placeholder="USERNAME" value={formData.username} onChange={handleChange}
              className="flex-1 min-w-0 bg-transparent text-gray-300 placeholder-gray-500/50 text-base sm:text-lg focus:outline-none" style={{ fontFamily: 'Gugi, sans-serif' }} required />
          </div>

          <div className="relative flex items-center bg-black/40 backdrop-blur-md border-2 border-gray-600/50 p-3 sm:p-4 hover:border-gray-500 transition-all">
            <FaEnvelope className="text-gray-400 text-base sm:text-lg lg:text-xl mr-2 sm:mr-3 flex-shrink-0" />
            <input type="email" name="email" placeholder="EMAIL" value={formData.email} onChange={handleChange}
              className="flex-1 min-w-0 bg-transparent text-gray-300 placeholder-gray-500/50 text-base sm:text-lg focus:outline-none" style={{ fontFamily: 'Gugi, sans-serif' }} required />
          </div>

          <div className="relative flex items-center bg-black/40 backdrop-blur-md border-2 border-gray-600/50 p-3 sm:p-4 hover:border-gray-500 transition-all">
            <FaLock className="text-gray-400 text-base sm:text-lg lg:text-xl mr-2 sm:mr-3 flex-shrink-0" />
            <input type={showPassword ? 'text' : 'password'} name="password" placeholder="PASSWORD" value={formData.password} onChange={handleChange}
              className="flex-1 min-w-0 bg-transparent text-gray-300 placeholder-gray-500/50 text-base sm:text-lg focus:outline-none" style={{ fontFamily: 'Gugi, sans-serif' }} required />
            <button type="button" className="text-gray-400 hover:text-gray-300 transition-colors ml-2 flex-shrink-0" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <FaEyeSlash className="text-base sm:text-lg lg:text-xl" /> : <FaEye className="text-base sm:text-lg lg:text-xl" />}
            </button>
          </div>

          {formData.password && (
            <div className="bg-black/30 backdrop-blur-sm border border-gray-600/30 p-3 space-y-2">
              {passwordRequirements.map((req, index) => (
                <div key={index} className="flex items-center space-x-2 text-sm" style={{ fontFamily: 'Gugi, sans-serif' }}>
                  <FaCheck className={req.met ? 'text-green-400' : 'text-gray-500'} />
                  <span className={req.met ? 'text-green-300' : 'text-gray-400'}>{req.text}</span>
                </div>
              ))}
            </div>
          )}

          <div className="relative flex items-center bg-black/40 backdrop-blur-md border-2 border-gray-600/50 p-3 sm:p-4 hover:border-gray-500 transition-all">
            <FaLock className="text-gray-400 text-base sm:text-lg lg:text-xl mr-2 sm:mr-3 flex-shrink-0" />
            <input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" placeholder="CONFIRM PASSWORD" value={formData.confirmPassword} onChange={handleChange}
              className="flex-1 min-w-0 bg-transparent text-gray-300 placeholder-gray-500/50 text-base sm:text-lg focus:outline-none" style={{ fontFamily: 'Gugi, sans-serif' }} required />
            <button type="button" className="text-gray-400 hover:text-gray-300 transition-colors ml-2 flex-shrink-0" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
              {showConfirmPassword ? <FaEyeSlash className="text-base sm:text-lg lg:text-xl" /> : <FaEye className="text-base sm:text-lg lg:text-xl" />}
            </button>
          </div>

          <button type="submit" disabled={loading}
            className="w-full relative group overflow-hidden bg-transparent backdrop-blur-sm text-gray-200 font-bold text-base sm:text-lg py-4 transition-all hover:bg-gray-800/30 hover:scale-[1.02] active:scale-100 border-2 border-gray-600/50 hover:border-gray-500 disabled:opacity-50"
            style={{ fontFamily: 'Gugi, sans-serif' }}>
            <span className="relative z-10 flex items-center justify-center space-x-2 overflow-hidden">
              <span className="truncate">{loading ? 'CREATING ACCOUNT...' : 'COMPLETE REGISTRATION'}</span>
              {!loading && <FaArrowRight className="group-hover:translate-x-1 transition-transform flex-shrink-0" />}
            </span>
          </button>

          <div className="text-center">
            <Link to="/login" className="text-gray-400 hover:text-gray-300 transition-colors flex items-center justify-center space-x-2 text-sm" style={{ fontFamily: 'Gugi, sans-serif' }}>
              <FaArrowLeft />
              <span>BACK TO LOGIN</span>
            </Link>
          </div>
        </form>
        </div>
      </div>
    </div>
  )
}

export default Register
