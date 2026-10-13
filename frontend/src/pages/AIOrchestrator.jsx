import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaPlay, FaStop, FaPause, FaCheckCircle,
  FaExclamationTriangle, FaInfoCircle, FaShieldAlt,
  FaServer, FaChartBar, FaCrosshairs,
  FaSync, FaUpload, FaRocket, FaFileAlt, FaSkull,
  FaNetworkWired, FaSpinner, FaRedo, FaTerminal,
} from 'react-icons/fa'
import api from '../api'

const font = { fontFamily: 'Gugi, sans-serif' }

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
  const [pipeline, setPipeline] = useState(null)
  const [pipelineLog, setPipelineLog] = useState([])

  const pollRef = useRef(null)

  // import panel state
  const importFileRef = useRef(null)
  const [importMode, setImportMode]       = useState('yaml')
  const [importStep, setImportStep]       = useState('upload')
  const [importFile, setImportFile]       = useState(null)
  const [importParsing, setImportParsing] = useState(false)
  const [importSaving, setImportSaving]   = useState(false)
  const [importError, setImportError]     = useState('')
  const [importHosts, setImportHosts]     = useState([])
  const [importSens, setImportSens]       = useState({})
  const [importEdges, setImportEdges]     = useState([])
  const [edgeFrom, setEdgeFrom]           = useState('')
  const [edgeTo, setEdgeTo]               = useState('')
  const [importName, setImportName]       = useState('')

  const [drillMaxSteps, setDrillMaxSteps] = useState(50)

  // step-by-step simulation state (driven by the pipeline)
  const [simSteps, setSimSteps]       = useState([])
  const [simSession, setSimSession]   = useState(null)
  const [simRunning, setSimRunning]   = useState(false)
  const [simPaused, setSimPaused]     = useState(false)
  const [simProgress, setSimProgress] = useState(0)
  const [simStepLoading, setSimStepLoading] = useState(false)  // true while API call in flight
  const [simError, setSimError]       = useState(null)         // last step error message
  // Simulation speed is locked at 2x — selector was removed per user request.
  const simStopRef    = useRef(false)
  const simPauseRef   = useRef(false)
  const simSpeedRef   = useRef(2)
  // Set to true on component unmount so the step loop pauses without stopping the backend session.
  // Reset to false when the component remounts and resumes.
  const simUnmountRef = useRef(false)

  // Training control state — for an untrained topology the user can pause/stop
  // the long-running model.learn() call from the UI while it streams progress.
  const [trainPaused, setTrainPaused] = useState(false)

  // When a topology is freshly uploaded, fetch its training status so the
  // "Launch Drill" button can show whether training will run first.
  useEffect(() => {
    if (pipeline?.stage === 'uploaded' && pipeline.scenarioId && pipeline.trainStatus === undefined) {
      api.getTrainingStatus(pipeline.scenarioId)
        .then(st => setPipeline(p => p && p.scenarioId === pipeline.scenarioId ? { ...p, trainStatus: st } : p))
        .catch(() => setPipeline(p => p ? { ...p, trainStatus: null } : p))
    }
  }, [pipeline?.stage, pipeline?.scenarioId])

  useEffect(() => {
    // Restore any in-progress pipeline from a previous visit
    const savedRaw = localStorage.getItem('cyberDrill_pipeline')
    let savedPipeline = null
    if (savedRaw) {
      try {
        const parsed = JSON.parse(savedRaw)
        if (parsed?.stage && !['done', 'error'].includes(parsed.stage)) {
          savedPipeline = parsed
          setPipeline(parsed)
          setPipelineLog([{ id: Date.now(), time: new Date().toLocaleTimeString(), msg: 'Reconnecting to previous session...', status: 'info' }])
        } else {
          localStorage.removeItem('cyberDrill_pipeline')
        }
      } catch {
        localStorage.removeItem('cyberDrill_pipeline')
      }
    }
    refresh()
    if (savedPipeline) resumeFromSaved(savedPipeline)
    return () => { simUnmountRef.current = true; if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // Persist pipeline to localStorage so navigation away doesn't lose state
  useEffect(() => {
    if (!pipeline || pipeline.stage === 'done' || pipeline.stage === 'error') {
      localStorage.removeItem('cyberDrill_pipeline')
    } else {
      const { topoData, ...persistable } = pipeline  // skip large topology blob
      localStorage.setItem('cyberDrill_pipeline', JSON.stringify(persistable))
    }
  }, [pipeline])

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
      try { scList = await api.listScenarios(); setScenarios(scList) } catch {}
      try { trList = await api.listTrainingRuns(); setRuns(trList) } catch {}
      try { smList = await api.listSimulations(); setSims(smList) } catch {}
    }

    setOnline(isOnline)
    if (isOnline) addLog('success', `Online — ${scList.length} scenarios, ${smList.length} sims`, 'System')
  }

  // ═══ IMPORT PANEL HANDLERS ═══
  const resetImport = () => {
    setImportStep('upload'); setImportFile(null); setImportHosts([])
    setImportSens({}); setImportEdges([]); setEdgeFrom(''); setEdgeTo('')
    setImportName(''); setImportError('')
  }

  const addEdge = () => {
    if (!edgeFrom || !edgeTo || edgeFrom === edgeTo) return
    const already = importEdges.some(([a, b]) =>
      (a === edgeFrom && b === edgeTo) || (a === edgeTo && b === edgeFrom)
    )
    if (!already) setImportEdges(prev => [...prev, [edgeFrom, edgeTo]])
    setEdgeFrom(''); setEdgeTo('')
  }

  const removeEdge = (idx) => setImportEdges(prev => prev.filter((_, i) => i !== idx))

  const handleImportFile = (f) => {
    if (!f) return
    const isYaml = importMode === 'yaml'
    const ok = isYaml ? (f.name.endsWith('.yaml') || f.name.endsWith('.yml')) : f.name.endsWith('.xml')
    if (!ok) { setImportError(`Select a ${isYaml ? '.yaml / .yml' : 'nmap .xml'} file`); return }
    setImportFile(f); setImportError('')
    if (!isYaml) setImportName(f.name.replace(/\.xml$/i, '') + '_nmap')
  }

  const handleYamlImport = async () => {
    if (!importFile) return
    setUploading(true); setImportError('')
    try {
      const res = await api.uploadTopology(importFile)
      addLog('success', `"${res.name}" uploaded (${res.num_hosts} hosts)`, 'Import')
      let topoData = null
      try { topoData = await api.getScenario(res.id) } catch {}
      setPipeline({ stage: 'uploaded', scenarioId: res.id, scenarioName: res.name, numHosts: res.num_hosts, topoData })
      setPipelineLog([
        { id: Date.now(),     time: new Date().toLocaleTimeString(), msg: `Topology "${res.name}" registered — ${res.num_hosts} hosts`, status: 'success' },
        { id: Date.now() + 1, time: new Date().toLocaleTimeString(), msg: 'Ready to launch drill.', status: 'info' },
      ])
      resetImport(); await refresh()
    } catch (err) { setImportError(err.message) }
    finally { setUploading(false) }
  }

  const handleNmapParse = async () => {
    if (!importFile) return
    setImportParsing(true); setImportError('')
    try {
      const result = await api.parseNmap(importFile)
      const initSens = {}
      result.hosts.forEach(h => { initSens[h.key] = h.suggested_sensitivity })
      setImportHosts(result.hosts)
      setImportSens(initSens)
      setImportEdges(result.preview_edges || [])
      setEdgeFrom(result.hosts[0]?.key || '')
      setEdgeTo(result.hosts[1]?.key || '')
      setImportStep('review')
    } catch (err) { setImportError(err.message) }
    finally { setImportParsing(false) }
  }

  const handleNmapSave = async () => {
    if (!importName.trim()) { setImportError('Scenario name required'); return }
    setImportSaving(true); setImportError('')
    try {
      const filename = importName.trim().replace(/\s+/g, '_').toLowerCase() + '.yaml'
      const res = await api.saveNmap(filename, importHosts, importSens, importEdges)
      addLog('success', `"${res.name}" imported from nmap (${res.num_hosts} hosts)`, 'Import')
      let topoData = null
      try { topoData = await api.getScenario(res.id) } catch {}
      setPipeline({ stage: 'uploaded', scenarioId: res.id, scenarioName: res.name, numHosts: res.num_hosts, topoData })
      setPipelineLog([
        { id: Date.now(),     time: new Date().toLocaleTimeString(), msg: `nmap topology "${res.name}" registered — ${res.num_hosts} hosts`, status: 'success' },
        { id: Date.now() + 1, time: new Date().toLocaleTimeString(), msg: 'Ready to launch drill.', status: 'info' },
      ])
      resetImport(); await refresh()
    } catch (err) { setImportError(err.message) }
    finally { setImportSaving(false) }
  }

  // ═══ AUTO-DRILL PIPELINE ═══
  // If trained Red+Blue MaskablePPO models already exist for this topology, jump
  // straight to simulation. Otherwise run training (Red then Blue) first, so a
  // brand-new uploaded topology shows the IT-manager training-first workflow.
  const launchPipeline = async () => {
    if (!pipeline || !pipeline.scenarioId) return

    // Step 1 — check if the topology already has both trained models on disk
    let status = null
    try {
      status = await api.getTrainingStatus(pipeline.scenarioId)
    } catch (err) {
      addPipeLog(`Could not check training status: ${err.message}. Assuming training is needed.`, 'warning')
    }

    if (status && status.ready_to_simulate) {
      addPipeLog(`Pre-trained MaskablePPO models detected for "${pipeline.scenarioName}". Skipping training, launching simulation...`, 'success')
      addLog('info', 'Pre-trained agents loaded — running simulation directly', 'Pipeline')
      await createSimSession(pipeline.scenarioId, drillMaxSteps)
      return
    }

    // Step 2 — no trained models. Run the full training-then-simulation pipeline.
    addPipeLog(
      `No trained model pair on disk for this topology. Starting MaskablePPO training first — ` +
      `this is the workflow every new network goes through before its first drill.`
    )
    if (status) {
      addPipeLog(`  • Red model trained: ${status.red_trained ? 'YES' : 'NO'}   • Blue model trained: ${status.blue_trained ? 'YES' : 'NO'}`)
    }
    addLog('info', 'Launching training pipeline (Red → Blue → Simulate)', 'Pipeline')
    await runFullPipeline(pipeline.scenarioId, drillMaxSteps, status)
  }

  const runFullPipeline = async (scenarioId, maxSteps, status) => {
    // Scale training length with topology size so small demos finish quickly.
    const totalTimesteps = Math.max(2000, maxSteps * 100)
    const trainTarget = Math.ceil(totalTimesteps / 20)

    // ── Train Red ──
    if (!status || !status.red_trained) {
      setPipeline(p => ({ ...p, stage: 'training_red', trainEpisodes: 0, trainTarget }))
      setTrainPaused(false)
      addPipeLog(`Training Red (attacker) MaskablePPO — ${totalTimesteps.toLocaleString()} timesteps...`)
      try {
        const redRun = await api.startTraining({
          scenario_id: scenarioId, agent_role: 'red', algorithm: 'maskable_ppo',
          total_timesteps: totalTimesteps, max_steps_per_episode: 20,
        })
        setPipeline(p => p ? { ...p, redRunId: redRun.id } : p)
        const redResult = await pollTraining(redRun.id, (run) => {
          if (run.episodes_completed > 0) setPipeline(p => p ? { ...p, trainEpisodes: run.episodes_completed } : p)
        })
        if (redResult.status !== 'completed') {
          addPipeLog(`Red training failed: ${redResult.error_message || 'unknown error'}`, 'error')
          setPipeline(p => ({ ...p, stage: 'error' })); return
        }
        addPipeLog(`Red training complete — ${redResult.episodes_completed} episodes, mean reward: ${redResult.mean_reward?.toFixed(2) ?? 'N/A'}`, 'success')
      } catch (err) {
        addPipeLog(`Red training error: ${err.message}`, 'error')
        setPipeline(p => ({ ...p, stage: 'error' })); return
      }
    } else {
      addPipeLog('Red model already trained for this topology — skipping Red training stage.', 'success')
    }

    // ── Train Blue ──
    if (!status || !status.blue_trained) {
      setPipeline(p => ({ ...p, stage: 'training_blue', trainEpisodes: 0, trainTarget }))
      setTrainPaused(false)
      addPipeLog(`Training Blue (defender) MaskablePPO — ${totalTimesteps.toLocaleString()} timesteps...`)
      try {
        const blueRun = await api.startTraining({
          scenario_id: scenarioId, agent_role: 'blue', algorithm: 'maskable_ppo',
          total_timesteps: totalTimesteps, max_steps_per_episode: 20,
        })
        setPipeline(p => p ? { ...p, blueRunId: blueRun.id } : p)
        const blueResult = await pollTraining(blueRun.id, (run) => {
          if (run.episodes_completed > 0) setPipeline(p => p ? { ...p, trainEpisodes: run.episodes_completed } : p)
        })
        if (blueResult.status !== 'completed') {
          addPipeLog(`Blue training failed: ${blueResult.error_message || 'unknown error'}`, 'error')
          setPipeline(p => ({ ...p, stage: 'error' })); return
        }
        addPipeLog(`Blue training complete — ${blueResult.episodes_completed} episodes, mean reward: ${blueResult.mean_reward?.toFixed(2) ?? 'N/A'}`, 'success')
      } catch (err) {
        addPipeLog(`Blue training error: ${err.message}`, 'error')
        setPipeline(p => ({ ...p, stage: 'error' })); return
      }
    } else {
      addPipeLog('Blue model already trained for this topology — skipping Blue training stage.', 'success')
    }

    // ── Run simulation ──
    addPipeLog('Both agents trained. Launching live simulation...', 'success')
    await createSimSession(scenarioId, maxSteps)
  }

  const pollTraining = (runId, onProgress) => new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const run = await api.getTrainingRun(runId)
        if (onProgress) onProgress(run)
        if (run.status === 'completed' || run.status === 'failed') {
          clearInterval(interval); resolve(run)
        }
      } catch (err) { clearInterval(interval); reject(err) }
    }, 3000)
    pollRef.current = interval
  })

  const createSimSession = async (scenarioId, maxSteps) => {
    setPipeline(p => ({ ...p, stage: 'simulating' }))
    addPipeLog(`Creating step-by-step simulation session (${maxSteps} steps)...`)
    addLog('info', 'Creating live simulation session...', 'Pipeline')
    try {
      const session = await api.createSimulation(parseInt(scenarioId), maxSteps)
      addPipeLog(`Live simulation ready — click ▶ Play to start the Red vs Blue battle.`, 'success')
      addLog('success', `Live simulation created`, 'Pipeline')
      simStopRef.current = false; simPauseRef.current = false
      setSimSteps([]); setSimProgress(0); setSimRunning(false); setSimPaused(false)
      setSimStepLoading(false); setSimError(null)
      setSimSession(session)
      setPipeline(p => ({ ...p, stage: 'simulating', simSession: session, simMax: maxSteps }))
      return session
    } catch (err) {
      addPipeLog(`Simulation setup error: ${err.message}`, 'error')
      setPipeline(p => ({ ...p, stage: 'error' }))
      return null
    }
  }

  // Re-attach to a pipeline that was interrupted when the user navigated away.
  // Simulation auto-resumes; training re-attaches its polling loop.
  const resumeFromSaved = (saved) => {
    simUnmountRef.current = false

    if (saved.stage === 'simulating' && saved.simSession) {
      simStopRef.current = false; simPauseRef.current = false
      setSimSteps([]); setSimProgress(0); setSimRunning(false); setSimPaused(false)
      setSimStepLoading(false); setSimError(null)
      setSimSession(saved.simSession)
      addPipeLog('Reconnected — resuming simulation automatically...', 'success')
      addLog('info', 'Auto-resuming simulation after navigation', 'Pipeline')
      runStepLoop(saved.simSession, saved.simMax || drillMaxSteps)
    } else if (
      (saved.stage === 'training_red'  && saved.redRunId)  ||
      (saved.stage === 'training_blue' && saved.blueRunId)
    ) {
      addPipeLog('Reconnected — re-attaching to training pipeline...', 'info')
      setTrainPaused(false)
      reattachTraining(saved)
    } else {
      localStorage.removeItem('cyberDrill_pipeline')
      setPipeline(null)
    }
  }

  // Re-attach to an in-progress training pipeline after navigating back.
  // Polls the existing run IDs, skips stages already completed, then creates the sim session.
  const reattachTraining = async (saved) => {
    const { scenarioId, redRunId, blueRunId, simMax, trainTarget } = saved
    const maxSteps = simMax || drillMaxSteps
    const totalTimesteps = Math.max(2000, maxSteps * 100)
    const tgt = trainTarget || Math.ceil(totalTimesteps / 20)

    // Check what completed while we were away
    let status = null
    try { status = await api.getTrainingStatus(scenarioId) } catch {}

    if (status?.ready_to_simulate) {
      addPipeLog('Training finished while away — launching simulation now.', 'success')
      const sess = await createSimSession(scenarioId, maxSteps)
      if (sess) runStepLoop(sess, maxSteps)
      return
    }

    // Re-attach or start Red training if still needed
    if (!status?.red_trained) {
      setPipeline(p => p ? { ...p, stage: 'training_red', trainEpisodes: p.trainEpisodes || 0, trainTarget: tgt } : p)
      let runId = redRunId
      if (!runId) {
        addPipeLog('Starting Red training...', 'info')
        try {
          const run = await api.startTraining({ scenario_id: scenarioId, agent_role: 'red', algorithm: 'maskable_ppo', total_timesteps: totalTimesteps, max_steps_per_episode: 20 })
          runId = run.id
          setPipeline(p => p ? { ...p, redRunId: runId } : p)
        } catch (err) { addPipeLog(`Red training error: ${err.message}`, 'error'); setPipeline(p => ({ ...p, stage: 'error' })); return }
      } else {
        addPipeLog('Re-attaching to Red training...', 'info')
      }
      try {
        const result = await pollTraining(runId, run => { if (run.episodes_completed > 0) setPipeline(p => p ? { ...p, trainEpisodes: run.episodes_completed } : p) })
        if (result.status !== 'completed') { addPipeLog(`Red training failed: ${result.error_message || 'unknown'}`, 'error'); setPipeline(p => ({ ...p, stage: 'error' })); return }
        addPipeLog(`Red training complete — ${result.episodes_completed} episodes`, 'success')
      } catch (err) { addPipeLog(`Red training error: ${err.message}`, 'error'); setPipeline(p => ({ ...p, stage: 'error' })); return }
    } else {
      addPipeLog('Red model already trained — skipping.', 'success')
    }

    // Re-attach or start Blue training
    setPipeline(p => p ? { ...p, stage: 'training_blue', trainEpisodes: 0, trainTarget: tgt } : p)
    setTrainPaused(false)
    let blueId = blueRunId
    if (!blueId) {
      addPipeLog(`Starting Blue training — ${totalTimesteps.toLocaleString()} timesteps...`)
      try {
        const run = await api.startTraining({ scenario_id: scenarioId, agent_role: 'blue', algorithm: 'maskable_ppo', total_timesteps: totalTimesteps, max_steps_per_episode: 20 })
        blueId = run.id
        setPipeline(p => p ? { ...p, blueRunId: blueId } : p)
      } catch (err) { addPipeLog(`Blue training error: ${err.message}`, 'error'); setPipeline(p => ({ ...p, stage: 'error' })); return }
    } else {
      addPipeLog('Re-attaching to Blue training...', 'info')
    }
    try {
      const result = await pollTraining(blueId, run => { if (run.episodes_completed > 0) setPipeline(p => p ? { ...p, trainEpisodes: run.episodes_completed } : p) })
      if (result.status !== 'completed') { addPipeLog(`Blue training failed: ${result.error_message || 'unknown'}`, 'error'); setPipeline(p => ({ ...p, stage: 'error' })); return }
      addPipeLog(`Blue training complete — ${result.episodes_completed} episodes`, 'success')
    } catch (err) { addPipeLog(`Blue training error: ${err.message}`, 'error'); setPipeline(p => ({ ...p, stage: 'error' })); return }

    addPipeLog('Both agents trained. Launching simulation...', 'success')
    const sess = await createSimSession(scenarioId, maxSteps)
    if (sess) runStepLoop(sess, maxSteps)
  }

  // ═══ STEP-BY-STEP SIMULATION CONTROLLER ═══
  const runStepLoop = async (session, maxSteps, startFrom = 0) => {
    if (!session) return
    simStopRef.current   = false
    simPauseRef.current  = false
    // Reset unmount flag — it may be stale true from a previous navigation or
    // from React 18 StrictMode's double-invoke of the cleanup function, which
    // would silently kill the loop on the very second iteration (i=1).
    simUnmountRef.current = false
    setSimRunning(true); setSimPaused(false); setSimError(null)
    addLog('info', `Step loop started — ${maxSteps} steps max`, 'Sim')

    let steps = []
    let unmounted = false
    for (let i = startFrom; i < maxSteps; i++) {
      // Navigated away — leave backend session alive so we can resume on return
      if (simUnmountRef.current) { unmounted = true; break }
      if (simStopRef.current) {
        addLog('info', 'Simulation stopped by user', 'Sim')
        try { await api.stopSimulation(session.session_id) } catch {}
        break
      }
      // Pause loop — wait until Play is clicked to resume
      while (simPauseRef.current && !simStopRef.current) {
        if (simUnmountRef.current) { unmounted = true; break }
        setSimStepLoading(false)
        await new Promise(r => setTimeout(r, 200))
      }
      if (unmounted || simUnmountRef.current) { unmounted = true; break }
      if (simStopRef.current) {
        try { await api.stopSimulation(session.session_id) } catch {}
        break
      }

      try {
        setSimStepLoading(true)
        const res = await api.runStep(session.session_id)
        setSimStepLoading(false)
        steps = [...steps, res.step]
        setSimSteps([...steps])
        setSimProgress(i + 1)
        const ra = res.step?.red_action?.action  || 'idle'
        const ba = res.step?.blue_action?.action || 'idle'
        const fwBlocked = res.step?.red_action?.reason === 'firewall_blocked'
        const outcome = fwBlocked ? 'Firewall Block'
                       : res.step?.blue_reward > 0 ? 'Defended'
                       : res.step?.red_reward  > 0 ? 'Breached' : 'Neutral'
        addLog(
          fwBlocked ? 'success' : res.step?.blue_reward > 0 ? 'success'
            : res.step?.red_reward > 0 ? 'warning' : 'info',
          `Step ${i + 1}: Red=${ra.replace('_',' ')} → Blue=${ba.replace('_',' ')} [${outcome}]`, 'Sim'
        )
        if (res.steps_remaining <= 0) break

        // Check stop immediately after step returns — don't wait for next iteration
        if (simStopRef.current) {
          try { await api.stopSimulation(session.session_id) } catch {}
          break
        }

        // Inter-step delay — poll every 100 ms so Stop/Pause respond within 100 ms
        const baseDelay = 1500 / simSpeedRef.current
        const slices = Math.ceil(baseDelay / 100)
        for (let s = 0; s < slices; s++) {
          if (simStopRef.current || simPauseRef.current || simUnmountRef.current) break
          await new Promise(r => setTimeout(r, 100))
        }
      } catch (err) {
        setSimStepLoading(false)
        const msg = err.message || 'Unknown error'
        const isExpiry = msg.includes('Session expired') || msg.includes('No active session') || msg.includes('not running') || msg.includes('failed')
        if (isExpiry && pipeline?.scenarioId) {
          addLog('warning', 'Session expired — backend was restarted. Auto-creating new session...', 'Sim')
          addPipeLog('Session expired — recreating simulation session automatically...', 'warning')
          try {
            await createSimSession(pipeline.scenarioId, pipeline.simMax || drillMaxSteps)
            setSimError('Session was recreated — click Play to restart the drill.')
          } catch {
            setSimError('Session expired. Click Launch Drill to start a new drill.')
          }
        } else {
          const errorMsg = `Step ${i + 1} error: ${msg}`
          addLog('warning', errorMsg, 'Sim')
          setSimError(errorMsg)
        }
        break
      }
    }

    // Navigated away — don't finalize, component is gone; resumeFromSaved will restart on return
    if (unmounted) return

    // Finalize → fetch full sim and transition pipeline to 'done'
    let full = null
    try { full = await api.getSimulation(session.id) } catch {}
    setSimRunning(false); setSimPaused(false); setSimStepLoading(false)

    if (full) {
      const totalRed  = full.total_red_reward?.toFixed(2)  ?? '0'
      const totalBlue = full.total_blue_reward?.toFixed(2) ?? '0'
      const winner = parseFloat(totalRed) > parseFloat(totalBlue) ? 'Red (Attacker)' : 'Blue (Defender)'
      addPipeLog(`Drill complete — Red: ${totalRed} | Blue: ${totalBlue} | Winner: ${winner}`, 'success')
      addPipeLog('Pipeline complete! View Analytics or download the Security Report.', 'success')
      addLog('success', `Drill complete — winner: ${winner}`, 'Sim')
      setPipeline(p => p ? { ...p, stage: 'done', simId: full.id, totalRed, totalBlue, winner, totalSteps: full.total_steps } : p)
    } else {
      setPipeline(p => p ? { ...p, stage: 'done' } : p)
    }
    refresh()
  }

  const playSim = () => {
    if (!simSession) return
    if (!simRunning) {
      setSimError(null)
      // Resume from current progress if we stopped mid-way, otherwise start from 0
      const resumeFrom = simProgress > 0 ? simProgress : 0
      runStepLoop(simSession, pipeline?.simMax || drillMaxSteps, resumeFrom)
    } else if (simPaused) {
      simPauseRef.current = false; setSimPaused(false)
      addLog('info', 'Simulation resumed', 'Sim')
    }
  }

  const pauseSim = () => {
    if (!simRunning || simPaused) return
    simPauseRef.current = true; setSimPaused(true)
    addLog('info', 'Simulation paused — click ▶ to resume.', 'Sim')
  }

  const stopSim = async () => {
    simStopRef.current = true; simPauseRef.current = false
    setSimPaused(false); setSimStepLoading(false)  // immediate visual feedback
    addLog('info', 'Stop requested...', 'Sim')
    // If the loop is not active (e.g. exited after an error), abort the backend session directly
    if (!simRunning && simSession) {
      try { await api.stopSimulation(simSession.session_id) } catch {}
      setSimRunning(false)
      setSimStepLoading(false)
      addLog('info', 'Session closed.', 'Sim')
      setPipeline(p => p ? { ...p, stage: 'done' } : p)
    }
  }

  // Training controls — wired to the /training/{runId}/pause | resume | stop endpoints
  const _currentTrainRunId = () => {
    if (!pipeline) return null
    if (pipeline.stage === 'training_red')  return pipeline.redRunId  || null
    if (pipeline.stage === 'training_blue') return pipeline.blueRunId || null
    return null
  }
  const pauseTraining = async () => {
    const id = _currentTrainRunId()
    if (!id) return
    try { await api.pauseTraining(id); setTrainPaused(true); addPipeLog('Training paused.', 'info') }
    catch (e) { addPipeLog(`Pause failed: ${e.message}`, 'error') }
  }
  const resumeTrainingFn = async () => {
    const id = _currentTrainRunId()
    if (!id) return
    try { await api.resumeTraining(id); setTrainPaused(false); addPipeLog('Training resumed.', 'info') }
    catch (e) { addPipeLog(`Resume failed: ${e.message}`, 'error') }
  }
  const stopTraining = async () => {
    const id = _currentTrainRunId()
    if (!id) return
    if (!window.confirm('Stop training? The partially-trained model will be saved with what it has learned so far.')) return
    try {
      await api.stopTraining(id)
      addPipeLog('Training stop requested — finishing current episode then saving.', 'warning')
    } catch (e) { addPipeLog(`Stop failed: ${e.message}`, 'error') }
  }

  const deleteScenario = async (id, name) => {
    if (!window.confirm(`Delete "${name}" and all its data?`)) return
    addLog('info', `Deleting scenario "${name}"...`, 'System')
    try {
      await api.deleteScenario(id)
      api.removeUserScenario(id)
      addLog('success', `"${name}" deleted`, 'System')
      refresh()
    } catch (err) { addLog('warning', `Delete failed: ${err.message}`, 'System') }
  }

  const restartDrill = async (sc) => {
    setPipeline({ stage: 'idle', scenarioId: sc.id, scenarioName: sc.name, numHosts: sc.num_hosts, maxSteps: drillMaxSteps })
    setPipelineLog([])
    // Check training status first — if models are missing, run full pipeline instead of
    // jumping straight to simulation (which would fail with "no trained model" error).
    let status = null
    try { status = await api.getTrainingStatus(sc.id) } catch {}
    if (status && status.ready_to_simulate) {
      addPipeLog(`Re-running drill for "${sc.name}" (${drillMaxSteps} steps, pre-trained agents)...`)
      setPipeline(p => ({ ...p, stage: 'simulating' }))
      await createSimSession(sc.id, drillMaxSteps)
    } else {
      addPipeLog(`"${sc.name}" has no trained models yet — starting full Train → Simulate pipeline...`)
      setPipeline(p => ({ ...p, stage: 'idle' }))
      await runFullPipeline(sc.id, drillMaxSteps, status)
    }
  }

  const logIcon  = (l) => l === 'success' ? FaCheckCircle : l === 'warning' ? FaExclamationTriangle : FaInfoCircle
  const logColor = (l) => l === 'success' ? 'text-green-400' : l === 'warning' ? 'text-yellow-400' : 'text-blue-400'
  const logBorderColor = (l) => l === 'success' ? 'border-l-green-400' : l === 'warning' ? 'border-l-yellow-400' : 'border-l-blue-400'
  const logModBg = (l) => l === 'success' ? 'bg-green-900/40 text-green-300 border-green-700/50' : l === 'warning' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50' : 'bg-blue-900/40 text-blue-300 border-blue-700/50'

  // Training stages only appear in the stepper when training is actually needed —
  // for a pre-trained topology (like topology_50host) we want a clean 3-step view.
  const trainingActive = pipeline && (pipeline.stage === 'training_red' || pipeline.stage === 'training_blue')
  const pipeStages = trainingActive
    ? [
        { key: 'uploaded',      label: 'Upload Topology' },
        { key: 'training_red',  label: 'Train Red'       },
        { key: 'training_blue', label: 'Train Blue'      },
        { key: 'simulating',    label: 'Run Simulation'  },
        { key: 'done',          label: 'Report Ready'    },
      ]
    : [
        { key: 'uploaded',   label: 'Upload Topology' },
        { key: 'simulating', label: 'Run Simulation'  },
        { key: 'done',       label: 'Report Ready'    },
      ]
  const getStageIdx = (stage) => pipeStages.findIndex(s => s.key === stage)

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Scenarios',     val: scenarios.length, color: 'text-green-400'  },
          { label: 'Training Runs', val: runs.length,      color: 'text-purple-400' },
          { label: 'Simulations',   val: sims.length,      color: 'text-blue-400'   },
        ].map((s, i) => (
          <div key={i} className="bg-gray-800/20 border border-green-900/40 p-4 text-center">
            <p className="text-xs text-green-200/50 mb-1" style={font}>{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`} style={font}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* ═══ AUTO-DRILL PIPELINE ═══ */}
      <div className="bg-gray-800/20 border-2 border-green-900/50 p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <FaRocket className="text-green-400 text-xl" />
          <h2 className="text-xl font-bold text-green-100" style={font}>Automated Security Drill</h2>
        </div>
        <p className="text-sm text-green-200/60 mb-4" style={font}>
          Upload your network topology. The orchestrator loads your pre-trained MaskablePPO agents,
          runs a live Red vs Blue simulation, and generates a security assessment report.
        </p>

        {/* Import Panel */}
        {!pipeline && (
          <div className="space-y-3">
            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'yaml', icon: FaFileAlt,      label: 'Upload YAML',     sub: 'Direct topology file (.yaml/.yml)' },
                { key: 'xml',  icon: FaNetworkWired, label: 'Import nmap XML', sub: 'Auto-detect hosts, CVEs (.xml)'    },
              ].map(m => (
                <button key={m.key} onClick={() => { setImportMode(m.key); resetImport() }}
                  className={`flex items-center gap-2 p-3 border-2 text-left transition-all ${
                    importMode === m.key
                      ? 'border-green-600 bg-green-900/30 text-green-100'
                      : 'border-green-900/40 bg-gray-900/30 text-green-500 hover:border-green-700/60'
                  }`} style={font}>
                  <m.icon className={`text-lg flex-shrink-0 ${importMode === m.key ? 'text-green-400' : 'text-green-700'}`} />
                  <div>
                    <div className="text-xs font-bold">{m.label}</div>
                    <div className="text-[10px] opacity-60">{m.sub}</div>
                  </div>
                  {importMode === m.key && <span className="ml-auto w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />}
                </button>
              ))}
            </div>

            {importMode === 'xml' && importStep === 'upload' && (
              <div className="bg-black/30 border border-green-900/30 p-3 text-xs font-mono space-y-2">
                <div className="text-green-600">{'/* Step 1 — find your network range */'}</div>
                <div>
                  <span className="text-green-700">$ </span>
                  <span className="text-green-400">ipconfig</span>
                  <span className="text-green-700 ml-3"># Windows — look for IPv4 Address + Subnet Mask</span>
                </div>
                <div>
                  <span className="text-green-700">$ </span>
                  <span className="text-green-400">ip addr</span>
                  <span className="text-green-700 ml-3"># Linux / Mac</span>
                </div>
                <div className="border-t border-green-900/30 pt-2 text-green-600">{'/* Step 2 — scan all hosts (replace subnet with yours) */'}</div>
                <div>
                  <span className="text-green-700">$ </span>
                  <span className="text-green-400">nmap -sV -O -oX scan.xml 192.168.1.0/24</span>
                </div>
                <div className="text-green-700 text-[10px] pt-1">
                  ↳ /24 covers up to 254 hosts — only active devices appear in the XML
                </div>
              </div>
            )}

            {importError && (
              <div className="flex items-start gap-2 p-2 border border-red-700/40 bg-red-900/20 text-red-300 text-xs" style={font}>
                <FaExclamationTriangle className="flex-shrink-0 mt-0.5" />{importError}
              </div>
            )}

            {/* Upload step */}
            {importStep === 'upload' && (
              <>
                <label className={`w-full flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed cursor-pointer transition-all ${
                  importFile ? 'border-green-700 bg-green-900/10 text-green-200' : 'border-green-900/50 text-green-500 hover:border-green-700/70 hover:text-green-300'
                }`} style={font}>
                  {importFile
                    ? <><FaCheckCircle className="text-green-400" /><span className="truncate max-w-xs">{importFile.name}</span><span className="text-green-600 text-xs ml-1">({(importFile.size/1024).toFixed(1)} KB)</span></>
                    : <><FaUpload /><span>{importMode === 'yaml' ? 'Drop YAML or click to browse' : 'Drop nmap XML or click to browse'}</span></>}
                  <input ref={importFileRef} type="file" accept={importMode === 'yaml' ? '.yaml,.yml' : '.xml'}
                    className="hidden" onChange={e => handleImportFile(e.target.files[0])} />
                </label>
                <button
                  onClick={importMode === 'yaml' ? handleYamlImport : handleNmapParse}
                  disabled={!importFile || uploading || importParsing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-green-600/60 text-green-100 bg-green-900/30 hover:bg-green-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm" style={font}>
                  {uploading || importParsing
                    ? <><FaSpinner className="animate-spin" />{importMode === 'yaml' ? 'Uploading...' : 'Parsing...'}</>
                    : <><FaUpload />{importMode === 'yaml' ? 'Upload Topology' : 'Parse & Review Hosts'}</>}
                </button>
              </>
            )}

            {/* Review step (nmap only) */}
            {importStep === 'review' && (
              <div className="border border-green-900/40 bg-gray-900/30 p-4 space-y-4">
                <div className="flex items-center gap-3 text-sm" style={font}>
                  <FaServer className="text-green-500 text-base" />
                  <span className="text-green-300 font-bold">{importHosts.length} hosts detected</span>
                  {['high','medium','low'].map(s => {
                    const n = Object.values(importSens).filter(v => v === s).length
                    return n > 0 ? <span key={s} className={`font-bold ${s==='high'?'text-red-400':s==='medium'?'text-yellow-400':'text-green-400'}`}>{n} {s}</span> : null
                  })}
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                  {importHosts.map(h => (
                    <div key={h.key} className="flex items-center gap-3 px-3 py-2 bg-gray-900/40 border border-green-900/20 text-sm">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${h.os==='windows'?'bg-blue-400':'bg-yellow-400'}`} title={h.os} />
                      <span className="text-green-200 font-mono flex-1 truncate">{h.key}</span>
                      <span className="text-green-500 text-xs font-mono">{h.ip}</span>
                      <select value={importSens[h.key] || 'low'}
                        onChange={e => setImportSens(p => ({...p, [h.key]: e.target.value}))}
                        className={`text-xs px-2 py-1 border rounded-none bg-gray-900 cursor-pointer focus:outline-none ${
                          (importSens[h.key]||'low')==='high'   ? 'text-red-400 border-red-700/50'    :
                          (importSens[h.key]||'low')==='medium' ? 'text-yellow-400 border-yellow-700/50' :
                          'text-green-400 border-green-700/50'
                        }`} style={font}>
                        <option value="high">high</option>
                        <option value="medium">medium</option>
                        <option value="low">low</option>
                      </select>
                    </div>
                  ))}
                </div>

                {/* Edge editor */}
                <div className="border border-green-900/30 bg-gray-900/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-green-400 text-xs font-bold" style={font}>NETWORK EDGES ({importEdges.length})</span>
                    <span className="text-green-600 text-xs" style={font}>auto-generated — edit as needed</span>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {importEdges.length === 0 && (
                      <div className="text-green-700 text-xs text-center py-2" style={font}>No edges — add connections below</div>
                    )}
                    {importEdges.map(([a, b], idx) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-gray-900/60 border border-green-900/20 text-xs font-mono">
                        <span className="text-green-300">{a}</span>
                        <span className="text-green-600">↔</span>
                        <span className="text-green-300">{b}</span>
                        <button onClick={() => removeEdge(idx)} className="ml-auto text-red-500 hover:text-red-400 px-1 text-sm">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={edgeFrom} onChange={e => setEdgeFrom(e.target.value)}
                      className="flex-1 bg-black/40 border border-green-900/40 text-green-300 px-2 py-1.5 text-xs focus:outline-none" style={font}>
                      {importHosts.map(h => <option key={h.key} value={h.key}>{h.key}</option>)}
                    </select>
                    <span className="text-green-600 text-xs">↔</span>
                    <select value={edgeTo} onChange={e => setEdgeTo(e.target.value)}
                      className="flex-1 bg-black/40 border border-green-900/40 text-green-300 px-2 py-1.5 text-xs focus:outline-none" style={font}>
                      {importHosts.map(h => <option key={h.key} value={h.key}>{h.key}</option>)}
                    </select>
                    <button onClick={addEdge}
                      className="px-3 py-1.5 border border-green-700/50 text-green-400 text-xs hover:bg-green-900/30 transition-all" style={font}>+ Add</button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input value={importName} onChange={e => setImportName(e.target.value)}
                    className="flex-1 bg-black/40 border border-green-900/50 text-green-200 px-3 py-2 text-sm font-mono focus:outline-none focus:border-green-600"
                    placeholder="scenario_name" style={font} />
                  <span className="text-green-600 text-sm font-mono">.yaml</span>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setImportStep('upload')}
                    className="flex items-center gap-1.5 px-4 py-2.5 border border-green-900/50 text-green-500 text-sm hover:text-green-300 transition-all" style={font}>
                    <FaRedo className="text-xs" /> Back
                  </button>
                  <button onClick={handleNmapSave} disabled={importSaving}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-green-600/60 text-green-100 bg-green-900/30 hover:bg-green-900/50 disabled:opacity-40 text-sm transition-all" style={font}>
                    {importSaving ? <><FaSpinner className="animate-spin" /> Saving...</> : <><FaCheckCircle /> Save & Start Pipeline</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {pipeline && (
          <div className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-yellow-600/40 text-yellow-300/60 text-sm" style={font}>
            <FaRocket /> Pipeline active — {pipeline.scenarioName}
          </div>
        )}

        {/* Pipeline progress */}
        {pipeline && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              {pipeStages.map((s, i) => {
                const currentIdx = getStageIdx(pipeline.stage)
                const isDone    = pipeline.stage === 'done' ? true : i < currentIdx
                const isCurrent = s.key === pipeline.stage
                const isError   = pipeline.stage === 'error' && i === currentIdx
                return (
                  <div key={s.key} className="flex items-center flex-1">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                        isDone    ? 'border-green-500 bg-green-900/40 text-green-300' :
                        isCurrent ? 'border-yellow-500 bg-yellow-900/30 text-yellow-300 animate-pulse' :
                        isError   ? 'border-red-500 bg-red-900/30 text-red-300' :
                        'border-green-900/50 text-green-200/30'
                      }`}>
                        {isDone ? <FaCheckCircle /> : i + 1}
                      </div>
                      <p className={`text-[10px] mt-1 text-center ${isDone ? 'text-green-400' : isCurrent ? 'text-yellow-300' : 'text-green-200/30'}`} style={font}>
                        {s.label}
                      </p>
                    </div>
                    {i < pipeStages.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 ${isDone ? 'bg-green-600' : 'bg-green-900/30'}`} />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-4 max-h-48 overflow-y-auto space-y-1">
              {pipelineLog.map(entry => (
                <div key={entry.id} className="flex items-start gap-2 text-xs p-2 bg-gray-900/20 border border-green-900/20">
                  <span className="text-green-300/40 font-mono flex-shrink-0">{entry.time}</span>
                  <span className={entry.status === 'success' ? 'text-green-400' : entry.status === 'error' ? 'text-red-400' : 'text-green-200/70'} style={font}>{entry.msg}</span>
                </div>
              ))}
            </div>

            {(pipeline.stage === 'training_red' || pipeline.stage === 'training_blue') && (
              <div className="mt-4 p-4 bg-purple-900/10 border-2 border-purple-700/40 space-y-3">
                <div className="flex items-center gap-2">
                  <FaSpinner className="animate-spin text-purple-400" />
                  <h3 className="text-purple-200 text-sm font-bold" style={font}>
                    Training {pipeline.stage === 'training_red' ? 'Red (Attacker)' : 'Blue (Defender)'} Agent — MaskablePPO
                  </h3>
                </div>
                {pipeline.trainTarget > 0 && (
                  <>
                    <div className="flex justify-between text-xs text-green-200/50" style={font}>
                      <span>Episodes: <span className="text-purple-300 font-bold">{(pipeline.trainEpisodes || 0).toLocaleString()}</span> / ~{pipeline.trainTarget.toLocaleString()}</span>
                      <span>{Math.min(100, Math.round(((pipeline.trainEpisodes || 0) / pipeline.trainTarget) * 100))}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-900/50 border border-purple-900/40">
                      <div className="h-full bg-purple-500 transition-all duration-700"
                        style={{ width: `${Math.min(100, Math.round(((pipeline.trainEpisodes || 0) / pipeline.trainTarget) * 100))}%` }} />
                    </div>
                  </>
                )}
                <p className="text-xs text-green-200/40" style={font}>
                  {pipeline.stage === 'training_red'
                    ? 'Red agent learns to discover hosts, exploit vulnerabilities, and pivot through the network.'
                    : 'Blue agent learns to patch, isolate, harden, and deploy firewalls in response to Red\'s tactics.'}
                  &nbsp;Polling every 3 s.
                </p>
                {/* Training pause / resume / stop controls */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button onClick={pauseTraining} disabled={trainPaused}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-yellow-600/60 text-yellow-100 bg-yellow-900/20 hover:bg-yellow-900/40 disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-all" style={font}>
                    <FaPause className="text-xs" /> Pause Training
                  </button>
                  <button onClick={resumeTrainingFn} disabled={!trainPaused}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-green-600/60 text-green-100 bg-green-900/30 hover:bg-green-900/50 disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-all" style={font}>
                    <FaPlay className="text-xs" /> Resume Training
                  </button>
                  <button onClick={stopTraining}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-red-700/60 text-red-300 bg-red-900/20 hover:bg-red-900/40 text-sm transition-all" style={font}>
                    <FaStop className="text-xs" /> Stop Training
                  </button>
                  {trainPaused && (
                    <span className="px-2 py-0.5 self-center text-[10px] border border-yellow-600/50 text-yellow-300 bg-yellow-900/20" style={font}>PAUSED</span>
                  )}
                </div>
              </div>
            )}

            {pipeline.stage === 'simulating' && (
              <div className="mt-4 p-4 bg-red-900/10 border-2 border-red-700/40 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <FaCrosshairs className="text-red-400" />
                    <h3 className="text-red-200 text-sm font-bold" style={font}>
                      Live Red vs Blue Simulation
                    </h3>
                    {simRunning && (
                      <span className={`px-2 py-0.5 text-[10px] border ${simPaused
                        ? 'border-yellow-600/50 text-yellow-300 bg-yellow-900/20'
                        : 'border-red-600/50 text-red-300 bg-red-900/20 animate-pulse'}`} style={font}>
                        {simPaused ? 'PAUSED' : 'RUNNING'}
                      </span>
                    )}
                    {!simRunning && simProgress === 0 && (
                      <span className="px-2 py-0.5 text-[10px] border border-green-600/50 text-green-300 bg-green-900/20" style={font}>READY</span>
                    )}
                  </div>
                </div>

                {/* Step progress */}
                <div>
                  <div className="flex justify-between text-xs text-green-200/50 mb-1" style={font}>
                    <span>Step <span className="text-red-300 font-bold">{simProgress}</span> / {pipeline.simMax || drillMaxSteps}</span>
                    <span>{Math.round((simProgress / (pipeline.simMax || drillMaxSteps)) * 100)}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-900/50 border border-red-900/30">
                    <div className={`h-full transition-all duration-300 ${simPaused ? 'bg-yellow-500/60' : 'bg-red-500/80'}`}
                      style={{ width: `${Math.min(100, (simProgress / (pipeline.simMax || drillMaxSteps)) * 100)}%` }} />
                  </div>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap gap-2">
                  <button onClick={playSim} disabled={simRunning && !simPaused}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-green-600/60 text-green-100 bg-green-900/30 hover:bg-green-900/50 disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-all" style={font}>
                    <FaPlay className="text-xs" />
                    {simRunning && simPaused ? 'Resume' : simRunning ? 'Playing…' : simProgress > 0 ? 'Resume' : 'Play'}
                  </button>
                  <button onClick={pauseSim} disabled={!simRunning || simPaused}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-yellow-600/60 text-yellow-100 bg-yellow-900/20 hover:bg-yellow-900/40 disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-all" style={font}>
                    <FaPause className="text-xs" /> Pause
                  </button>
                  <button onClick={stopSim} disabled={!simSession}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-red-700/60 text-red-300 bg-red-900/20 hover:bg-red-900/40 disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-all" style={font}>
                    <FaStop className="text-xs" /> Stop Drill
                  </button>
                </div>
                {/* Step loading indicator */}
                {simStepLoading && (
                  <div className="flex items-center gap-2 text-xs text-green-200/60" style={font}>
                    <FaSpinner className="animate-spin text-green-400" />
                    <span>Running step {simProgress + 1}… agents computing actions</span>
                  </div>
                )}
                {/* Step error indicator */}
                {simError && !simRunning && (
                  <div className="flex items-start gap-2 p-2 bg-red-900/20 border border-red-700/40 text-red-300 text-xs" style={font}>
                    <FaExclamationTriangle className="flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Simulation interrupted — </span>{simError}
                      {!simError.includes('recreated') && !simError.includes('Launch Drill') && (
                        <span className="ml-2 text-red-200/60">Click Play to retry from step {simProgress + 1}.</span>
                      )}
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-green-200/40" style={font}>
                  Trained MaskablePPO agents compete step-by-step. <strong className="text-green-200/60">Play</strong> runs all steps automatically. <strong className="text-green-200/60">Pause</strong> suspends between steps. <strong className="text-green-200/60">Stop Drill</strong> ends the drill early and saves results.
                </p>

                {/* Per-step log */}
                {simSteps.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-80 overflow-y-auto pr-1">
                    {[...simSteps].reverse().map((s) => {
                      const ra = s.red_action?.action  || 'idle'
                      const ba = s.blue_action?.action || 'idle'
                      const counter = COUNTER_MAP[ra]
                      const isMatch = counter === ba
                      const fwBlocked = s.red_action?.reason === 'firewall_blocked'
                      const blueWon = (s.blue_reward || 0) > 0
                      const redWon  = (s.red_reward  || 0) > 0
                      return (
                        <div key={s.step_number} className={`p-2 border text-xs ${
                          fwBlocked ? 'border-cyan-700/50 bg-cyan-950/20' :
                          blueWon   ? 'border-blue-900/40 bg-blue-950/10' :
                          redWon    ? 'border-red-900/40 bg-red-950/10'   :
                                      'border-green-900/20 bg-gray-900/20'
                        }`}>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-green-300/60 font-mono font-bold w-12 flex-shrink-0" style={font}>#{s.step_number}</span>
                            {isMatch && <span className="px-1.5 py-0.5 bg-green-900/30 border border-green-700/40 text-green-400 text-[10px]" style={font}>✓ Counter Match</span>}
                            {fwBlocked && <span className="px-1.5 py-0.5 bg-cyan-900/30 border border-cyan-700/40 text-cyan-300 text-[10px]" style={font}>🛡 Firewall Blocked</span>}
                            <span className={`ml-auto text-[10px] font-bold ${
                              fwBlocked ? 'text-cyan-300' : blueWon ? 'text-blue-400' : redWon ? 'text-red-400' : 'text-green-200/40'
                            }`} style={font}>
                              {fwBlocked ? 'Firewall Block' : blueWon ? 'Defended' : redWon ? 'Breached' : 'Neutral'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-1">
                              <FaSkull className="text-red-400 text-[10px] flex-shrink-0" />
                              <span className="text-red-300 capitalize" style={font}>{ra.replace('_',' ')}</span>
                              {s.red_action?.target && <span className="text-red-200/30 text-[10px]">→ {s.red_action.target}</span>}
                              <span className={`ml-auto text-[10px] font-mono ${s.red_reward > 0 ? 'text-red-400' : 'text-green-200/30'}`}>
                                {s.red_reward > 0 ? `+${s.red_reward?.toFixed(1)}` : s.red_reward?.toFixed(1)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <FaShieldAlt className="text-blue-400 text-[10px] flex-shrink-0" />
                              <span className="text-blue-300 capitalize" style={font}>{ba.replace('_',' ')}</span>
                              {s.blue_action?.target && <span className="text-blue-200/30 text-[10px]">→ {s.blue_action.target}</span>}
                              <span className={`ml-auto text-[10px] font-mono ${s.blue_reward > 0 ? 'text-blue-400' : 'text-green-200/30'}`}>
                                {s.blue_reward > 0 ? `+${s.blue_reward?.toFixed(1)}` : s.blue_reward?.toFixed(1)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {pipeline.stage === 'uploaded' && (
              <div className="mt-4 p-4 bg-green-900/20 border-2 border-green-600/50 space-y-4">
                <div className="flex items-center gap-2">
                  <FaCheckCircle className="text-green-400" />
                  <h3 className="text-green-100 font-bold" style={font}>Topology Ready — {pipeline.scenarioName}</h3>
                  <span className="text-green-200/40 text-xs" style={font}>({pipeline.numHosts} hosts)</span>
                </div>
                {pipeline.trainStatus === undefined && (
                  <p className="text-sm text-green-200/60" style={font}>Checking trained model availability for this topology...</p>
                )}
                {pipeline.trainStatus && pipeline.trainStatus.ready_to_simulate && (
                  <div className="bg-green-900/20 border border-green-700/50 p-3 text-sm" style={font}>
                    <FaCheckCircle className="inline mr-2 text-green-400" />
                    <span className="text-green-200">Pre-trained MaskablePPO models detected for this topology.</span>
                    <span className="text-green-200/60"> Clicking Launch will skip training and go straight to the live simulation.</span>
                  </div>
                )}
                {pipeline.trainStatus && !pipeline.trainStatus.ready_to_simulate && (
                  <div className="bg-purple-900/20 border border-purple-700/50 p-3 text-sm" style={font}>
                    <FaSpinner className="inline mr-2 text-purple-400" />
                    <span className="text-purple-200">This topology has no trained agents yet.</span>
                    <span className="text-purple-200/70"> Clicking Launch will first train Red and Blue MaskablePPO agents on this network, then run the simulation — the same workflow any new customer goes through with their own topology.</span>
                    <div className="mt-2 text-[11px] text-purple-300/70">
                      Red trained: {pipeline.trainStatus.red_trained ? '✓' : '✗'} &nbsp;&nbsp; Blue trained: {pipeline.trainStatus.blue_trained ? '✓' : '✗'}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-green-200/70 mb-1" style={font}>Simulation Steps</label>
                    <select value={drillMaxSteps} onChange={e => setDrillMaxSteps(parseInt(e.target.value))}
                      className="w-full bg-gray-900/50 border-2 border-green-900/50 text-green-100 px-3 py-2 text-sm focus:outline-none focus:border-green-700" style={font}>
                      <option value={10}>10 steps (quick test)</option>
                      <option value={20}>20 steps</option>
                      <option value={50}>50 steps (recommended)</option>
                      <option value={100}>100 steps (deep drill)</option>
                    </select>
                    <p className="text-[10px] text-green-200/30 mt-1" style={font}>More steps = more realistic scenario</p>
                  </div>
                  <div className="bg-gray-900/30 border border-purple-900/40 p-3 flex flex-col justify-center">
                    <p className="text-xs text-green-200/50 mb-1" style={font}>Agents</p>
                    <p className="text-base font-bold text-purple-300" style={font}>MaskablePPO</p>
                    <p className="text-[10px] text-purple-300/50 mt-0.5" style={font}>
                      {pipeline.trainStatus?.ready_to_simulate ? 'Pre-trained · Ready to deploy' : 'Will train on launch'}
                    </p>
                  </div>
                </div>
                <button onClick={launchPipeline}
                  className="w-full flex items-center justify-center gap-2 px-4 py-4 border-2 border-green-600 text-green-100 bg-green-900/40 hover:bg-green-900/60 transition-all text-lg font-bold" style={font}>
                  <FaPlay /> {pipeline.trainStatus && !pipeline.trainStatus.ready_to_simulate
                    ? `Train Agents & Launch Drill (${drillMaxSteps} steps)`
                    : `Launch Drill (${drillMaxSteps} steps)`}
                </button>
                <p className="text-[10px] text-green-200/40 text-center" style={font}>
                  {pipeline.trainStatus && !pipeline.trainStatus.ready_to_simulate
                    ? 'Training takes a few minutes for small topologies. You can stop it from this page at any time.'
                    : 'Loads your trained MaskablePPO models — no new training. Click Play to start the Red vs Blue battle.'}
                </p>
              </div>
            )}

            {pipeline.stage === 'done' && (
              <div className="mt-4 p-4 bg-green-900/20 border-2 border-green-600/50">
                <div className="flex items-center gap-2 mb-3">
                  <FaCheckCircle className="text-green-400" />
                  <h3 className="text-green-100 font-bold" style={font}>Drill Complete!</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Steps',      val: pipeline.totalSteps, color: 'text-green-100', border: 'border-green-900/30' },
                    { label: 'Red Reward', val: pipeline.totalRed,   color: 'text-red-400',   border: 'border-red-900/30'   },
                    { label: 'Blue Reward',val: pipeline.totalBlue,  color: 'text-blue-400',  border: 'border-blue-900/30'  },
                    { label: 'Winner',     val: pipeline.winner,     color: 'text-green-100', border: 'border-green-900/30' },
                  ].map((c, i) => (
                    <div key={i} className={`bg-gray-900/30 p-3 border ${c.border}`}>
                      <p className="text-xs text-green-200/50" style={font}>{c.label}</p>
                      <p className={`text-lg font-bold ${c.color}`} style={font}>{c.val}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => nav('/analytics')}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-green-600/50 text-green-200 hover:bg-green-900/20 transition-all" style={font}>
                    <FaChartBar /> View Analytics
                  </button>
                  <button onClick={() => nav('/report')}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-green-600 text-green-100 bg-green-900/30 hover:bg-green-900/50 transition-all" style={font}>
                    <FaFileAlt /> Security Report
                  </button>
                </div>
                <button onClick={() => { setPipeline(null); resetImport() }}
                  className="w-full mt-3 px-4 py-2 border border-green-900/40 text-green-200/50 text-xs hover:bg-green-900/20 transition-all" style={font}>
                  Start New Drill
                </button>
              </div>
            )}

            {pipeline.stage === 'error' && (
              <div className="mt-4 p-4 bg-red-900/20 border-2 border-red-600/50">
                <p className="text-red-300 text-sm" style={font}>Pipeline error. Check the log above.</p>
                <button onClick={() => setPipeline(null)}
                  className="mt-2 px-4 py-2 border border-red-600/50 text-red-200 hover:bg-red-900/20 transition-all text-sm" style={font}>
                  Reset Pipeline
                </button>
              </div>
            )}
          </div>
        )}

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
                  {!sc.is_demo && (
                    <button onClick={() => deleteScenario(sc.id, sc.name)}
                      className="flex items-center gap-1 px-3 py-1.5 border border-red-600/50 text-red-300 text-xs hover:bg-red-900/20 transition-all" style={font}>
                      <FaStop className="text-[10px]" /> Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ SYSTEM LOG ═══ */}
      <div className="bg-gray-800/20 border-2 border-green-900/40 p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <FaTerminal className="text-green-400" />
          <h2 className="text-lg font-bold text-green-100" style={font}>System Log</h2>
          <button onClick={() => setLogs([])} className="ml-auto text-xs text-green-200/30 hover:text-green-200/60 transition-colors" style={font}>Clear</button>
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {logs.length === 0 && (
            <p className="text-green-200/30 text-xs text-center py-4" style={font}>No activity yet</p>
          )}
          {logs.map(log => {
            const Icon = logIcon(log.level)
            return (
              <div key={log.id} className={`flex items-start gap-2 px-3 py-2 border-l-2 bg-gray-900/20 ${logBorderColor(log.level)}`}>
                <Icon className={`${logColor(log.level)} text-xs flex-shrink-0 mt-0.5`} />
                <span className="text-green-200/30 text-xs font-mono flex-shrink-0">{log.time}</span>
                <span className={`text-xs px-1.5 py-0.5 border rounded text-[10px] flex-shrink-0 ${logModBg(log.level)}`} style={font}>{log.mod}</span>
                <span className="text-green-100/80 text-xs flex-1" style={font}>{log.msg}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default AIOrchestrator
