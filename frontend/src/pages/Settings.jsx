import React, { useState, useEffect } from 'react'
import {
  FaUser, FaServer, FaDatabase, FaCheckCircle, FaTimesCircle, FaSync,
  FaShieldAlt, FaNetworkWired, FaBrain, FaChartLine, FaInfoCircle, FaCog,
  FaKey, FaEnvelope, FaCalendarAlt, FaSignOutAlt, FaCopy
} from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const font = { fontFamily: 'Gugi, sans-serif' }

const Settings = () => {
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  const [meErr, setMeErr] = useState(null)
  const [health, setHealth] = useState(null)
  const [healthErr, setHealthErr] = useState(null)
  const [stats, setStats] = useState({ scenarios: 0, simulations: 0, trainings: 0 })
  const [loading, setLoading] = useState(true)
  const [tokenCopied, setTokenCopied] = useState(false)

  const load = async () => {
    setLoading(true)
    setMeErr(null); setHealthErr(null)

    try { setMe(await api.me()) } catch (e) { setMeErr(e.message || 'Could not load account') }
    try { setHealth(await api.health()) } catch (e) { setHealthErr(e.message || 'Backend unreachable') }

    try {
      const [sc, sm, tr] = await Promise.all([
        api.listMyScenarios().catch(() => []),
        api.listMySimulations().catch(() => []),
        api.listMyTrainingRuns().catch(() => []),
      ])
      setStats({ scenarios: sc.length, simulations: sm.length, trainings: tr.length })
    } catch {}

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const logout = () => {
    if (!window.confirm('Sign out of CyberDrill?')) return
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    window.location.replace('/login')
  }

  const copyToken = () => {
    const t = localStorage.getItem('token') || ''
    if (!t) return
    navigator.clipboard.writeText(t).then(() => {
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
    })
  }

  const username = localStorage.getItem('username') || me?.username || '—'
  const tokenPreview = (() => {
    const t = localStorage.getItem('token') || ''
    if (!t) return 'No token stored'
    return t.length > 24 ? `${t.slice(0, 12)}…${t.slice(-8)}` : t
  })()

  const backendOk = health && !healthErr
  const apiBase = 'http://localhost:8000/api'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-green-100 mb-2" style={font}>Settings</h1>
          <p className="text-green-200/70" style={font}>Account, API connection, and system overview</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border-2 border-green-900/50 text-green-100 hover:bg-green-900/30 transition-all disabled:opacity-50"
          style={font}
        >
          <FaSync className={loading ? 'animate-spin' : ''} />
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* ═══ ACCOUNT ═══ */}
      <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-5">
          <FaUser className="text-green-300 text-xl" />
          <h2 className="text-xl font-bold text-green-100" style={font}>Account</h2>
        </div>

        {meErr && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-700/50 text-red-300 text-sm" style={font}>
            {meErr}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-900/30 border border-green-900/30 p-4">
            <div className="flex items-center gap-2 mb-1">
              <FaUser className="text-green-400/70 text-xs" />
              <p className="text-xs text-green-200/50" style={font}>Username</p>
            </div>
            <p className="text-green-100 text-lg font-bold" style={font}>{username}</p>
          </div>

          <div className="bg-gray-900/30 border border-green-900/30 p-4">
            <div className="flex items-center gap-2 mb-1">
              <FaEnvelope className="text-green-400/70 text-xs" />
              <p className="text-xs text-green-200/50" style={font}>Email</p>
            </div>
            <p className="text-green-100 text-lg" style={font}>{me?.email || '—'}</p>
          </div>

          <div className="bg-gray-900/30 border border-green-900/30 p-4">
            <div className="flex items-center gap-2 mb-1">
              <FaCalendarAlt className="text-green-400/70 text-xs" />
              <p className="text-xs text-green-200/50" style={font}>Account Created</p>
            </div>
            <p className="text-green-100 text-sm" style={font}>
              {me?.created_at ? new Date(me.created_at).toLocaleString() : '—'}
            </p>
          </div>

          <div className="bg-gray-900/30 border border-green-900/30 p-4">
            <div className="flex items-center gap-2 mb-1">
              <FaShieldAlt className="text-green-400/70 text-xs" />
              <p className="text-xs text-green-200/50" style={font}>User ID</p>
            </div>
            <p className="text-green-100 text-sm font-mono" style={font}>#{me?.id ?? '—'}</p>
          </div>
        </div>

        {/* token + logout row */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 bg-gray-900/30 border border-green-900/30 p-3 flex items-center gap-3">
            <FaKey className="text-yellow-400/70" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-green-200/50" style={font}>Auth Token</p>
              <p className="text-green-100 text-xs font-mono truncate" style={font}>{tokenPreview}</p>
            </div>
            <button
              onClick={copyToken}
              className="text-xs px-3 py-1 border border-green-700/50 text-green-200 hover:bg-green-900/30"
              style={font}
            >
              <FaCopy className="inline mr-1" />{tokenCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            onClick={logout}
            className="bg-red-900/20 border-2 border-red-700/50 text-red-300 hover:bg-red-900/40 p-3 transition-all flex items-center justify-center gap-2"
            style={font}
          >
            <FaSignOutAlt /> Sign Out
          </button>
        </div>
      </div>

      {/* ═══ BACKEND / API STATUS ═══ */}
      <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-5">
          <FaServer className="text-green-300 text-xl" />
          <h2 className="text-xl font-bold text-green-100" style={font}>Backend &amp; API Status</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className={`border-2 p-4 ${backendOk ? 'border-green-600/50 bg-green-950/20' : 'border-red-600/50 bg-red-950/20'}`}>
            <div className="flex items-center gap-2 mb-2">
              {backendOk
                ? <FaCheckCircle className="text-green-400" />
                : <FaTimesCircle className="text-red-400" />}
              <p className="text-xs text-green-200/50" style={font}>API CONNECTION</p>
            </div>
            <p className={`text-2xl font-bold ${backendOk ? 'text-green-300' : 'text-red-300'}`} style={font}>
              {backendOk ? 'Online' : 'Offline'}
            </p>
            <p className="text-[10px] text-green-200/40 mt-1" style={font}>
              {backendOk
                ? 'Backend reachable, requests will succeed.'
                : (healthErr || 'Cannot reach backend at localhost:8000')}
            </p>
          </div>

          <div className="bg-gray-900/30 border border-green-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <FaDatabase className="text-blue-400" />
              <p className="text-xs text-green-200/50" style={font}>SERVICE STATUS</p>
            </div>
            <p className="text-green-100 text-sm" style={font}>
              {health?.status || 'unknown'}
            </p>
            <p className="text-[10px] text-green-200/40 mt-1" style={font}>
              {health?.service || 'CyberDrill backend'}
            </p>
          </div>
        </div>

        <div className="bg-gray-900/30 border border-green-900/30 p-3 text-xs" style={font}>
          <p className="text-green-200/50 mb-1">API Base URL</p>
          <code className="text-green-300 font-mono">{apiBase}</code>
        </div>
      </div>

      {/* ═══ YOUR DATA ═══ */}
      <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-5">
          <FaChartLine className="text-green-300 text-xl" />
          <h2 className="text-xl font-bold text-green-100" style={font}>Your Data</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-900/30 border border-green-900/30 p-4 text-center">
            <FaNetworkWired className="text-orange-400 text-2xl mx-auto mb-2" />
            <p className="text-3xl font-bold text-orange-300" style={font}>{stats.scenarios}</p>
            <p className="text-xs text-green-200/60 mt-1" style={font}>Topologies Uploaded</p>
          </div>
          <div className="bg-gray-900/30 border border-green-900/30 p-4 text-center">
            <FaShieldAlt className="text-blue-400 text-2xl mx-auto mb-2" />
            <p className="text-3xl font-bold text-blue-300" style={font}>{stats.simulations}</p>
            <p className="text-xs text-green-200/60 mt-1" style={font}>Drills Run</p>
          </div>
          <div className="bg-gray-900/30 border border-green-900/30 p-4 text-center">
            <FaBrain className="text-purple-400 text-2xl mx-auto mb-2" />
            <p className="text-3xl font-bold text-purple-300" style={font}>{stats.trainings}</p>
            <p className="text-xs text-green-200/60 mt-1" style={font}>Training Runs</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <button onClick={() => nav('/ai-orchestrator')} className="px-4 py-2 border-2 border-green-700/50 text-green-100 hover:bg-green-900/30 text-sm" style={font}>
            Open AI Orchestrator →
          </button>
          <button onClick={() => nav('/analytics')} className="px-4 py-2 border-2 border-green-700/50 text-green-100 hover:bg-green-900/30 text-sm" style={font}>
            View Analytics →
          </button>
          <button onClick={() => nav('/report')} className="px-4 py-2 border-2 border-green-700/50 text-green-100 hover:bg-green-900/30 text-sm" style={font}>
            Open Security Report →
          </button>
        </div>
      </div>

      {/* ═══ SYSTEM INFO ═══ */}
      <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-5">
          <FaCog className="text-green-300 text-xl" />
          <h2 className="text-xl font-bold text-green-100" style={font}>System Information</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-900/30 border border-green-900/30 p-4">
            <p className="text-xs text-green-200/50 mb-1" style={font}>Application</p>
            <p className="text-green-100 font-bold" style={font}>CyberDrill — AI Cyber Drill Platform</p>
          </div>
          <div className="bg-gray-900/30 border border-green-900/30 p-4">
            <p className="text-xs text-green-200/50 mb-1" style={font}>Default RL Algorithm</p>
            <p className="text-green-100 font-bold" style={font}>PPO (Proximal Policy Optimization)</p>
          </div>
          <div className="bg-gray-900/30 border border-green-900/30 p-4">
            <p className="text-xs text-green-200/50 mb-1" style={font}>RL Library</p>
            <p className="text-green-100 font-bold" style={font}>Stable Baselines3</p>
          </div>
          <div className="bg-gray-900/30 border border-green-900/30 p-4">
            <p className="text-xs text-green-200/50 mb-1" style={font}>Threat Framework</p>
            <p className="text-green-100 font-bold" style={font}>MITRE ATT&amp;CK</p>
          </div>
        </div>

        <div className="mt-4 bg-gray-900/30 border border-green-900/30 p-3 flex items-start gap-2 text-xs" style={font}>
          <FaInfoCircle className="text-green-400/70 mt-0.5 flex-shrink-0" />
          <p className="text-green-200/60">
            Topologies, drills, training runs, and analyses are scoped to your account. Your auth token is stored locally in your browser and is sent with every API request.
          </p>
        </div>
      </div>
    </div>
  )
}

export default Settings
