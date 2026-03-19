import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaBrain, FaPlay, FaStop, FaCog, FaCheckCircle,
  FaExclamationTriangle, FaInfoCircle, FaShieldAlt,
  FaNetworkWired, FaCrosshairs, FaServer, FaChartBar,
  FaSync, FaUpload, FaDatabase, FaRocket, FaFileAlt,
  FaArrowRight, FaSkull
} from 'react-icons/fa'
import api from '../api'

const font = { fontFamily: 'Gugi, sans-serif' }

// MITRE ATT&CK counter-action pairs
const COUNTER_MAP = {
  scan: 'detect', exploit: 'patch', escalate: 'harden',
  lateral_move: 'isolate', exfiltrate: 'restore',
}

const AIOrchestrator = () => {
  const nav = useNavigate()

  // system state
  const [online, setOnline] = useState(false)
  const [scenarios, setScenarios] = useState([])
  const [runs, setRuns] = useState([])
  const [sims, setSims] = useState([])
  const [logs, setLogs] = useState([])
  const [uploading, setUploading] = useState(false)

  // auto-drill pipeline state
  const [pipeline, setPipeline] = useState(null) // null | {stage, scenarioId, scenarioName, ...}
  const [pipelineLog, setPipelineLog] = useState([])

  // manual controls
  const [simScenario, setSimScenario] = useState('')
  const simSteps = 20
  const [simRunning, setSimRunning] = useState(false)
  const [simResult, setSimResult] = useState(null)

  const pollRef = useRef(null)

  // playground
  const [playActive, setPlayActive] = useState(false)
  const [agents, setAgents] = useState({ red: [], blue: [], hits: [] })

  useEffect(() => {
    refresh()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const addLog = (lvl, msg, mod = 'Orchestrator') => {
    const t = new Date().toLocaleTimeString()
    setLogs(prev => [{ id: Date.now(), time: t, level: lvl, msg, mod }, ...prev].slice(0, 50))
  }

  const addPipeLog = (msg, status = 'info') => {
    const t = new Date().toLocaleTimeString()
    setPipelineLog(prev => [{ id: Date.now(), time: t, msg, status }, ...prev])
  }

  const refresh = async () => {
    addLog('info', 'Refreshing system state...', 'System')
    let isOnline = false
    let scList = [], trList = [], smList = []

    try { await api.health(); isOnline = true } catch {
      addLog('warning', 'Backend not responding', 'Health')
    }

    if (isOnline) {
      try { scList = await api.listMyScenarios(); setScenarios(scList) } catch {}
      try { trList = await api.listMyTrainingRuns(); setRuns(trList) } catch {}
      try { smList = await api.listMySimulations(); setSims(smList) } catch {}
      if (scList.length > 0 && !simScenario) {
        setSimScenario(scList[0].id)
      }
    }

    setOnline(isOnline)
    if (isOnline) addLog('success', `Online — ${scList.length} scenarios, ${smList.length} sims`, 'System')
  }

  // ═══════════════════════════════════════════
  // AUTO-DRILL PIPELINE
  // Upload YAML → Train Red → Train Blue → Run Sim → Done (go to report)
  // ═══════════════════════════════════════════
  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setPipelineLog([])
    addPipeLog(`Uploading topology: ${file.name}...`)
    addLog('info', `Uploading ${file.name}...`, 'Upload')

    try {
      const res = await api.uploadTopology(file)
      api.addUserScenario(res.id)
      addLog('success', `"${res.name}" uploaded (${res.num_hosts} hosts)`, 'Upload')
      addPipeLog(`Topology "${res.name}" registered — ${res.num_hosts} hosts detected`, 'success')
      addPipeLog('Ready to launch drill. Click "Launch Drill" to start training and simulation.', 'info')

      // fetch full topology detail
      let topoData = null
      try { topoData = await api.getScenario(res.id) } catch {}

      setPipeline({ stage: 'uploaded', scenarioId: res.id, scenarioName: res.name, numHosts: res.num_hosts, topoData })
      await refresh()
    } catch (err) {
      addLog('warning', `Upload failed: ${err.message}`, 'Upload')
      addPipeLog(`Upload failed: ${err.message}`, 'error')
      setPipeline(null)
    } finally { setUploading(false); e.target.value = '' }
  }

  const launchPipeline = async () => {
    if (!pipeline || !pipeline.scenarioId) return
    setPipeline(p => ({ ...p, stage: 'training_red' }))
    addPipeLog('Starting Red Agent (Attacker) DQN training...')
    addLog('info', 'Starting Red agent training...', 'Pipeline')
    await runPipeline(pipeline.scenarioId, pipeline.scenarioName, pipeline.numHosts, pipeline.topoData)
  }

  const runPipeline = async (scenarioId, scenarioName, numHosts, topoData) => {
    // Step 1: Train Red Agent
    try {
      const redRun = await api.startTraining({
        scenario_id: scenarioId, agent_role: 'red', algorithm: 'dqn',
        total_timesteps: 10000, max_steps_per_episode: 20,
      })
      addPipeLog(`Red training #${redRun.id} started (10,000 timesteps)...`)
      setPipeline(p => ({ ...p, stage: 'training_red', redRunId: redRun.id }))

      const redResult = await pollTraining(redRun.id)
      if (redResult.status === 'completed') {
        addPipeLog(`Red training done! Mean reward: ${redResult.mean_reward?.toFixed(2)}`, 'success')
        addLog('success', `Red training #${redRun.id} done`, 'Pipeline')
      } else {
        addPipeLog(`Red training failed: ${redResult.error_message || 'unknown'}`, 'error')
        setPipeline(p => ({ ...p, stage: 'error' }))
        return
      }
    } catch (err) {
      addPipeLog(`Red training error: ${err.message}`, 'error')
      setPipeline(p => ({ ...p, stage: 'error' }))
      return
    }

    // Step 2: Train Blue Agent
    setPipeline(p => ({ ...p, stage: 'training_blue' }))
    addPipeLog('Starting Blue Agent (Defender) DQN training...')
    addLog('info', 'Auto-starting Blue agent training...', 'Pipeline')

    try {
      const blueRun = await api.startTraining({
        scenario_id: scenarioId, agent_role: 'blue', algorithm: 'dqn',
        total_timesteps: 10000, max_steps_per_episode: 20,
      })
      addPipeLog(`Blue training #${blueRun.id} started (10,000 timesteps)...`)
      setPipeline(p => ({ ...p, stage: 'training_blue', blueRunId: blueRun.id }))

      const blueResult = await pollTraining(blueRun.id)
      if (blueResult.status === 'completed') {
        addPipeLog(`Blue training done! Mean reward: ${blueResult.mean_reward?.toFixed(2)}`, 'success')
        addLog('success', `Blue training #${blueRun.id} done`, 'Pipeline')
      } else {
        addPipeLog(`Blue training failed: ${blueResult.error_message || 'unknown'}`, 'error')
        setPipeline(p => ({ ...p, stage: 'error' }))
        return
      }
    } catch (err) {
      addPipeLog(`Blue training error: ${err.message}`, 'error')
      setPipeline(p => ({ ...p, stage: 'error' }))
      return
    }

    // Step 3: Run simulation
    setPipeline(p => ({ ...p, stage: 'simulating' }))
    addPipeLog('Running Red vs Blue simulation (20 steps)...')
    addLog('info', 'Auto-running simulation...', 'Pipeline')

    try {
      const simRes = await api.runSimulation(scenarioId, 20)
      const totalRed = simRes.total_red_reward?.toFixed(2) || '0'
      const totalBlue = simRes.total_blue_reward?.toFixed(2) || '0'
      const winner = parseFloat(totalRed) > parseFloat(totalBlue) ? 'Red (Attacker)' : 'Blue (Defender)'
      addPipeLog(`Simulation #${simRes.id} done! Red: ${totalRed} | Blue: ${totalBlue} | Winner: ${winner}`, 'success')
      addLog('success', `Simulation #${simRes.id} done`, 'Pipeline')

      setPipeline(p => ({
        ...p, stage: 'done', simId: simRes.id,
        totalRed, totalBlue, winner, totalSteps: simRes.total_steps,
      }))
      addPipeLog('Pipeline complete! Security assessment ready.', 'success')
      addPipeLog('Navigate to Analytics to view the full security report.', 'info')
      await refresh()
    } catch (err) {
      addPipeLog(`Simulation error: ${err.message}`, 'error')
      setPipeline(p => ({ ...p, stage: 'error' }))
    }
  }

  const pollTraining = (runId) => {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const run = await api.getTrainingRun(runId)
          if (run.status === 'completed' || run.status === 'failed') {
            clearInterval(interval)
            resolve(run)
          }
        } catch (err) {
          clearInterval(interval)
          reject(err)
        }
      }, 3000)
      pollRef.current = interval
    })
  }

  // manual sim launch
  const launchSim = async () => {
    if (!simScenario) return
    setSimRunning(true); setSimResult(null)
    addLog('info', `Running sim on scenario #${simScenario}...`, 'Sim')
    try {
      const res = await api.runSimulation(parseInt(simScenario), simSteps)
      const redR = res.total_red_reward?.toFixed(2) || '0'
      const blueR = res.total_blue_reward?.toFixed(2) || '0'
      setSimResult(`Sim #${res.id} done — ${res.total_steps} steps | Red: ${redR} | Blue: ${blueR}`)
      addLog('success', `Sim #${res.id} done`, 'Sim')
      refresh()
    } catch (err) {
      setSimResult(`Failed: ${err.message}`)
      addLog('warning', `Sim failed: ${err.message}`, 'Sim')
    } finally { setSimRunning(false) }
  }

  // delete scenario
  const deleteScenario = async (id, name) => {
    if (!window.confirm(`Delete "${name}" and all its data?`)) return
    addLog('info', `Deleting scenario "${name}"...`, 'System')
    try {
      await api.deleteScenario(id)
      api.removeUserScenario(id)
      addLog('success', `"${name}" deleted`, 'System')
      refresh()
    } catch (err) {
      addLog('warning', `Delete failed: ${err.message}`, 'System')
    }
  }

  // restart pipeline on existing scenario
  const restartDrill = async (sc) => {
    setPipeline({ stage: 'training_red', scenarioId: sc.id, scenarioName: sc.name, numHosts: sc.num_hosts })
    setPipelineLog([])
    addPipeLog(`Restarting drill for "${sc.name}"...`)
    addLog('info', `Restarting drill for "${sc.name}"...`, 'Pipeline')
    await runPipeline(sc.id, sc.name, sc.num_hosts, null)
  }

  // playground
  const startPlay = () => {
    setPlayActive(true)
    const red = Array.from({ length: 8 }, (_, i) => ({
      id: `r-${i}`, x: Math.random() * 80 + 10, y: Math.random() * 80 + 10,
      type: ['Scan', 'Exploit', 'Escalate', 'Lateral Move', 'Exfiltrate', 'Scan', 'Exploit', 'Escalate'][i]
    }))
    const blue = Array.from({ length: 6 }, (_, i) => ({
      id: `b-${i}`, x: Math.random() * 80 + 10, y: Math.random() * 80 + 10,
      type: ['Detect', 'Patch', 'Harden', 'Isolate', 'Restore', 'Detect'][i]
    }))
    setAgents({ red, blue, hits: [] })
  }

  const stopPlay = () => { setPlayActive(false); setAgents({ red: [], blue: [], hits: [] }) }

  useEffect(() => {
    if (!playActive) return
    const tick = setInterval(() => {
      setAgents(prev => {
        const red = prev.red.map(a => ({
          ...a, x: Math.max(5, Math.min(95, a.x + (Math.random() - 0.5) * 2.5)),
          y: Math.max(5, Math.min(95, a.y + (Math.random() - 0.5) * 2.5))
        }))
        const blue = prev.blue.map(a => ({
          ...a, x: Math.max(5, Math.min(95, a.x + (Math.random() - 0.5) * 1.8)),
          y: Math.max(5, Math.min(95, a.y + (Math.random() - 0.5) * 1.8))
        }))
        const newHits = []
        red.forEach(r => {
          const near = blue.find(b => Math.sqrt((r.x - b.x) ** 2 + (r.y - b.y) ** 2) < 15)
          if (near && Math.random() > 0.6) {
            newHits.push({
              id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              from: r.id, to: near.id,
              kind: Math.random() > 0.5 ? 'blocked' : 'detected',
              x: (r.x + near.x) / 2, y: (r.y + near.y) / 2
            })
          }
        })
        return { red, blue, hits: [...prev.hits.slice(-10), ...newHits].slice(-15) }
      })
    }, 200)
    return () => clearInterval(tick)
  }, [playActive])

  const logIcon = (l) => l === 'success' ? FaCheckCircle : l === 'warning' ? FaExclamationTriangle : FaInfoCircle
  const logColor = (l) => l === 'success' ? 'text-green-400' : l === 'warning' ? 'text-yellow-400' : 'text-blue-400'
  const logBorderColor = (l) => l === 'success' ? 'border-l-green-400' : l === 'warning' ? 'border-l-yellow-400' : 'border-l-blue-400'
  const logModBg = (l) => l === 'success' ? 'bg-green-900/40 text-green-300 border-green-700/50' : l === 'warning' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50' : 'bg-blue-900/40 text-blue-300 border-blue-700/50'
  const formatLogTime = (t) => { try { const d = new Date(t); return isNaN(d) ? t : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) } catch { return t } }

  const pipeStages = [
    { key: 'uploaded', label: 'Upload YAML' },
    { key: 'training_red', label: 'Train Red Agent' },
    { key: 'training_blue', label: 'Train Blue Agent' },
    { key: 'simulating', label: 'Run Simulation' },
    { key: 'done', label: 'Report Ready' },
  ]

  const getStageIdx = (stage) => pipeStages.findIndex(s => s.key === stage)

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-green-100 mb-1" style={font}>AI Orchestrator</h1>
          <p className="text-green-200/70" style={font}>
            Central brain — upload a topology and the system automatically trains agents, runs simulations, and generates your security report
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="flex items-center gap-2 px-4 py-2 border-2 border-green-900/50 text-green-200 hover:bg-green-900/30 transition-all" style={font}>
            <FaSync /> Refresh
          </button>
          <div className={`px-3 py-2 border-2 text-sm ${online ? 'border-green-600/50 text-green-400 bg-green-900/20' : 'border-red-600/50 text-red-400 bg-red-900/20'}`} style={font}>
            {online ? 'Backend Online' : 'Backend Offline'}
          </div>
        </div>
      </div>

      {/* ═══════ AUTO-DRILL PIPELINE ═══════ */}
      <div className="bg-gray-800/20 border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <FaRocket className="text-green-400 text-xl" />
          <h2 className="text-xl font-bold text-green-100" style={font}>Automated Security Drill</h2>
        </div>
        <p className="text-sm text-green-200/60 mb-4" style={font}>
          Upload your network topology YAML file. The orchestrator will automatically: train a Red (attacker) agent,
          train a Blue (defender) agent, run a simulation, and generate a security assessment report with specific
          recommendations for your network.
        </p>

        {/* Upload button */}
        <label className={`w-full flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed cursor-pointer transition-all ${
          uploading || pipeline ? 'border-yellow-600/50 text-yellow-300 cursor-wait' : 'border-green-600/50 text-green-200 hover:bg-green-900/20'
        }`} style={font}>
          <FaUpload />
          <span>{uploading ? 'Uploading...' : pipeline ? 'Pipeline running...' : 'Upload YAML Topology File'}</span>
          <input type="file" accept=".yaml,.yml" className="hidden" onChange={handleUpload} disabled={uploading || !!pipeline} />
        </label>

        {/* Pipeline progress bar */}
        {pipeline && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              {pipeStages.map((s, i) => {
                const currentIdx = getStageIdx(pipeline.stage)
                const isDone = pipeline.stage === 'done' ? true : i < currentIdx
                const isCurrent = s.key === pipeline.stage
                const isError = pipeline.stage === 'error' && i === currentIdx
                return (
                  <div key={s.key} className="flex items-center flex-1">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                        isDone ? 'border-green-500 bg-green-900/40 text-green-300' :
                        isCurrent ? 'border-yellow-500 bg-yellow-900/30 text-yellow-300 animate-pulse' :
                        isError ? 'border-red-500 bg-red-900/30 text-red-300' :
                        'border-green-900/50 text-green-200/30'
                      }`}>
                        {isDone ? <FaCheckCircle /> : i + 1}
                      </div>
                      <p className={`text-[10px] mt-1 text-center ${isDone ? 'text-green-400' : isCurrent ? 'text-yellow-300' : 'text-green-200/30'}`} style={font}>
                        {s.label}
                      </p>
                    </div>
                    {i < pipeStages.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 ${isDone ? 'bg-green-600' : 'bg-green-900/30'}`}></div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Pipeline log */}
            <div className="mt-4 max-h-48 overflow-y-auto space-y-1">
              {pipelineLog.map(entry => (
                <div key={entry.id} className="flex items-start gap-2 text-xs p-2 bg-gray-900/20 border border-green-900/20">
                  <span className="text-green-300/40 font-mono flex-shrink-0">{entry.time}</span>
                  <span className={
                    entry.status === 'success' ? 'text-green-400' :
                    entry.status === 'error' ? 'text-red-400' : 'text-green-200/70'
                  } style={font}>{entry.msg}</span>
                </div>
              ))}
            </div>

            {/* Launch Drill button — shown after upload */}
            {pipeline.stage === 'uploaded' && (
              <div className="mt-4 p-4 bg-green-900/20 border-2 border-green-600/50">
                <div className="flex items-center gap-2 mb-3">
                  <FaRocket className="text-green-400" />
                  <h3 className="text-green-100 font-bold" style={font}>Topology Uploaded Successfully</h3>
                </div>
                <p className="text-sm text-green-200/60 mb-4" style={font}>
                  "{pipeline.scenarioName}" — {pipeline.numHosts} hosts detected. Click below to start training Red and Blue DQN agents and run the simulation.
                </p>
                <button onClick={launchPipeline}
                  className="w-full flex items-center justify-center gap-2 px-4 py-4 border-2 border-green-600 text-green-100 bg-green-900/40 hover:bg-green-900/60 transition-all text-lg font-bold" style={font}>
                  <FaPlay /> Launch Drill
                </button>
              </div>
            )}

            {/* Done actions */}
            {pipeline.stage === 'done' && (
              <div className="mt-4 p-4 bg-green-900/20 border-2 border-green-600/50">
                <div className="flex items-center gap-2 mb-3">
                  <FaCheckCircle className="text-green-400" />
                  <h3 className="text-green-100 font-bold" style={font}>Drill Complete!</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-gray-900/30 p-3 border border-green-900/30">
                    <p className="text-xs text-green-200/50" style={font}>Steps</p>
                    <p className="text-lg font-bold text-green-100" style={font}>{pipeline.totalSteps}</p>
                  </div>
                  <div className="bg-gray-900/30 p-3 border border-red-900/30">
                    <p className="text-xs text-red-200/50" style={font}>Red Reward</p>
                    <p className="text-lg font-bold text-red-400" style={font}>{pipeline.totalRed}</p>
                  </div>
                  <div className="bg-gray-900/30 p-3 border border-blue-900/30">
                    <p className="text-xs text-blue-200/50" style={font}>Blue Reward</p>
                    <p className="text-lg font-bold text-blue-400" style={font}>{pipeline.totalBlue}</p>
                  </div>
                  <div className="bg-gray-900/30 p-3 border border-green-900/30">
                    <p className="text-xs text-green-200/50" style={font}>Winner</p>
                    <p className="text-lg font-bold text-green-100" style={font}>{pipeline.winner}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => nav('/analytics')}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-green-600/50 text-green-200 hover:bg-green-900/20 transition-all" style={font}>
                    <FaChartBar /> View Analytics & Results
                  </button>
                  <button onClick={() => nav('/report')}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-green-600 text-green-100 bg-green-900/30 hover:bg-green-900/50 transition-all" style={font}>
                    <FaFileAlt /> View Security Report
                  </button>
                </div>
                <button onClick={() => setPipeline(null)}
                  className="w-full mt-3 px-4 py-2 border border-green-900/40 text-green-200/50 text-xs hover:bg-green-900/20 transition-all" style={font}>
                  Start New Drill
                </button>
              </div>
            )}

            {pipeline.stage === 'error' && (
              <div className="mt-4 p-4 bg-red-900/20 border-2 border-red-600/50">
                <p className="text-red-300 text-sm" style={font}>Pipeline encountered an error. Check the log above for details.</p>
                <button onClick={() => setPipeline(null)}
                  className="mt-2 px-4 py-2 border border-red-600/50 text-red-200 hover:bg-red-900/20 transition-all text-sm" style={font}>
                  Reset Pipeline
                </button>
              </div>
            )}
          </div>
        )}

        {/* loaded scenarios */}
        {scenarios.length > 0 && !pipeline && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-green-200/50" style={font}>Uploaded topologies:</p>
            {scenarios.map(sc => (
              <div key={sc.id} className="flex items-center justify-between p-3 bg-gray-900/20 border border-green-900/30">
                <div className="flex items-center gap-2">
                  <FaServer className="text-green-400" />
                  <span className="text-green-200 text-sm" style={font}>{sc.name}</span>
                  <span className="text-green-200/40 text-xs" style={font}>({sc.num_hosts} hosts)</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => restartDrill(sc)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-green-600/50 text-green-200 text-xs hover:bg-green-900/30 transition-all" style={font}>
                    <FaSync className="text-[10px]" /> Re-run Drill
                  </button>
                  <button onClick={() => deleteScenario(sc.id, sc.name)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-red-600/50 text-red-300 text-xs hover:bg-red-900/20 transition-all" style={font}>
                    <FaStop className="text-[10px]" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* manual simulation */}
      <div className="bg-gray-800/20 border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <FaRocket className="text-red-400" />
          <h2 className="text-lg font-bold text-green-100" style={font}>Quick Simulation</h2>
        </div>
        <p className="text-sm text-green-200/60 mb-4" style={font}>
          Run a standalone Red vs Blue simulation (20 steps) using trained SB3 DQN models on any loaded scenario.
        </p>
        <div className="mb-4">
          <label className="block text-xs text-green-200/70 mb-1" style={font}>Scenario</label>
          <select value={simScenario} onChange={(e) => setSimScenario(e.target.value)}
            className="w-full bg-gray-900/50 border-2 border-green-900/50 text-green-100 px-3 py-2 text-sm focus:outline-none focus:border-green-700" style={font}>
            <option value="">-- select --</option>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name} ({s.num_hosts} hosts)</option>)}
          </select>
        </div>
        <button onClick={launchSim} disabled={simRunning || !simScenario}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 border-2 text-sm transition-all ${
            simRunning ? 'border-yellow-600/50 text-yellow-300 bg-yellow-900/20 cursor-wait'
              : 'border-green-600 text-green-100 bg-green-900/30 hover:bg-green-900/50'
          }`} style={font}>
          <FaPlay /> {simRunning ? 'Running...' : 'Launch Simulation'}
        </button>
        {simResult && (
          <div className="mt-3 p-3 bg-gray-900/30 border border-green-900/30 text-sm text-green-200" style={font}>{simResult}</div>
        )}
      </div>

      {/* MITRE ATT&CK action mapping reference */}
      <div className="bg-gray-800/20 border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <FaShieldAlt className="text-blue-400" />
          <h2 className="text-lg font-bold text-green-100" style={font}>MITRE ATT&CK Action Mapping</h2>
        </div>
        <p className="text-sm text-green-200/60 mb-4" style={font}>
          Each Red agent attack has a specific Blue agent counter-defense aligned with the MITRE ATT&CK framework:
        </p>
        <div className="space-y-2">
          {[
            { red: 'Scan', redDesc: 'Discover hosts and vulnerabilities', blue: 'Detect', blueDesc: 'Monitor network for suspicious scanning activity', icon: FaCrosshairs },
            { red: 'Exploit', redDesc: 'Exploit a CVE to compromise a host', blue: 'Patch', blueDesc: 'Apply security patches to close the vulnerability', icon: FaSkull },
            { red: 'Escalate', redDesc: 'Escalate privileges from user to root', blue: 'Harden', blueDesc: 'Harden host config to prevent privilege escalation', icon: FaExclamationTriangle },
            { red: 'Lateral Move', redDesc: 'Spread to an adjacent host', blue: 'Isolate', blueDesc: 'Isolate compromised host from the network', icon: FaNetworkWired },
            { red: 'Exfiltrate', redDesc: 'Steal sensitive data from host', blue: 'Restore', blueDesc: 'Wipe and restore host to clean state', icon: FaDatabase },
          ].map((pair, i) => {
            const Icon = pair.icon
            return (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-900/20 border border-green-900/30">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <FaSkull className="text-red-400 text-xs" />
                    <span className="text-red-400 font-bold text-sm" style={font}>{pair.red}</span>
                  </div>
                  <p className="text-red-200/50 text-xs" style={font}>{pair.redDesc}</p>
                </div>
                <FaArrowRight className="text-green-600/50 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <FaShieldAlt className="text-blue-400 text-xs" />
                    <span className="text-blue-400 font-bold text-sm" style={font}>{pair.blue}</span>
                  </div>
                  <p className="text-blue-200/50 text-xs" style={font}>{pair.blueDesc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* playground */}
      <div className="bg-gray-800/20 border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FaCrosshairs className="text-green-400" />
            <h2 className="text-xl font-bold text-green-100" style={font}>Attack vs Defense Playground</h2>
            <span className="text-xs px-2 py-0.5 border border-yellow-600/50 text-yellow-400 bg-yellow-900/20" style={font}>Future: Final Eval</span>
          </div>
          {!playActive ? (
            <button onClick={startPlay} className="flex items-center gap-2 px-4 py-2 border-2 border-green-600/50 text-green-200 bg-green-900/20 hover:bg-green-900/40 transition-all" style={font}>
              <FaPlay /> Start
            </button>
          ) : (
            <button onClick={stopPlay} className="flex items-center gap-2 px-4 py-2 border-2 border-red-600/50 text-red-200 bg-red-900/20 hover:bg-red-900/40 transition-all" style={font}>
              <FaStop /> Stop
            </button>
          )}
        </div>
        <p className="text-sm text-green-200/50 mb-4" style={font}>
          Visual demo of Red vs Blue agent interactions. Full interactive version planned for final evaluation.
        </p>

        {playActive ? (
          <>
            <div className="relative bg-gray-900/30 border-2 border-green-900/30 overflow-hidden" style={{ height: '420px' }}>
              <div className="absolute inset-0 opacity-20" style={{
                backgroundImage: 'linear-gradient(rgba(34,197,94,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.1) 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }}></div>
              {agents.red.map(a => (
                <div key={a.id} className="absolute transition-all duration-200" style={{ left: `${a.x}%`, top: `${a.y}%`, transform: 'translate(-50%,-50%)' }}>
                  <div className="relative group">
                    <FaSkull className="text-red-400 text-2xl animate-pulse" />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="bg-gray-800/90 border border-red-900/50 px-2 py-1 text-xs text-red-200 whitespace-nowrap" style={font}>{a.type}</div>
                    </div>
                  </div>
                </div>
              ))}
              {agents.blue.map(a => (
                <div key={a.id} className="absolute transition-all duration-200" style={{ left: `${a.x}%`, top: `${a.y}%`, transform: 'translate(-50%,-50%)' }}>
                  <div className="relative group">
                    <FaShieldAlt className="text-blue-400 text-2xl animate-pulse" />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="bg-gray-800/90 border border-blue-900/50 px-2 py-1 text-xs text-blue-200 whitespace-nowrap" style={font}>{a.type}</div>
                    </div>
                  </div>
                </div>
              ))}
              {agents.hits.map(h => (
                <div key={h.id} className="absolute animate-ping" style={{ left: `${h.x}%`, top: `${h.y}%`, transform: 'translate(-50%,-50%)' }}>
                  <div className={`w-4 h-4 rounded-full ${h.kind === 'blocked' ? 'bg-blue-500' : 'bg-yellow-500'}`}></div>
                </div>
              ))}
              <svg className="absolute inset-0 pointer-events-none w-full h-full" style={{ zIndex: 1 }}>
                {agents.hits.slice(-5).map(h => {
                  const r = agents.red.find(a => a.id === h.from)
                  const b = agents.blue.find(a => a.id === h.to)
                  if (!r || !b) return null
                  return (
                    <line key={`l-${h.id}`} x1={`${r.x}%`} y1={`${r.y}%`} x2={`${b.x}%`} y2={`${b.y}%`}
                      stroke={h.kind === 'blocked' ? '#3b82f6' : '#eab308'} strokeWidth="2"
                      strokeDasharray={h.kind === 'blocked' ? '0' : '5,5'} opacity="0.5" className="animate-pulse" />
                  )
                })}
              </svg>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="bg-gray-900/20 border border-red-900/30 p-3">
                <div className="text-xs text-red-200/70 mb-1" style={font}>Attackers</div>
                <div className="text-xl font-bold text-red-400" style={font}>{agents.red.length}</div>
              </div>
              <div className="bg-gray-900/20 border border-blue-900/30 p-3">
                <div className="text-xs text-blue-200/70 mb-1" style={font}>Defenders</div>
                <div className="text-xl font-bold text-blue-400" style={font}>{agents.blue.length}</div>
              </div>
              <div className="bg-gray-900/20 border border-yellow-900/30 p-3">
                <div className="text-xs text-yellow-200/70 mb-1" style={font}>Engagements</div>
                <div className="text-xl font-bold text-yellow-400" style={font}>{agents.hits.length}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-32 bg-gray-900/20 border border-green-900/30 text-green-200/40" style={font}>
            Click "Start" to launch the attack vs defense visualization
          </div>
        )}
      </div>

      {/* activity log */}
      <div className="bg-gray-800/20 border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <FaInfoCircle className="text-green-400" />
          <h2 className="text-xl font-bold text-green-100" style={font}>Orchestrator Activity Log</h2>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-center py-8 text-green-200/40" style={font}>No activity yet. Upload a YAML to start the automated drill.</div>
          ) : logs.map(entry => {
            const Icon = logIcon(entry.level)
            const color = logColor(entry.level)
            const borderColor = logBorderColor(entry.level)
            const modBg = logModBg(entry.level)
            return (
              <div key={entry.id} className={`flex items-start gap-3 p-3 bg-gray-900/20 border border-green-900/30 border-l-4 ${borderColor} hover:bg-gray-900/40 transition-all`}>
                <Icon className={`text-sm mt-1 flex-shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 border ${modBg}`} style={font}>{entry.mod}</span>
                    <span className="text-xs text-green-300/60 font-mono tracking-wide">{formatLogTime(entry.time)}</span>
                  </div>
                  <p className="text-sm text-green-200/80" style={font}>{entry.msg}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default AIOrchestrator
