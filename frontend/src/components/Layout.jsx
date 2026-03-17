import React, { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  FaSignOutAlt,
  FaChartLine,
  FaCog,
  FaBars,
  FaTimes,
  FaChartBar,
  FaChevronLeft,
  FaChevronRight,
  FaNetworkWired,
  FaShieldAlt,
  FaBrain,
  FaDatabase,
  FaHome
} from 'react-icons/fa'

const Layout = ({ setIsAuthenticated }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const handleLogout = () => {
    setIsAuthenticated(false)
    navigate('/login')
  }

  const navItems = [
    { path: '/home', icon: FaHome, label: 'Home' },
    { path: '/ai-orchestrator', icon: FaBrain, label: 'AI Orchestrator' },
    { path: '/network-monitor', icon: FaNetworkWired, label: 'Network Monitor' },
    { path: '/analytics', icon: FaChartBar, label: 'Analytics' },
    { path: '/report', icon: FaShieldAlt, label: 'Security Report' },
    { path: '/training-results', icon: FaDatabase, label: 'Training Results' },
    { path: '/settings', icon: FaCog, label: 'Settings' },
  ]

  const isActive = (path) => location.pathname === path

  return (
    <div className="relative flex h-screen bg-gray-900 overflow-hidden">
      {/* Video Background — reduced opacity */}
      <video
        className="fixed top-1/2 left-1/2 min-w-full min-h-full w-auto h-auto -translate-x-1/2 -translate-y-1/2 z-0 object-cover opacity-15"
        autoPlay
        loop
        muted
        playsInline
      >
        <source src="/265432_small.mp4" type="video/mp4" />
      </video>

      {/* Stronger dark overlay so text is easier to read */}
      <div className="fixed inset-0 bg-black/60 z-0"></div>

      {/* Sidebar — fixed, non-scrolling */}
      <aside className={`
        fixed inset-y-0 left-0 z-50
        ${sidebarCollapsed ? 'w-20' : 'w-64'}
        bg-gray-900/85 backdrop-blur-sm border-r-2 border-green-900/30 shadow-xl
        transform transition-all duration-300 ease-in-out overflow-y-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between p-6 border-b border-green-900/30">
          {!sidebarCollapsed && (
            <button onClick={() => navigate('/home')} className="text-2xl font-bold text-green-200 hover:text-green-100 transition-colors" style={{ fontFamily: 'Geo, sans-serif' }}>
              CyberDrill
            </button>
          )}
          <div className="flex items-center gap-2">
            <button
              className="hidden lg:flex text-green-300/70 hover:text-green-200 hover:bg-green-900/30 p-2 transition-all"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <FaChevronRight /> : <FaChevronLeft />}
            </button>
            <button
              className="lg:hidden text-green-300/70 hover:text-green-200"
              onClick={() => setSidebarOpen(false)}
            >
              <FaTimes />
            </button>
          </div>
        </div>

        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path)
                  setSidebarOpen(false)
                }}
                className={`
                  w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3
                  transition-all duration-200 group relative
                  ${isActive(item.path)
                    ? 'bg-green-900/40 text-green-100 border-l-4 border-green-600'
                    : 'text-green-300/70 hover:bg-green-900/20 hover:text-green-200'
                  }
                `}
                style={{ fontFamily: 'Gugi, sans-serif' }}
                title={sidebarCollapsed ? item.label : ''}
              >
                <Icon className="text-lg flex-shrink-0" />
                {!sidebarCollapsed && <span className="font-medium">{item.label}</span>}
                {sidebarCollapsed && (
                  <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900/95 text-green-100 text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-green-900/50">
                    {item.label}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Main Content — offset by sidebar, independently scrollable */}
      <div className={`relative flex-1 flex flex-col transition-all duration-300 z-10 h-screen ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        {/* Top Bar — fixed within content area */}
        <header className="sticky top-0 z-40 flex-shrink-0">
          <div className="flex items-center justify-end px-6 py-4">
            <button
              className="lg:hidden absolute left-4 text-green-300/70 hover:text-green-200 bg-gray-900/80 p-2 rounded border border-green-900/30"
              onClick={() => setSidebarOpen(true)}
            >
              <FaBars className="text-xl" />
            </button>

            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/profile')}
                className="w-10 h-10 bg-green-900/50 text-green-100 border-2 border-green-800/50 rounded-full flex items-center justify-center font-semibold hover:bg-green-800/50 hover:border-green-700 transition-colors"
                style={{ fontFamily: 'Gugi, sans-serif' }}
              >
                U
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-green-900/50 border-2 border-green-800/50 text-green-100 hover:bg-green-800/50 hover:border-green-700 transition-colors"
                style={{ fontFamily: 'Gugi, sans-serif' }}
              >
                <FaSignOutAlt />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content — scrollable */}
        <main className="flex-1 p-6 relative z-10 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}

export default Layout
