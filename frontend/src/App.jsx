import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Layout from './components/Layout'
import Home from './pages/Home'
import CommandCentre from './pages/CommandCentre'
import AIOrchestrator from './pages/AIOrchestrator'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Analytics from './pages/Analytics'
import Report from './pages/Report'
import api from './api'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!localStorage.getItem('token')
  )

  // Validate the cached token against the backend on every app load. If the
  // backend was reset (DB wiped before the demo) or the user was deleted, the
  // stale token in localStorage would otherwise keep showing the home page.
  // Failing this check sends the user back to the login screen.
  useEffect(() => {
    if (!localStorage.getItem('token')) return
    api.me().catch(() => {
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      setIsAuthenticated(false)
    })
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    setIsAuthenticated(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated
              ? <Navigate to="/home" replace />
              : <Login setIsAuthenticated={setIsAuthenticated} />
          }
        />
        <Route
          path="/register"
          element={
            isAuthenticated
              ? <Navigate to="/home" replace />
              : <Register setIsAuthenticated={setIsAuthenticated} />
          }
        />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Layout setIsAuthenticated={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="home" element={<Home />} />
          <Route path="ai-orchestrator" element={<AIOrchestrator />} />
          <Route path="network-monitor" element={<CommandCentre />} />
          <Route path="command-centre" element={<Navigate to="/network-monitor" replace />} />
          <Route path="attack-simulator" element={<Navigate to="/analytics" replace />} />
          <Route path="defense-analyser" element={<Navigate to="/analytics" replace />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="report" element={<Report />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  )
}

export default App
