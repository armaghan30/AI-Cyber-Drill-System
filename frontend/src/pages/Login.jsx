import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { FaEye, FaEyeSlash, FaArrowRight, FaUser, FaLock } from 'react-icons/fa'

const Login = ({ setIsAuthenticated }) => {
  const [formData, setFormData] = useState({ username: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError('')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.username || !formData.password) {
      setError('Please enter both username and password')
      return
    }

    // check if user exists in localStorage
    const users = JSON.parse(localStorage.getItem('users') || '[]')
    const user = users.find(u => u.username === formData.username)

    if (!user) {
      setError('User not found. Please register first.')
      return
    }
    if (user.password !== formData.password) {
      setError('Incorrect password')
      return
    }

    localStorage.setItem('token', 'local-token-' + Date.now())
    localStorage.setItem('username', user.username)
    setIsAuthenticated(true)
    navigate('/home')
  }

  return (
    <div className="relative w-full min-h-screen flex items-center justify-end overflow-hidden">
      <video
        className="absolute top-1/2 left-1/2 min-w-full min-h-full w-auto h-auto -translate-x-1/2 -translate-y-1/2 z-0 object-cover"
        autoPlay loop muted playsInline
      >
        <source src="/265432_small.mp4" type="video/mp4" />
      </video>

      <div className="relative z-20 w-full max-w-md px-4 sm:px-8 pr-4 sm:pr-16 lg:pr-24">
        <div className="bg-gray-800/40 backdrop-blur-md border-2 border-green-900/60 p-6 sm:p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-green-200 tracking-wider mb-6" style={{ fontFamily: 'Geo, sans-serif' }}>
              CyberDrill
            </h1>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-green-100 tracking-wider" style={{ fontFamily: 'Gugi, sans-serif' }}>
              CYBER LOGIN
            </h2>
            <p className="text-green-200/70 text-base sm:text-lg" style={{ fontFamily: 'Gugi, sans-serif' }}>SYSTEM ACCESS REQUIRED</p>
          </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-900/30 backdrop-blur-sm border-2 border-red-700 text-red-200 p-4 text-sm text-center" style={{ fontFamily: 'Gugi, sans-serif' }}>
              {error}
            </div>
          )}

          <div className="relative group">
            <div className="relative flex items-center bg-gray-900/50 backdrop-blur-md border-2 border-green-900/50 p-3 sm:p-4 hover:border-green-800 transition-all">
              <FaUser className="text-green-300/70 text-base sm:text-lg lg:text-xl mr-2 sm:mr-3 flex-shrink-0" />
              <input
                type="text"
                name="username"
                placeholder="USERNAME"
                value={formData.username}
                onChange={handleChange}
                className="flex-1 min-w-0 bg-transparent text-green-100 placeholder-green-300/40 text-base sm:text-lg focus:outline-none"
                style={{ fontFamily: 'Gugi, sans-serif' }}
                required
              />
            </div>
          </div>

          <div className="relative group">
            <div className="relative flex items-center bg-gray-900/50 backdrop-blur-md border-2 border-green-900/50 p-3 sm:p-4 hover:border-green-800 transition-all">
              <FaLock className="text-green-300/70 text-base sm:text-lg lg:text-xl mr-2 sm:mr-3 flex-shrink-0" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="PASSWORD"
                value={formData.password}
                onChange={handleChange}
                className="flex-1 min-w-0 bg-transparent text-green-100 placeholder-green-300/40 text-base sm:text-lg focus:outline-none"
                style={{ fontFamily: 'Gugi, sans-serif' }}
                required
              />
              <button type="button" className="text-green-300/70 hover:text-green-200 transition-colors ml-2 flex-shrink-0" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <FaEyeSlash className="text-base sm:text-lg lg:text-xl" /> : <FaEye className="text-base sm:text-lg lg:text-xl" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full relative group overflow-hidden bg-transparent backdrop-blur-sm text-green-100 font-bold text-base sm:text-lg py-4 transition-all hover:bg-green-900/30 hover:shadow-[0_0_20px_rgba(127,29,29,0.5)] hover:scale-[1.02] active:scale-100 border-2 border-green-900/50 hover:border-green-800 disabled:opacity-50"
            style={{ fontFamily: 'Gugi, sans-serif' }}
          >
            <span className="relative z-10 flex items-center justify-center space-x-2 overflow-hidden">
              <span className="truncate">{loading ? 'AUTHENTICATING...' : 'INITIATE LOGIN'}</span>
              {!loading && <FaArrowRight className="group-hover:translate-x-1 transition-transform flex-shrink-0" />}
            </span>
          </button>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm" style={{ fontFamily: 'Gugi, sans-serif' }}>
            <Link to="/forgot-password" className="text-green-300/70 hover:text-green-200 transition-colors">
              <span>FORGOT PASSWORD?</span>
            </Link>
            <Link to="/register" className="text-green-300/70 hover:text-green-200 transition-colors flex items-center space-x-2">
              <span>REGISTER</span>
              <FaArrowRight />
            </Link>
          </div>
        </form>
        </div>
      </div>
    </div>
  )
}

export default Login
