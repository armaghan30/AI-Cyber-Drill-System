import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Layout from './components/Layout'
import Home from './pages/Home'
import CommandCentre from './pages/CommandCentre'
import AttackSimulator from './pages/AttackSimulator'
import DefenseAnalyser from './pages/DefenseAnalyser'
import AIOrchestrator from './pages/AIOrchestrator'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Analytics from './pages/Analytics'
import TrainingResults from './pages/TrainingResults'
import Report from './pages/Report'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!localStorage.getItem('token')
  )

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
          <Route path="training-results" element={<TrainingResults />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  )
}

export default App
