import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaNetworkWired,
  FaBrain,
  FaPlay,
  FaStop,
  FaTerminal,
  FaServer,
  FaFileAlt,
  FaDownload,
  FaTrash,
  FaQuestionCircle,
  FaUpload,
  FaDesktop,
  FaLock,
  FaUnlock,
  FaExclamationCircle
} from 'react-icons/fa'
import api from '../api'

const CommandCentre = () => {
  const navigate = useNavigate()
  const [commandHistory, setCommandHistory] = useState([])
  const [commandInput, setCommandInput] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [userSims, setUserSims] = useState([])
  const [userRuns, setUserRuns] = useState([])
  const [selectedScenarioId, setSelectedScenarioId] = useState(null)
  const [networkHosts, setNetworkHosts] = useState([])
  const [showHelp, setShowHelp] = useState(false)
  const [hostFilter, setHostFilter] = useState('all') // all | vulnerable | compromised | secure
  const [hostSort, setHostSort] = useState('risk') // risk | name | cves
  const commandEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  const scrollToBottom = () => {
    commandEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    // only scroll when there's actual output — not on initial mount
    if (commandHistory.length > 0) scrollToBottom()
  }, [commandHistory])

  const [networkEdges, setNetworkEdges] = useState([])

  const loadHostsForScenario = (scenarioId) => {
    api.getScenario(scenarioId).then((detail) => {
      const rawTopo = typeof detail.topology_data === 'string' ? JSON.parse(detail.topology_data) : detail.topology_data
      const hosts = rawTopo?.network?.hosts || {}
      const rawEdges = rawTopo?.network?.edges || []
      const edges = rawEdges.map(e => Array.isArray(e) ? { source: e[0], target: e[1] } : e)
      setNetworkEdges(edges)
      const hostList = Object.entries(hosts).map(([name, info], i) => {
        const vulnList = Array.isArray(info.vulnerabilities) ? info.vulnerabilities : []
        const numberOfVulnerabilities = vulnList.length || info.vulnerability_count || 0
        const servicesList = Array.isArray(info.services) ? info.services : (info.services ? Object.keys(info.services) : [])
        const sensitivityLevel = info.sensitivity || 'low'

        let vulnerabilitySeverity = 'Low'
        if (numberOfVulnerabilities >= 4) vulnerabilitySeverity = 'Critical'
        else if (numberOfVulnerabilities >= 3) vulnerabilitySeverity = 'High'
        else if (numberOfVulnerabilities >= 1) vulnerabilitySeverity = 'Medium'

        let hostStatus = 'secure'
        if (numberOfVulnerabilities >= 3 && sensitivityLevel === 'high') hostStatus = 'compromised'
        else if (numberOfVulnerabilities >= 2) hostStatus = 'vulnerable'
        else if (numberOfVulnerabilities >= 1) hostStatus = 'vulnerable'

        // find connected hosts
        const connections = edges
          .filter(e => e.source === name || e.target === name)
          .map(e => e.source === name ? e.target : e.source)

        return {
          id: i + 1,
          hostname: name,
          ip: info.ip || `10.0.${Math.floor(i / 255)}.${(i % 255) + 1}`,
          os: info.os || 'Linux',
          status: hostStatus,
          vulnerability: vulnerabilitySeverity,
          sensitivity: sensitivityLevel,
          services: servicesList,
          vulnerabilityList: vulnList,
          connections,
          lastSeen: 'Online',
        }
      })
      setNetworkHosts(hostList)
    }).catch(() => {})
  }

  useEffect(() => {
    api.listMySimulations().then(setUserSims).catch(() => {})
    api.listMyTrainingRuns().then(setUserRuns).catch(() => {})
    api.listMyScenarios().then((data) => {
      setScenarios(data)
      if (data.length > 0) {
        setSelectedScenarioId(data[0].id)
        loadHostsForScenario(data[0].id)
      }
    }).catch(() => {})
  }, [])

  const addOutput = (cmd, text) => {
    setCommandHistory(prev => [...prev, { type: 'command', text: cmd }, { type: 'output', text }])
    setCommandInput('')
    setHistoryIndex(-1)
  }

  const executeCommand = async (cmd) => {
    const command = cmd.trim().toLowerCase()
    const parts = command.split(' ')
    const baseCommand = parts[0]
    const args = parts.slice(1)

    let output = ''

    switch(baseCommand) {
      case 'run':
      case 'start':
        if (args.includes('simulation')) {
          const scenarioId = parseInt(args.find(a => !isNaN(a))) || (scenarios[0]?.id || 1)
          const steps = parseInt(args.find((a, i) => !isNaN(a) && i > args.indexOf('simulation'))) || 10
          addOutput(cmd, `Starting simulation on scenario ${scenarioId} with ${steps} steps...`)
          try {
            const result = await api.runSimulation(scenarioId, steps)
            const outcome = result.outcome ? result.outcome.toUpperCase() : 'N/A'
            output = `✓ Simulation completed\n  Outcome: ${outcome}${result.reason ? ` (${result.reason})` : ''}\n  Steps: ${result.total_steps}\n  Training reward: Red ${result.total_red_reward?.toFixed(1)} · Blue ${result.total_blue_reward?.toFixed(1)}\n  Session: ${result.session_id}`
            // Refresh user-scoped stats
            api.listMySimulations().then(setUserSims).catch(() => {})
          } catch (err) {
            output = `✗ Simulation failed: ${err.message}\n  Make sure the backend is running.`
          }
          setCommandHistory(prev => [...prev, { type: 'output', text: output }])
          return
        } else {
          output = 'Usage: run simulation [scenario_id] [steps]'
        }
        break

      case 'status':
        try {
          const [healthData, stats] = await Promise.all([api.health(), api.dashboard()])
          output = `System Status:\n  Backend: ${healthData.status}\n  Database: ${healthData.database}\n  Version: ${healthData.version}\n  Total Simulations: ${stats.total_simulations}\n  Completed Simulations: ${stats.completed_simulations}\n  Training Runs: ${stats.total_training_runs}\n  Completed Training: ${stats.completed_training_runs}`
        } catch {
          output = 'System Status:\n  Backend: Disconnected\n  Make sure the backend is running on port 8000'
        }
        break

      case 'list':
        if (args[0] === 'scenarios') {
          try {
            const scenarioList = await api.listScenarios()
            if (scenarioList.length === 0) {
              output = 'No scenarios found. Start the backend to auto-discover topologies.'
            } else {
              output = 'Available Scenarios:\n' + scenarioList.map(s =>
                `  [${s.id}] ${s.name} — ${s.num_hosts} hosts (${s.filename})`
              ).join('\n')
            }
          } catch {
            output = 'Error: Could not fetch scenarios. Is the backend running?'
          }
        } else {
          output = 'Usage: list scenarios'
        }
        break

      case 'logs': {
        // show real simulation logs from DB
        try {
          const simsList = await api.listMySimulations()
          if (simsList.length === 0) {
            output = 'No simulations found. Run a drill from the Attack Simulator first.'
          } else {
            const latest = simsList[0]
            const detail = await api.getSimulation(latest.id)
            const steps = detail.steps || []
            const lines = steps.slice(-10).map(s => {
              const ra = s.red_action?.action || 'idle'
              const ba = s.blue_action?.action || 'idle'
              const rt = s.red_action?.target || '—'
              return `  [Step ${s.step_number}] Red: ${ra} → ${rt} | Blue: ${ba} | R:${s.red_reward?.toFixed(1)} B:${s.blue_reward?.toFixed(1)}`
            })
            output = `Last 10 steps from Simulation #${latest.id}:\n${lines.join('\n') || '  No steps recorded.'}`
          }
        } catch {
          output = 'Error fetching logs. Is the backend running?'
        }
        break
      }

      case 'generate':
      case 'report':
        output = '✓ Navigate to the Security Report page to view and download the full PDF report.'
        break

      case 'clear':
        setCommandHistory([])
        return

      case 'help':
        output = `Available Commands:
  run simulation [id] [steps]  Run a Red vs Blue simulation
                               Example: run simulation 1 15
  status                       Show backend health and drill statistics
  list scenarios               List all available network topologies
  logs                         Show latest simulation step log
  generate report              Reminder to view Security Report page
  clear                        Clear console output
  help                         Show this help`
        break

      case '':
        return

      default:
        output = `Command not found: ${baseCommand}\nType 'help' for available commands`
    }

    addOutput(cmd, output)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (commandInput.trim()) {
        executeCommand(commandInput)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const history = commandHistory.filter(h => h.type === 'command').map(h => h.text).reverse()
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setCommandInput(history[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        const history = commandHistory.filter(h => h.type === 'command').map(h => h.text).reverse()
        setCommandInput(history[newIndex])
      } else {
        setHistoryIndex(-1)
        setCommandInput('')
      }
    }
  }

  const systemStats = [
    {
      title: 'Scenarios',
      value: String(scenarios.length),
      icon: FaServer,
      animation: 'animate-pulse',
      color: 'text-green-400'
    },
    {
      title: 'Simulations',
      value: String(userSims.length),
      icon: FaNetworkWired,
      animation: 'animate-pulse',
      color: 'text-blue-400'
    },
    {
      title: 'Training Runs',
      value: String(userRuns.length),
      icon: FaBrain,
      animation: 'animate-bounce',
      color: 'text-purple-400'
    },
    {
      title: 'Network Hosts',
      value: String(networkHosts.length),
      icon: FaDesktop,
      animation: 'animate-pulse',
      color: 'text-cyan-400'
    }
  ]



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-green-100 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>Network Monitor</h1>
          <p className="text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>Detailed host information, services, vulnerabilities, and network topology from your uploaded YAML</p>
        </div>
      </div>

      {/* System Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {systemStats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div key={index} className="bg-gray-800/30 border-2 border-green-900/50 p-6 hover:border-green-800 hover:scale-105 transition-all shadow-xl group cursor-pointer">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-green-900/30 p-3 border border-green-800/50 group-hover:bg-green-800/40 transition-colors">
                  <Icon className={`${stat.color} text-2xl ${stat.animation}`} />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-green-100 mb-1 group-hover:text-green-50 transition-colors" style={{ fontFamily: 'Gugi, sans-serif' }}>{stat.value}</h3>
              <p className="text-green-200/70 text-sm" style={{ fontFamily: 'Gugi, sans-serif' }}>{stat.title}</p>
            </div>
          )
        })}
      </div>

      {/* ═══ NETWORK POSTURE SUMMARY ═══ */}
      {networkHosts.length > 0 && (() => {
        const compromised = networkHosts.filter(h => h.status === 'compromised').length
        const vulnerable  = networkHosts.filter(h => h.status === 'vulnerable').length
        const secure      = networkHosts.filter(h => h.status === 'secure').length
        const totalCVEs   = networkHosts.reduce((t, h) => t + h.vulnerabilityList.length, 0)
        const criticalHost = [...networkHosts].sort((a, b) => b.vulnerabilityList.length - a.vulnerabilityList.length)[0]
        const highSensCount = networkHosts.filter(h => h.sensitivity === 'high').length
        const total = networkHosts.length || 1
        const riskScore = Math.min(100, Math.round((compromised * 40 + vulnerable * 15 + totalCVEs * 3) / total))
        const riskLabel = riskScore >= 70 ? 'CRITICAL' : riskScore >= 40 ? 'ELEVATED' : riskScore >= 20 ? 'MODERATE' : 'LOW'
        const riskColor = riskScore >= 70 ? 'text-red-400' : riskScore >= 40 ? 'text-orange-400' : riskScore >= 20 ? 'text-yellow-400' : 'text-green-400'
        const riskBorder = riskScore >= 70 ? 'border-red-700/60' : riskScore >= 40 ? 'border-orange-700/60' : riskScore >= 20 ? 'border-yellow-700/60' : 'border-green-700/60'
        const riskBg = riskScore >= 70 ? 'bg-red-950/20' : riskScore >= 40 ? 'bg-orange-950/20' : riskScore >= 20 ? 'bg-yellow-950/20' : 'bg-green-950/20'

        return (
          <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
            <h2 className="text-2xl font-bold text-green-100 mb-1" style={{ fontFamily: 'Gugi, sans-serif' }}>Network Posture Summary</h2>
            <p className="text-green-200/50 text-sm mb-5" style={{ fontFamily: 'Gugi, sans-serif' }}>
              Real-time view of how exposed your network is — risk score, host health breakdown, and the most critical asset.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
              {/* Overall Risk Score */}
              <div className={`border-2 ${riskBorder} ${riskBg} p-5`}>
                <p className="text-xs text-green-200/50 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>OVERALL NETWORK RISK</p>
                <div className="flex items-baseline gap-2">
                  <p className={`text-5xl font-bold ${riskColor}`} style={{ fontFamily: 'Gugi, sans-serif' }}>{riskScore}</p>
                  <p className="text-green-200/40 text-sm" style={{ fontFamily: 'Gugi, sans-serif' }}>/ 100</p>
                </div>
                <p className={`text-sm font-bold mt-1 ${riskColor}`} style={{ fontFamily: 'Gugi, sans-serif' }}>{riskLabel} RISK</p>
                <div className="mt-3 w-full h-3 bg-gray-900/50 border border-green-900/30 overflow-hidden">
                  <div className={`h-full ${riskScore >= 70 ? 'bg-red-500/70' : riskScore >= 40 ? 'bg-orange-500/70' : riskScore >= 20 ? 'bg-yellow-500/70' : 'bg-green-500/70'}`} style={{ width: `${riskScore}%` }}></div>
                </div>
              </div>

              {/* Host Health Breakdown */}
              <div className="bg-gray-900/30 border border-green-900/30 p-5 lg:col-span-2">
                <p className="text-xs text-green-200/50 mb-3" style={{ fontFamily: 'Gugi, sans-serif' }}>HOST HEALTH BREAKDOWN</p>
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-red-300" style={{ fontFamily: 'Gugi, sans-serif' }}><FaLock className="inline mr-1" />Compromised</span>
                      <span className="text-red-300 font-bold" style={{ fontFamily: 'Gugi, sans-serif' }}>{compromised} / {total}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-900/50 overflow-hidden"><div className="h-full bg-red-500/70" style={{ width: `${(compromised / total) * 100}%` }}></div></div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-yellow-300" style={{ fontFamily: 'Gugi, sans-serif' }}><FaExclamationCircle className="inline mr-1" />Vulnerable</span>
                      <span className="text-yellow-300 font-bold" style={{ fontFamily: 'Gugi, sans-serif' }}>{vulnerable} / {total}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-900/50 overflow-hidden"><div className="h-full bg-yellow-500/70" style={{ width: `${(vulnerable / total) * 100}%` }}></div></div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-green-300" style={{ fontFamily: 'Gugi, sans-serif' }}><FaUnlock className="inline mr-1" />Secure</span>
                      <span className="text-green-300 font-bold" style={{ fontFamily: 'Gugi, sans-serif' }}>{secure} / {total}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-900/50 overflow-hidden"><div className="h-full bg-green-500/70" style={{ width: `${(secure / total) * 100}%` }}></div></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick facts row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gray-900/30 border border-red-900/30 p-3">
                <p className="text-[10px] text-red-200/50" style={{ fontFamily: 'Gugi, sans-serif' }}>TOTAL CVEs</p>
                <p className="text-2xl font-bold text-red-400" style={{ fontFamily: 'Gugi, sans-serif' }}>{totalCVEs}</p>
              </div>
              <div className="bg-gray-900/30 border border-orange-900/30 p-3">
                <p className="text-[10px] text-orange-200/50" style={{ fontFamily: 'Gugi, sans-serif' }}>MOST EXPOSED HOST</p>
                <p className="text-sm font-bold text-orange-300 truncate" style={{ fontFamily: 'Gugi, sans-serif' }}>{criticalHost?.hostname || '—'}</p>
                <p className="text-[10px] text-orange-200/40" style={{ fontFamily: 'Gugi, sans-serif' }}>{criticalHost?.vulnerabilityList.length || 0} CVEs</p>
              </div>
              <div className="bg-gray-900/30 border border-purple-900/30 p-3">
                <p className="text-[10px] text-purple-200/50" style={{ fontFamily: 'Gugi, sans-serif' }}>HIGH-VALUE ASSETS</p>
                <p className="text-2xl font-bold text-purple-300" style={{ fontFamily: 'Gugi, sans-serif' }}>{highSensCount}</p>
              </div>
              <div className="bg-gray-900/30 border border-blue-900/30 p-3">
                <p className="text-[10px] text-blue-200/50" style={{ fontFamily: 'Gugi, sans-serif' }}>NETWORK LINKS</p>
                <p className="text-2xl font-bold text-blue-300" style={{ fontFamily: 'Gugi, sans-serif' }}>{networkEdges.length}</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Network Hosts */}
      <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>Network Hosts</h2>
            <p className="text-green-200/50 text-xs mt-0.5" style={{ fontFamily: 'Gugi, sans-serif' }}>Each card represents a host parsed from your YAML topology — hover for details, filter or sort below.</p>
          </div>
          {scenarios.length > 0 && (
            <select
              value={selectedScenarioId || ''}
              onChange={(e) => {
                const id = parseInt(e.target.value)
                setSelectedScenarioId(id)
                loadHostsForScenario(id)
              }}
              className="bg-gray-900/50 border-2 border-green-900/50 text-green-100 px-4 py-2 focus:outline-none focus:border-green-800 transition-all text-sm"
              style={{ fontFamily: 'Gugi, sans-serif' }}
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.num_hosts} hosts)</option>
              ))}
            </select>
          )}
        </div>

        {/* Filter + sort row */}
        {networkHosts.length > 0 && (
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4 pb-3 border-b border-green-900/30">
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'all', label: `All (${networkHosts.length})`, color: 'border-green-700/50 text-green-200' },
                { key: 'compromised', label: `Compromised (${networkHosts.filter(h => h.status === 'compromised').length})`, color: 'border-red-700/50 text-red-300' },
                { key: 'vulnerable', label: `Vulnerable (${networkHosts.filter(h => h.status === 'vulnerable').length})`, color: 'border-yellow-700/50 text-yellow-300' },
                { key: 'secure', label: `Secure (${networkHosts.filter(h => h.status === 'secure').length})`, color: 'border-green-700/50 text-green-300' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setHostFilter(f.key)}
                  className={`px-3 py-1.5 border-2 text-xs ${f.color} transition-all ${hostFilter === f.key ? 'bg-green-900/40 ring-1 ring-green-500' : 'bg-transparent hover:bg-green-900/20'}`}
                  style={{ fontFamily: 'Gugi, sans-serif' }}
                >{f.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-200/50" style={{ fontFamily: 'Gugi, sans-serif' }}>Sort:</span>
              <select
                value={hostSort}
                onChange={(e) => setHostSort(e.target.value)}
                className="bg-gray-900/50 border border-green-900/50 text-green-100 px-3 py-1 text-xs focus:outline-none focus:border-green-800"
                style={{ fontFamily: 'Gugi, sans-serif' }}
              >
                <option value="risk">By Risk (highest first)</option>
                <option value="cves">By CVE Count</option>
                <option value="name">By Hostname</option>
              </select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.length === 0 ? (
            <div className="col-span-full text-center py-12 text-green-200/50 space-y-3" style={{ fontFamily: 'Gugi, sans-serif' }}>
              <FaUpload className="text-4xl mx-auto text-green-300/30" />
              <p className="text-lg">No network topology uploaded yet</p>
              <p className="text-sm text-green-200/40">Upload a YAML file from the terminal below or through the AI Orchestrator to see your network hosts here.</p>
            </div>
          ) : networkHosts.length === 0 ? (
            <div className="col-span-full text-center py-8 text-green-200/50" style={{ fontFamily: 'Gugi, sans-serif' }}>
              Loading hosts...
            </div>
          ) : (() => {
            const sensRank = { high: 0, medium: 1, low: 2 }
            const filtered = networkHosts.filter(h => hostFilter === 'all' ? true : h.status === hostFilter)
            const sorted = [...filtered].sort((a, b) => {
              if (hostSort === 'cves') return b.vulnerabilityList.length - a.vulnerabilityList.length
              if (hostSort === 'name') return a.hostname.localeCompare(b.hostname)
              // risk: compromised > vulnerable > secure, then more CVEs, then higher sensitivity
              const statusRank = { compromised: 0, vulnerable: 1, secure: 2 }
              const ds = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)
              if (ds !== 0) return ds
              const dc = b.vulnerabilityList.length - a.vulnerabilityList.length
              if (dc !== 0) return dc
              return (sensRank[a.sensitivity] ?? 9) - (sensRank[b.sensitivity] ?? 9)
            })
            if (sorted.length === 0) {
              return (
                <div className="col-span-full text-center py-8 text-green-200/40 text-sm" style={{ fontFamily: 'Gugi, sans-serif' }}>
                  No hosts match the current filter.
                </div>
              )
            }
            return sorted.map((host) => (
            <div
              key={host.id}
              className="bg-gray-900/20 border-2 border-green-900/50 p-4 hover:border-green-800 transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <FaDesktop className={`text-xl ${
                    host.status === 'compromised' ? 'text-red-400' :
                    host.status === 'vulnerable' ? 'text-yellow-400' :
                    'text-green-400'
                  }`} />
                  <div>
                    <h3 className="font-semibold text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>{host.hostname}</h3>
                    <p className="text-xs text-green-200/70 font-mono" style={{ fontFamily: 'Gugi, sans-serif' }}>{host.ip}</p>
                  </div>
                </div>
                {host.status === 'compromised' ? (
                  <FaLock className="text-red-400 animate-pulse" />
                ) : host.status === 'vulnerable' ? (
                  <FaExclamationCircle className="text-yellow-400 animate-pulse" />
                ) : (
                  <FaUnlock className="text-green-400" />
                )}
              </div>

              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>OS:</span>
                  <span className="text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>{host.os}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>Status:</span>
                  <span className={`px-2 py-0.5 text-xs ${
                    host.status === 'compromised' ? 'bg-red-900/30 border border-red-700/50 text-red-400' :
                    host.status === 'vulnerable' ? 'bg-yellow-900/30 border border-yellow-700/50 text-yellow-400' :
                    'bg-green-900/30 border border-green-700/50 text-green-400'
                  }`} style={{ fontFamily: 'Gugi, sans-serif' }}>
                    {host.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>CVEs:</span>
                  <span className={`px-2 py-0.5 text-xs font-bold ${
                    host.vulnerabilityList.length >= 4 ? 'bg-red-900/30 border border-red-700/50 text-red-400' :
                    host.vulnerabilityList.length >= 2 ? 'bg-yellow-900/30 border border-yellow-700/50 text-yellow-400' :
                    host.vulnerabilityList.length >= 1 ? 'bg-orange-900/30 border border-orange-700/50 text-orange-400' :
                    'bg-green-900/30 border border-green-700/50 text-green-400'
                  }`} style={{ fontFamily: 'Gugi, sans-serif' }}>
                    {host.vulnerabilityList.length} {host.vulnerabilityList.length === 1 ? 'vulnerability' : 'vulnerabilities'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>Sensitivity:</span>
                <span className={`px-2 py-0.5 text-xs ${
                  host.sensitivity === 'high' ? 'bg-red-900/30 border border-red-700/50 text-red-400' :
                  host.sensitivity === 'medium' ? 'bg-yellow-900/30 border border-yellow-700/50 text-yellow-400' :
                  'bg-green-900/30 border border-green-700/50 text-green-400'
                }`} style={{ fontFamily: 'Gugi, sans-serif' }}>
                  {host.sensitivity.toUpperCase()}
                </span>
              </div>

              <div className="mb-2">
                <div className="text-xs text-green-200/70 mb-1" style={{ fontFamily: 'Gugi, sans-serif' }}>Services:</div>
                <div className="flex flex-wrap gap-1">
                  {host.services.map((service, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-gray-900/50 border border-green-900/30 text-green-200/70 text-xs" style={{ fontFamily: 'Gugi, sans-serif' }}>
                      {service}
                    </span>
                  ))}
                  {host.services.length === 0 && <span className="text-green-200/30 text-xs" style={{ fontFamily: 'Gugi, sans-serif' }}>None</span>}
                </div>
              </div>

              {host.vulnerabilityList.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs text-green-200/70 mb-1" style={{ fontFamily: 'Gugi, sans-serif' }}>CVEs ({host.vulnerabilityList.length}):</div>
                  <div className="flex flex-wrap gap-1">
                    {host.vulnerabilityList.map((cve, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-red-900/20 border border-red-800/40 text-red-300 text-[10px] font-mono">{cve}</span>
                    ))}
                  </div>
                </div>
              )}

              {host.connections && host.connections.length > 0 && (
                <div className="pt-2 border-t border-green-900/30">
                  <div className="text-xs text-green-200/70 mb-1" style={{ fontFamily: 'Gugi, sans-serif' }}>Connected to:</div>
                  <div className="flex flex-wrap gap-1">
                    {host.connections.map((conn, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-blue-900/20 border border-blue-800/40 text-blue-300 text-[10px]" style={{ fontFamily: 'Gugi, sans-serif' }}>{conn}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
          })()}
        </div>
      </div>


      {/* Network Topology Edges */}
      {networkEdges.length > 0 && (
        <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
          <h2 className="text-2xl font-bold text-green-100 mb-4" style={{ fontFamily: 'Gugi, sans-serif' }}>Network Connections</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {networkEdges.map((edge, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-900/20 border border-green-900/30">
                <FaServer className="text-blue-400 flex-shrink-0" />
                <span className="text-blue-300 font-bold text-sm" style={{ fontFamily: 'Gugi, sans-serif' }}>{edge.source}</span>
                <span className="text-green-600/50">↔</span>
                <span className="text-blue-300 font-bold text-sm" style={{ fontFamily: 'Gugi, sans-serif' }}>{edge.target}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="bg-gray-900/30 p-3 border border-green-900/30 text-center">
              <div className="text-xs text-green-200/50" style={{ fontFamily: 'Gugi, sans-serif' }}>Total Hosts</div>
              <div className="text-xl font-bold text-green-100">{networkHosts.length}</div>
            </div>
            <div className="bg-gray-900/30 p-3 border border-green-900/30 text-center">
              <div className="text-xs text-green-200/50" style={{ fontFamily: 'Gugi, sans-serif' }}>Connections</div>
              <div className="text-xl font-bold text-blue-400">{networkEdges.length}</div>
            </div>
            <div className="bg-gray-900/30 p-3 border border-red-900/30 text-center">
              <div className="text-xs text-green-200/50" style={{ fontFamily: 'Gugi, sans-serif' }}>Total CVEs</div>
              <div className="text-xl font-bold text-red-400">{networkHosts.reduce((t, h) => t + h.vulnerabilityList.length, 0)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Help/Manual Panel */}
      {showHelp && (
        <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>Command Manual</h2>
            <button onClick={() => setShowHelp(false)} className="text-green-300/70 hover:text-green-200 transition-colors text-sm border border-green-900/50 px-3 py-1" style={{ fontFamily: 'Gugi, sans-serif' }}>Close</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { category: 'Simulation', commands: [
                { cmd: 'run simulation [id] [steps]', desc: 'Run a Red vs Blue AI simulation — e.g. run simulation 1 15' },
              ]},
              { category: 'System Info', commands: [
                { cmd: 'status', desc: 'Show real system status — backend health, sim and training counts' },
                { cmd: 'list scenarios', desc: 'List all uploaded network topologies from backend' },
              ]},
              { category: 'Logs & Reports', commands: [
                { cmd: 'logs', desc: 'Show latest simulation step log (last 10 steps)' },
                { cmd: 'generate report', desc: 'Reminder to open the Security Report page for PDF' },
              ]},
              { category: 'Utility', commands: [
                { cmd: 'clear', desc: 'Clear the console output' },
                { cmd: 'help', desc: 'Show available commands' },
              ]},
            ].map((group, gi) => (
              <div key={gi} className="bg-gray-900/20 border border-green-900/30 p-4">
                <h3 className="text-lg font-bold text-green-200 mb-3" style={{ fontFamily: 'Gugi, sans-serif' }}>{group.category}</h3>
                <div className="space-y-2">
                  {group.commands.map((c, ci) => (
                    <div key={ci} className="text-sm">
                      <code className="text-green-400 font-mono text-xs">{c.cmd}</code>
                      <p className="text-green-200/60 text-xs mt-0.5" style={{ fontFamily: 'Gugi, sans-serif' }}>{c.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Command Prompt Panel */}
      <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <FaTerminal className="text-green-300 text-xl" />
            <h2 className="text-2xl font-bold text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>Command Prompt</h2>
          </div>
          <div className="flex items-center space-x-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".yaml,.yml"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) {
                  setUploadedFile(file)
                  setCommandHistory(prev => [...prev, { type: 'output', text: `Uploading ${file.name} to backend...` }])
                  try {
                    const result = await api.uploadTopology(file)
                    api.addUserScenario(result.id)
                    const output = `✓ YAML topology uploaded: ${file.name}\n  Scenario created: ${result.name} (ID: ${result.id})\n  Hosts: ${result.num_hosts}\n  Status: Active\n\n  Refreshing scenarios list...`
                    setCommandHistory(prev => [...prev, { type: 'output', text: output }])
                    // Refresh scenarios list
                    const updated = await api.listMyScenarios()
                    setScenarios(updated)
                    setSelectedScenarioId(result.id)
                    loadHostsForScenario(result.id)
                  } catch (error) {
                    const errorOutput = `✗ Upload failed: ${error.message}\n  Make sure the backend is running.`
                    setCommandHistory(prev => [...prev, { type: 'output', text: errorOutput }])
                  }
                  scrollToBottom()
                }
                e.target.value = ''
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-green-300/70 hover:text-green-200 hover:bg-green-900/30 transition-colors"
              title="Upload YAML File"
            >
              <FaUpload />
            </button>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className={`p-2 transition-colors ${showHelp ? 'text-green-200 bg-green-900/30' : 'text-green-300/70 hover:text-green-200 hover:bg-green-900/30'}`}
              title="Command Manual"
            >
              <FaQuestionCircle />
            </button>
            <button
              onClick={() => executeCommand('clear')}
              className="p-2 text-green-300/70 hover:text-green-200 hover:bg-green-900/30 transition-colors"
              title="Clear Console"
            >
              <FaTrash />
            </button>
          </div>
        </div>
        
        {/* Command Output Area */}
        <div className="bg-black/50 border-2 border-green-900/50 p-4 h-96 overflow-y-auto font-mono text-sm mb-4">
          {commandHistory.length === 0 ? (
            <div className="text-green-300/50" style={{ fontFamily: 'monospace' }}>
              CyberDrill Command Interface v2.0<br/>
              Type 'help' for available commands<br/>
              <br/>
              {`> `}
            </div>
          ) : (
            <>
              {commandHistory.map((item, index) => (
                <div key={index} className="mb-2">
                  {item.type === 'command' ? (
                    <div className="text-green-400" style={{ fontFamily: 'monospace' }}>
                      {`> ${item.text}`}
                    </div>
                  ) : (
                    <div className="text-green-400 whitespace-pre-wrap" style={{ fontFamily: 'monospace' }}>
                      {item.text}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
          <div ref={commandEndRef} />
        </div>

        {/* Command Input */}
        <div className="flex items-center space-x-2">
          <span className="text-green-400 font-mono text-sm">{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command..."
            className="flex-1 bg-gray-900/50 border-2 border-green-900/50 text-green-100 px-4 py-2 focus:outline-none focus:border-green-800 transition-all font-mono"
            style={{ fontFamily: 'monospace' }}
          />
          <button
            onClick={() => commandInput.trim() && executeCommand(commandInput)}
            className="px-4 py-2 bg-transparent border-2 border-green-900/50 text-green-100 hover:bg-green-900/30 transition-colors"
            style={{ fontFamily: 'Gugi, sans-serif' }}
          >
            Execute
          </button>
        </div>

        {/* Quick Command Buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { cmd: 'run simulation', icon: FaPlay, label: 'Run' },
            { cmd: 'stop simulation', icon: FaStop, label: 'Stop' },
            { cmd: 'status', icon: FaServer, label: 'Status' },
            { cmd: 'list scenarios', icon: FaFileAlt, label: 'Scenarios' },
            { cmd: 'logs attack', icon: FaTerminal, label: 'Logs' },
            { cmd: 'generate report', icon: FaDownload, label: 'Report' },
            { cmd: 'help', icon: FaQuestionCircle, label: 'Help' },
          ].map((quickCmd, index) => {
            const Icon = quickCmd.icon
            return (
              <button
                key={index}
                onClick={() => executeCommand(quickCmd.cmd)}
                className="flex items-center space-x-2 px-3 py-1.5 bg-gray-900/20 border border-green-900/50 text-green-200/70 hover:bg-green-900/30 hover:text-green-100 hover:border-green-800 transition-all text-sm"
                style={{ fontFamily: 'Gugi, sans-serif' }}
              >
                <Icon className="text-xs" />
                <span>{quickCmd.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default CommandCentre

