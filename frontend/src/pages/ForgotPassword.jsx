import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { FaArrowRight, FaArrowLeft, FaCheckCircle, FaEnvelope } from 'react-icons/fa'

const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (email) {
      setSubmitted(true)
    }
  }

  if (submitted) {
    return (
      <div className="relative w-full min-h-screen flex items-center justify-end overflow-hidden">
        <video 
          className="absolute top-1/2 left-1/2 min-w-full min-h-full w-auto h-auto -translate-x-1/2 -translate-y-1/2 z-0 object-cover"
          autoPlay 
          loop 
          muted 
          playsInline
        >
          <source src="/142363-780562112_medium.mp4" type="video/mp4" />
        </video>
        
        <div className="relative z-20 w-full max-w-md px-4 sm:px-8 pr-4 sm:pr-16 lg:pr-24 text-center">
          <div className="bg-black/30 backdrop-blur-md border-2 border-gray-600/50 p-6 sm:p-8 shadow-2xl">
            <div className="mb-8">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-wider mb-6" style={{ fontFamily: 'Geo, sans-serif' }}>
                CyberDrill
              </h1>
              <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-gray-300 tracking-wider" style={{ fontFamily: 'Gugi, sans-serif' }}>
                EMAIL SENT
              </h2>
              <p className="text-gray-400 text-base sm:text-lg mb-6" style={{ fontFamily: 'Gugi, sans-serif' }}>CHECK YOUR INBOX</p>
            <div className="bg-black/40 backdrop-blur-md border-2 border-gray-600/50 p-6">
              <p className="text-gray-300 mb-4" style={{ fontFamily: 'Gugi, sans-serif' }}>
                Password reset instructions have been sent to:
              </p>
              <p className="text-gray-400 text-base sm:text-lg break-all" style={{ fontFamily: 'Gugi, sans-serif' }}>{email}</p>
            </div>
          </div>
          <Link 
            to="/login" 
            className="inline-flex items-center space-x-2 text-gray-400 hover:text-gray-300 transition-colors"
            style={{ fontFamily: 'Gugi, sans-serif' }}
          >
            <FaArrowLeft />
            <span>BACK TO LOGIN</span>
          </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full min-h-screen flex items-center justify-end overflow-hidden">
      <video 
        className="absolute top-1/2 left-1/2 min-w-full min-h-full w-auto h-auto -translate-x-1/2 -translate-y-1/2 z-0 object-cover"
        autoPlay 
        loop 
        muted 
        playsInline
      >
        <source src="/265432_small.mp4" type="video/mp4" />
      </video>
      
      <div className="relative z-20 w-full max-w-md px-4 sm:px-8 pr-4 sm:pr-16 lg:pr-24">
        <div className="bg-black/30 backdrop-blur-md border-2 border-gray-600/50 p-6 sm:p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-wider mb-6" style={{ fontFamily: 'Geo, sans-serif' }}>
              CyberDrill
            </h1>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-gray-300 tracking-wider" style={{ fontFamily: 'Gugi, sans-serif' }}>
              RESET PASSWORD
            </h2>
            <p className="text-gray-400 text-base sm:text-lg" style={{ fontFamily: 'Gugi, sans-serif' }}>RECOVER YOUR ACCOUNT</p>
          </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-black/30 backdrop-blur-sm border border-gray-600/30 p-4">
            <p className="text-gray-400 text-sm text-center" style={{ fontFamily: 'Gugi, sans-serif' }}>
              Enter your email address and we'll send you instructions to reset your password.
            </p>
          </div>
          
          <div className="relative group">
            <div className="relative flex items-center bg-black/40 backdrop-blur-md border-2 border-gray-600/50 p-3 sm:p-4 hover:border-gray-500 transition-all">
              <FaEnvelope className="text-gray-400 text-base sm:text-lg lg:text-xl mr-2 sm:mr-3 flex-shrink-0" />
              <input
                type="email"
                name="email"
                placeholder="EMAIL ADDRESS"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-gray-300 placeholder-gray-500/50 text-base sm:text-lg focus:outline-none"
                style={{ fontFamily: 'Gugi, sans-serif' }}
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full relative group overflow-hidden bg-transparent backdrop-blur-sm text-gray-200 font-bold text-base sm:text-lg py-4 transition-all hover:bg-gray-800/30 hover:shadow-[0_0_20px_rgba(0,0,0,0.5)] hover:scale-[1.02] active:scale-100 border-2 border-gray-600/50 hover:border-gray-500"
            style={{ fontFamily: 'Gugi, sans-serif' }}
          >
            <span className="relative z-10 flex items-center justify-center space-x-2 overflow-hidden">
              <span className="truncate">SEND RESET LINK</span>
              <FaArrowRight className="group-hover:translate-x-1 transition-transform flex-shrink-0" />
            </span>
          </button>

          <div className="text-center">
            <Link 
              to="/login" 
              className="text-gray-400 hover:text-gray-300 transition-colors flex items-center justify-center space-x-2 text-sm"
              style={{ fontFamily: 'Gugi, sans-serif' }}
            >
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

export default ForgotPassword

