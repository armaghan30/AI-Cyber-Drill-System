import React, { useState, useEffect, useRef } from 'react'
import { FaPlay, FaStop, FaShieldAlt, FaNetworkWired, FaInfoCircle, FaArrowRight, FaSkull, FaBolt } from 'react-icons/fa'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import api from '../api'

// MITRE ATT&CK aligned action descriptions
const RED_ACTION_DESCRIPTIONS = {
  scan: 'Scanned the network to discover vulnerable hosts (MITRE: Discovery)',
  exploit: 'Exploited a CVE vulnerability on the target (MITRE: Initial Access)',
  escalate: 'Escalated privileges from user to root (MITRE: Privilege Escalation)',
  lateral_move: 'Moved laterally to adjacent host (MITRE: Lateral Movement)',
  exfiltrate: 'Exfiltrated sensitive data from host (MITRE: Exfiltration)',
  idle: 'No action taken this step',
}

const BLUE_ACTION_DESCRIPTIONS = {
  detect: 'Monitored network for intrusion detection (Counter: Scan)',
  patch: 'Applied security patches to close CVEs (Counter: Exploit)',
  harden: 'Hardened host config against privilege escalation (Counter: Escalate)',
  isolate: 'Isolated host from network to prevent lateral movement (Counter: Lateral Move)',
  restore: 'Restored compromised host to clean state (Counter: Exfiltrate)',
  idle: 'No action taken this step',
}

// MITRE ATT&CK counter-action mapping: Red attack → Blue defense
const COUNTER_ACTION_MAP = {
  scan: 'detect', exploit: 'patch', escalate: 'harden',
  lateral_move: 'isolate', exfiltrate: 'restore',
}

// Generates a contextual explanation for why a reward was given based on action and reward value
function buildRewardExplanation(actionName, rewardValue, agentRole) {
  if (rewardValue === 0) return 'No effect this step'

  if (agentRole === 'red') {
    if (rewardValue > 0) {
      const successReasons = {
        scan: 'for discovering a vulnerable host',
        exploit: 'for successful exploit on target',
        escalate: 'for gaining elevated privileges',
        lateral_move: 'for reaching a new host',
        exfiltrate: 'for extracting sensitive data',
      }
      return successReasons[actionName] || 'for successful offensive action'
    } else {
      const failureReasons = {
        scan: 'scan was detected or found nothing',
        exploit: 'exploit attempt was blocked',
        escalate: 'privilege escalation failed',
        lateral_move: 'lateral movement was prevented',
        exfiltrate: 'exfiltration was intercepted',
      }
      return failureReasons[actionName] || 'offensive action failed or was penalized'
    }
  }

  // Blue agent reward explanations
  if (rewardValue > 0) {
    const successReasons = {
      detect: 'for detecting compromised host (countered Scan)',
      patch: 'for patching CVE before exploit (countered Exploit)',
      harden: 'for hardening against privilege escalation (countered Escalate)',
      isolate: 'for isolating host to block lateral movement (countered Lateral Move)',
      restore: 'for restoring compromised host (countered Exfiltrate)',
    }
    return successReasons[actionName] || 'for successful defensive action'
  } else {
    const failureReasons = {
      detect: 'detection scan missed the intrusion',
      patch: 'patch was unnecessary or caused downtime',
      harden: 'hardening had no effect this step',
      isolate: 'isolation disrupted legitimate services',
      restore: 'restore was unnecessary or costly',
    }
    return failureReasons[actionName] || 'defensive action was ineffective or costly'
  }
}

// Builds a specific description of what happened, including target host if available
function buildActionNarrative(actionData, descriptionMap) {
  const actionName = actionData?.action || 'idle'
  const targetHost = actionData?.target || actionData?.host || null
  const baseDescription = descriptionMap[actionName] || `Performed action: ${actionName}`

  if (targetHost) {
    return `${baseDescription} (target: ${targetHost})`
  }
  return baseDescription
}

const gugiFont = { fontFamily: 'Gugi, sans-serif' }

const AttackSimulator = () => {
  const [scenarios, setScenarios] = useState([])
  const [scenarioId, setScenarioId] = useState('')
  const [maxSteps, setMaxSteps] = useState(10)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [firewallData, setFirewallData] = useState(null)

  // step-by-step live state
  const [simSession, setSimSession] = useState(null)   // { id, session_id }
  const [liveSteps, setLiveSteps] = useState([])        // steps as they arrive
  const [stepProgress, setStepProgress] = useState(0)  // current step count
  const [stopping, setStopping] = useState(false)
  const stopRef = useRef(false)                         // flag for the loop

  useEffect(() => {
    api.listScenarios().then((list) => {
      setScenarios(list)
      if (list.length > 0) setScenarioId(list[0].id)
    }).catch(() => {})
  }, [])

  // Build cumulative reward timeline data for the area chart.
  // Each data point includes that step's individual reward plus the running total.
  const rewardTimeline = result?.steps?.map((stepData, stepIndex) => {
    const cumulativeRedReward = result.steps
      .slice(0, stepIndex + 1)
      .reduce((runningTotal, s) => runningTotal + (s.red_reward || 0), 0)
    const cumulativeBlueReward = result.steps
      .slice(0, stepIndex + 1)
      .reduce((runningTotal, s) => runningTotal + (s.blue_reward || 0), 0)

    return {
      step: stepData.step_number,
      redCumulativeReward: +cumulativeRedReward.toFixed(2),
      blueCumulativeReward: +cumulativeBlueReward.toFixed(2),
      redStepReward: +(stepData.red_reward || 0).toFixed(2),
      blueStepReward: +(stepData.blue_reward || 0).toFixed(2),
    }
  }) || []

  // Count how many times each action was taken by a given agent role
  const getActionCounts = (agentRole) => {
    if (!result?.steps) return []
    const actionCountMap = {}
    result.steps.forEach((stepData) => {
      const actionName = agentRole === 'red'
        ? (stepData.red_action?.action || 'unknown')
        : (stepData.blue_action?.action || 'unknown')
      actionCountMap[actionName] = (actionCountMap[actionName] || 0) + 1
    })
    return Object.entries(actionCountMap).map(([actionName, count]) => ({
      name: actionName,
      value: count,
    }))
  }

  const startSim = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    setFirewallData(null)
    setLiveSteps([])
    setStepProgress(0)
    setStopping(false)
    stopRef.current = false

    try {
      // 1. create session
      const session = await api.createSimulation(parseInt(scenarioId), maxSteps)
      setSimSession({ id: session.id, session_id: session.session_id })

      let steps = []
      // 2. run steps one-by-one so user sees live progress
      for (let i = 0; i < maxSteps; i++) {
        if (stopRef.current) break

        const stepRes = await api.runStep(session.session_id)
        const s = stepRes.step
        steps = [...steps, s]
        setLiveSteps(steps)
        setStepProgress(i + 1)

        if (stepRes.simulation_status === 'completed' || stepRes.steps_remaining <= 0) break

        // tiny pause so browser can re-render between steps
        await new Promise(r => setTimeout(r, 80))
      }

      // 3. if user hit stop, call stop endpoint
      if (stopRef.current) {
        setStopping(true)
        await api.stopSimulation(session.session_id).catch(() => {})
        setStopping(false)
      }

      // 4. fetch full result from DB (includes all steps + rewards)
      const full = await api.getSimulation(session.id)
      setResult(full)

      // 5. fetch firewall analysis
      if (session.id) {
        api.firewallAnalysis(session.id).then(setFirewallData).catch(() => {})
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
      stopRef.current = false
    }
  }

  const stopSim = () => {
    stopRef.current = true
    setStopping(true)
  }

  const resetSim = () => {
    setResult(null)
    setError(null)
    setFirewallData(null)
    setLiveSteps([])
    setStepProgress(0)
    setSimSession(null)
  }

  const winner = result
    ? (result.total_red_reward > result.total_blue_reward ? 'RED' : 'BLUE')
    : null

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-green-100 mb-2" style={gugiFont}>Attack Simulator</h1>
          <p className="text-green-200/70" style={gugiFont}>Run Red vs Blue agent simulations on network topologies</p>
        </div>
        <div className="flex items-center space-x-3">
          {!running && !result && (
            <button onClick={startSim} disabled={!scenarioId}
              className="flex items-center space-x-2 px-6 py-3 bg-transparent border-2 border-green-900/50 text-green-100 hover:bg-green-900/30 transition-all disabled:opacity-50"
              style={gugiFont}>
              <FaPlay /><span>Start Simulation</span>
            </button>
          )}
          {running && !stopping && (
            <button onClick={stopSim}
              className="flex items-center space-x-2 px-6 py-3 border-2 border-red-700/70 text-red-300 hover:bg-red-900/20 transition-all"
              style={gugiFont}>
              <FaStop /><span>Stop</span>
            </button>
          )}
          {running && (
            <div className="flex items-center space-x-2 px-4 py-3 border-2 border-green-900/50 text-green-200/70" style={gugiFont}>
              <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></div>
              <span>{stopping ? 'Stopping...' : `Step ${stepProgress} / ${maxSteps}`}</span>
            </div>
          )}
          {result && !running && (
            <button onClick={resetSim}
              className="flex items-center space-x-2 px-6 py-3 bg-transparent border-2 border-green-900/50 text-green-100 hover:bg-green-900/30 transition-all"
              style={gugiFont}>
              <FaStop /><span>New Simulation</span>
            </button>
          )}
        </div>
      </div>

      {/* "What's Happening" info box for non-technical users */}
      <div className="bg-gray-800/30 border-2 border-green-900/50 p-5 shadow-xl flex items-start space-x-4">
        <FaInfoCircle className="text-green-400 text-2xl mt-1 flex-shrink-0" />
        <div>
          <h2 className="text-lg font-bold text-green-100 mb-1" style={gugiFont}>What's Happening?</h2>
          <p className="text-green-200/70 text-sm leading-relaxed" style={gugiFont}>
            This simulator runs AI-powered Red (attacker) and Blue (defender) agents on a virtual network topology.
            Each agent was trained separately with a <span className="text-green-300 font-bold">curriculum-training</span>{' '}
            approach — the Red agent is trained first against a rule-based defender, then the Blue agent is trained against
            the now-fixed Red agent. At drill time the two trained policies take turns each step: the Red agent picks an
            action, then the Blue agent responds. Their rewards are tracked to show which side performed better overall.
          </p>
        </div>
      </div>

      {/* Simulation Configuration Panel */}
      <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
        <h2 className="text-xl font-bold text-green-100 mb-4" style={gugiFont}>Simulation Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-green-200/70 mb-2" style={gugiFont}>Select Scenario</label>
            <select
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
              className="w-full bg-gray-900/50 border-2 border-green-900/50 text-green-100 px-4 py-2 focus:outline-none focus:border-green-800"
              style={gugiFont}
            >
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name} ({scenario.num_hosts} hosts)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-green-200/70 mb-2" style={gugiFont}>Max Steps</label>
            <input
              type="number"
              value={maxSteps}
              onChange={(e) => setMaxSteps(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
              min={1}
              max={100}
              className="w-full bg-gray-900/50 border-2 border-green-900/50 text-green-100 px-4 py-2 focus:outline-none focus:border-green-800"
              style={gugiFont}
            />
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/20 border-2 border-red-700/50 p-4 text-red-300" style={gugiFont}>
          Error: {error}. Make sure the backend is running on port 8000.
        </div>
      )}

      {/* Live Progress Panel */}
      {running && (
        <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-green-100" style={gugiFont}>
              {stopping ? 'Stopping simulation...' : 'Simulation Running Live'}
            </h2>
            <span className="text-green-300/60 text-sm font-mono">{stepProgress} / {maxSteps} steps</span>
          </div>
          {/* progress bar */}
          <div className="w-full h-3 bg-gray-900/60 border border-green-900/40 mb-4 overflow-hidden">
            <div className="h-full bg-green-500/60 transition-all duration-200"
              style={{ width: `${maxSteps > 0 ? (stepProgress / maxSteps) * 100 : 0}%` }} />
          </div>
          {/* last few live steps */}
          {liveSteps.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {liveSteps.slice(-6).map((s) => {
                const ra = s.red_action?.action || 'idle'
                const ba = s.blue_action?.action || 'idle'
                const rt = s.red_action?.target || '—'
                const bt = s.blue_action?.target || '—'
                return (
                  <div key={s.step_number} className="grid grid-cols-[40px_1fr_1fr] gap-2 px-2 py-1.5 bg-gray-900/30 border border-green-900/20 text-xs animate-fade-in">
                    <span className="text-green-300/60 font-mono" style={gugiFont}>#{s.step_number}</span>
                    <div className="flex items-center gap-1">
                      <FaSkull className="text-red-400 text-[9px]" />
                      <span className="text-red-300 capitalize" style={gugiFont}>{ra.replace('_',' ')}</span>
                      <span className="text-red-200/40 truncate">{rt}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FaShieldAlt className="text-blue-400 text-[9px]" />
                      <span className="text-blue-300 capitalize" style={gugiFont}>{ba.replace('_',' ')}</span>
                      <span className="text-blue-200/40 truncate">{bt}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ========== SIMULATION RESULTS ========== */}
      {result && (
        <>
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
              <p className="text-sm text-green-200/70 mb-1" style={gugiFont}>Total Steps</p>
              <p className="text-3xl font-bold text-green-100" style={gugiFont}>{result.total_steps}</p>
            </div>
            <div className="bg-gray-800/30 border-2 border-red-900/50 p-6 shadow-xl">
              <p className="text-sm text-red-200/70 mb-1" style={gugiFont}>Red Total Reward</p>
              <p className="text-3xl font-bold text-red-400" style={gugiFont}>{result.total_red_reward?.toFixed(2)}</p>
            </div>
            <div className="bg-gray-800/30 border-2 border-blue-900/50 p-6 shadow-xl">
              <p className="text-sm text-blue-200/70 mb-1" style={gugiFont}>Blue Total Reward</p>
              <p className="text-3xl font-bold text-blue-400" style={gugiFont}>{result.total_blue_reward?.toFixed(2)}</p>
            </div>
            <div className={`bg-gray-800/30 border-2 p-6 shadow-xl ${winner === 'RED' ? 'border-red-700/50' : 'border-blue-700/50'}`}>
              <p className="text-sm text-green-200/70 mb-1" style={gugiFont}>Winner</p>
              <p className={`text-3xl font-bold ${winner === 'RED' ? 'text-red-400' : 'text-blue-400'}`} style={gugiFont}>
                {winner}
              </p>
            </div>
          </div>

          {/* ========== ATTACK PATH VISUALIZATION ========== */}
          {(() => {
            // extract successful red actions to build the kill chain
            const steps = result.steps || []
            const successfulRed = steps.filter(s => (s.red_reward || 0) > 0)

            // MITRE kill chain stages in order
            const killChain = [
              { id: 'scan', label: 'Reconnaissance', mitre: 'TA0043', color: '#6b7280' },
              { id: 'exploit', label: 'Initial Access', mitre: 'TA0001', color: '#ef4444' },
              { id: 'escalate', label: 'Privilege Escalation', mitre: 'TA0004', color: '#f97316' },
              { id: 'lateral_move', label: 'Lateral Movement', mitre: 'TA0008', color: '#a855f7' },
              { id: 'exfiltrate', label: 'Exfiltration', mitre: 'TA0010', color: '#dc2626' },
            ]

            // which stages did Red complete?
            const completedStages = new Set(successfulRed.map(s => s.red_action?.action))

            // host attack sequence — unique hosts targeted in order
            const hostSequence = []
            const seenHosts = new Set()
            successfulRed.forEach(s => {
              const target = s.red_action?.target || s.red_action?.host
              const action = s.red_action?.action
              if (target && !seenHosts.has(target)) {
                seenHosts.add(target)
                hostSequence.push({ host: target, action, reward: s.red_reward, step: s.step_number })
              }
            })

            // count attacks per host
            const hostHitCounts = {}
            successfulRed.forEach(s => {
              const t = s.red_action?.target || s.red_action?.host
              if (t) hostHitCounts[t] = (hostHitCounts[t] || 0) + 1
            })
            const mostHit = Object.entries(hostHitCounts).sort((a, b) => b[1] - a[1])[0]

            // action frequency
            const actionCounts = {}
            successfulRed.forEach(s => {
              const a = s.red_action?.action
              if (a) actionCounts[a] = (actionCounts[a] || 0) + 1
            })
            const dominantAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]

            if (successfulRed.length === 0) return null

            return (
              <div className="bg-gray-800/30 border-2 border-red-900/40 p-6 shadow-xl">
                <h2 className="text-xl font-bold text-red-400 mb-1" style={gugiFont}>
                  Attack Path Analysis
                </h2>
                <p className="text-green-200/50 text-sm mb-5" style={gugiFont}>
                  AI-discovered attack chain — how the Red agent routed through your network (successful actions only)
                </p>

                {/* MITRE kill chain completion */}
                <div className="mb-6">
                  <p className="text-xs text-green-200/50 mb-3" style={gugiFont}>MITRE ATT&CK Kill Chain Completion</p>
                  <div className="flex flex-wrap gap-0">
                    {killChain.map((stage, i) => {
                      const done = completedStages.has(stage.id)
                      return (
                        <div key={stage.id} className="flex items-center">
                          <div className={`px-3 py-2 text-center border-2 transition-all ${
                            done
                              ? 'border-red-600/70 bg-red-900/30'
                              : 'border-gray-700/40 bg-gray-900/20 opacity-40'
                          }`}>
                            <p className="text-[9px] text-green-200/50 mb-0.5" style={gugiFont}>{stage.mitre}</p>
                            <p className={`text-xs font-bold ${done ? 'text-red-300' : 'text-gray-500'}`} style={gugiFont}>
                              {stage.label}
                            </p>
                            {done && <div className="w-2 h-2 rounded-full bg-red-500 mx-auto mt-1 animate-pulse"></div>}
                          </div>
                          {i < killChain.length - 1 && (
                            <div className={`w-6 h-0.5 ${done && completedStages.has(killChain[i + 1]?.id) ? 'bg-red-600' : 'bg-gray-700'}`}></div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-xs text-green-200/40 mt-2" style={gugiFont}>
                    {completedStages.size} / {killChain.length} stages completed
                  </p>
                </div>

                {/* Host attack sequence SVG flow */}
                {hostSequence.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs text-green-200/50 mb-3" style={gugiFont}>Host Attack Sequence (first compromise per host)</p>
                    <div className="overflow-x-auto">
                      <div className="flex items-center gap-0 min-w-max">
                        {hostSequence.slice(0, 10).map((node, i) => {
                          const stage = killChain.find(k => k.id === node.action)
                          const color = stage?.color || '#ef4444'
                          return (
                            <div key={i} className="flex items-center">
                              <div className="flex flex-col items-center">
                                <div
                                  className="w-20 p-2 border-2 text-center"
                                  style={{ borderColor: color + '80', backgroundColor: color + '15' }}
                                >
                                  <p className="text-[10px] font-bold text-green-200/60 mb-0.5" style={gugiFont}>
                                    Step {node.step}
                                  </p>
                                  <p className="text-xs font-bold text-green-100 truncate" style={gugiFont} title={node.host}>
                                    {node.host.length > 8 ? node.host.slice(0, 8) + '…' : node.host}
                                  </p>
                                  <p className="text-[9px] mt-0.5" style={{ color, fontFamily: 'Gugi, sans-serif' }}>
                                    {node.action.replace('_', ' ')}
                                  </p>
                                  <p className="text-[9px] text-green-400 font-mono mt-0.5">+{node.reward.toFixed(0)}</p>
                                </div>
                              </div>
                              {i < hostSequence.slice(0, 10).length - 1 && (
                                <div className="flex items-center mx-1">
                                  <div className="w-4 h-0.5 bg-red-700/60"></div>
                                  <div className="w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent border-l-red-700/60"></div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {hostSequence.length > 10 && (
                          <p className="text-xs text-green-200/40 ml-3" style={gugiFont}>+{hostSequence.length - 10} more</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-900/30 border border-red-900/30 p-3">
                    <p className="text-[10px] text-green-200/50 mb-1" style={gugiFont}>Successful Actions</p>
                    <p className="text-xl font-bold text-red-400" style={gugiFont}>{successfulRed.length}</p>
                  </div>
                  <div className="bg-gray-900/30 border border-red-900/30 p-3">
                    <p className="text-[10px] text-green-200/50 mb-1" style={gugiFont}>Hosts Compromised</p>
                    <p className="text-xl font-bold text-red-400" style={gugiFont}>{hostSequence.length}</p>
                  </div>
                  {mostHit && (
                    <div className="bg-gray-900/30 border border-red-900/30 p-3">
                      <p className="text-[10px] text-green-200/50 mb-1" style={gugiFont}>Most Targeted Host</p>
                      <p className="text-sm font-bold text-red-400 truncate" style={gugiFont} title={mostHit[0]}>{mostHit[0]}</p>
                      <p className="text-[10px] text-green-200/40" style={gugiFont}>{mostHit[1]} hits</p>
                    </div>
                  )}
                  {dominantAction && (
                    <div className="bg-gray-900/30 border border-red-900/30 p-3">
                      <p className="text-[10px] text-green-200/50 mb-1" style={gugiFont}>Dominant Attack Type</p>
                      <p className="text-sm font-bold text-red-400 capitalize" style={gugiFont}>{dominantAction[0].replace('_', ' ')}</p>
                      <p className="text-[10px] text-green-200/40" style={gugiFont}>{dominantAction[1]}x used</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* ========== FIREWALL ANALYSIS ========== */}
          {firewallData && (
            <div className="bg-gray-800/30 border-2 border-blue-900/40 p-6 shadow-xl">
              <h2 className="text-xl font-bold text-blue-400 mb-1" style={gugiFont}>
                Simulated Firewall Engine
              </h2>
              <p className="text-green-200/50 text-sm mb-5" style={gugiFont}>
                Blue agent automatically applied network firewall rules by isolating compromised hosts,
                cutting off Red's lateral movement pathways.
              </p>

              {/* summary stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                <div className="bg-gray-900/30 border border-blue-900/30 p-4 text-center">
                  <p className="text-[10px] text-blue-200/50 mb-1" style={gugiFont}>Firewall Rules Applied</p>
                  <p className="text-2xl font-bold text-blue-400" style={gugiFont}>{firewallData.total_firewall_rules}</p>
                </div>
                <div className="bg-gray-900/30 border border-blue-900/30 p-4 text-center">
                  <p className="text-[10px] text-blue-200/50 mb-1" style={gugiFont}>Unique Edges Blocked</p>
                  <p className="text-2xl font-bold text-blue-400" style={gugiFont}>{firewallData.recommended_rules?.length || 0}</p>
                </div>
                <div className="bg-gray-900/30 border border-green-900/30 p-4 text-center">
                  <p className="text-[10px] text-green-200/50 mb-1" style={gugiFont}>Lateral Moves Blocked</p>
                  <p className="text-2xl font-bold text-green-400" style={gugiFont}>{firewallData.lateral_moves_blocked}</p>
                </div>
              </div>

              {/* recommended permanent firewall rules */}
              {firewallData.recommended_rules?.length > 0 ? (
                <div className="mb-5">
                  <p className="text-sm font-bold text-blue-300 mb-3" style={gugiFont}>
                    AI-Recommended Permanent Firewall Rules
                  </p>
                  <p className="text-xs text-green-200/40 mb-3" style={gugiFont}>
                    Based on this simulation, apply these rules to your real firewall to block the paths Red used most.
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {firewallData.recommended_rules.map((rule, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-blue-950/20 border border-blue-900/30">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-blue-200/50 font-mono" style={gugiFont}>DENY</span>
                          <span className="text-sm text-blue-100 font-bold" style={gugiFont}>{rule}</span>
                        </div>
                        <span className="text-[10px] text-blue-300/60 border border-blue-800/40 px-2 py-0.5" style={gugiFont}>
                          RULE #{i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-900/20 border border-blue-900/20 p-4 text-center mb-4">
                  <p className="text-blue-200/50 text-sm" style={gugiFont}>
                    No firewall rules were triggered in this simulation. Blue agent did not isolate any hosts.
                    Run more steps or try a different scenario.
                  </p>
                </div>
              )}

              {/* timeline of firewall events */}
              {firewallData.firewall_rules?.length > 0 && (
                <div>
                  <p className="text-xs text-green-200/50 mb-3" style={gugiFont}>Firewall Event Log</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {firewallData.firewall_rules.map((ev, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 bg-gray-900/20 border border-green-900/20">
                        <span className="text-[10px] text-green-200/40 font-mono w-12" style={gugiFont}>Step {ev.step}</span>
                        <span className="text-[10px] text-blue-300/70 border border-blue-800/40 px-1">FIREWALL</span>
                        <span className="text-xs text-green-100" style={gugiFont}>{ev.rule}</span>
                        <span className="text-[10px] text-green-200/30 ml-auto" style={gugiFont}>isolated by Blue on {ev.blocked_by}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-green-200/30 mt-4 border-t border-green-900/20 pt-3" style={gugiFont}>
                {firewallData.summary}
              </p>
            </div>
          )}

          {/* Cumulative Reward Area Chart */}
          <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-green-100 mb-6" style={gugiFont}>Cumulative Reward Over Steps</h2>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={rewardTimeline}>
                <defs>
                  <linearGradient id="gradientRed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gradientBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3a1a" />
                <XAxis dataKey="step" stroke="#4ade80" tick={{ fontSize: 11 }} label={{ value: 'Step', position: 'insideBottom', offset: -5, fill: '#4ade80' }} />
                <YAxis stroke="#4ade80" tick={{ fontSize: 11 }} label={{ value: 'Cumulative Reward', angle: -90, position: 'insideLeft', fill: '#4ade80' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #166534', color: '#4ade80' }} />
                <Legend />
                <Area type="monotone" dataKey="redCumulativeReward" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#gradientRed)" name="Red Agent (Attacker)" />
                <Area type="monotone" dataKey="blueCumulativeReward" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#gradientBlue)" name="Blue Agent (Defender)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Action Distribution Bar Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
              <h2 className="text-xl font-bold text-red-400 mb-4" style={gugiFont}>Red Agent Actions</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={getActionCounts('red')}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a3a1a" />
                  <XAxis dataKey="name" stroke="#4ade80" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis stroke="#4ade80" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #166534', color: '#4ade80' }} />
                  <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} name="Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
              <h2 className="text-xl font-bold text-blue-400 mb-4" style={gugiFont}>Blue Agent Actions</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={getActionCounts('blue')}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a3a1a" />
                  <XAxis dataKey="name" stroke="#4ade80" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis stroke="#4ade80" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #166534', color: '#4ade80' }} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Activity Log — Step-by-Step */}
          <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-green-100 mb-1" style={gugiFont}>Activity Log</h2>
            <p className="text-green-200/50 text-sm mb-4" style={gugiFont}>
              Each row is one simulation step. Red = attacker action, Blue = defender response.
              A <span className="text-green-400">Counter Match</span> means Blue chose the correct MITRE-aligned defense.
            </p>

            {/* column headers */}
            <div className="hidden md:grid grid-cols-[48px_1fr_1fr_90px] gap-2 px-3 py-2 bg-gray-900/40 border border-green-900/30 mb-1">
              <span className="text-[10px] text-green-200/50 font-bold uppercase" style={gugiFont}>Step</span>
              <span className="text-[10px] text-red-300/60 font-bold uppercase" style={gugiFont}>Red — Attacker</span>
              <span className="text-[10px] text-blue-300/60 font-bold uppercase" style={gugiFont}>Blue — Defender</span>
              <span className="text-[10px] text-green-200/50 font-bold uppercase text-right" style={gugiFont}>Outcome</span>
            </div>

            <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
              {result.steps?.map((s) => {
                const ra = s.red_action?.action || 'idle'
                const ba = s.blue_action?.action || 'idle'
                const rt = s.red_action?.target || '—'
                const bt = s.blue_action?.target || '—'
                const rr = s.red_reward || 0
                const br = s.blue_reward || 0
                const isCounter = COUNTER_ACTION_MAP[ra] === ba
                const mitreTag = {
                  scan: 'TA0007', exploit: 'TA0001', escalate: 'TA0004',
                  lateral_move: 'TA0008', exfiltrate: 'TA0010',
                }[ra]

                // outcome: if red got positive reward → attack succeeded; if blue got positive → defense held
                const outcome = rr > 0 && br <= 0 ? 'breached'
                  : br > 0 && rr <= 0 ? 'defended'
                  : rr > 0 && br > 0 ? 'partial'
                  : 'neutral'

                const outcomeStyle = {
                  breached: 'text-red-400 border-red-700/50 bg-red-900/20',
                  defended: 'text-green-400 border-green-700/50 bg-green-900/20',
                  partial:  'text-yellow-400 border-yellow-700/50 bg-yellow-900/20',
                  neutral:  'text-green-200/40 border-green-900/30 bg-transparent',
                }[outcome]

                const outcomeLabel = { breached: '✗ Breach', defended: '✓ Held', partial: '~ Partial', neutral: '— Idle' }[outcome]

                return (
                  <div key={s.step_number}
                    className={`grid grid-cols-1 md:grid-cols-[48px_1fr_1fr_90px] gap-2 items-start px-3 py-2.5 border transition-all hover:bg-gray-900/30 ${
                      isCounter ? 'border-green-700/40 bg-green-900/5' : 'border-green-900/20 bg-gray-900/10'
                    }`}>

                    {/* step number */}
                    <div className="flex md:block items-center gap-2">
                      <span className="text-green-300 text-xs font-bold" style={gugiFont}>{s.step_number}</span>
                      {isCounter && <span className="text-[9px] text-green-400 block" style={gugiFont}>✓ counter</span>}
                    </div>

                    {/* red action */}
                    <div className="bg-red-950/20 border border-red-900/20 px-2 py-1.5 rounded">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <FaSkull className="text-red-400 text-[10px]" />
                        <span className="text-red-300 text-xs font-bold capitalize" style={gugiFont}>{ra.replace('_', ' ')}</span>
                        {rt !== '—' && <span className="text-[10px] px-1.5 py-0 border border-red-800/50 text-red-300/70 bg-red-900/20 rounded" style={gugiFont}>{rt}</span>}
                        {mitreTag && <span className="text-[9px] text-red-200/30" style={gugiFont}>{mitreTag}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono font-bold ${rr > 0 ? 'text-red-400' : 'text-red-300/40'}`}>
                          {rr > 0 ? '+' : ''}{rr.toFixed(1)}
                        </span>
                        <span className="text-[10px] text-red-200/40 truncate" style={gugiFont}>
                          {buildRewardExplanation(ra, rr, 'red')}
                        </span>
                      </div>
                    </div>

                    {/* blue action */}
                    <div className="bg-blue-950/20 border border-blue-900/20 px-2 py-1.5 rounded">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <FaShieldAlt className="text-blue-400 text-[10px]" />
                        <span className="text-blue-300 text-xs font-bold capitalize" style={gugiFont}>{ba.replace('_', ' ')}</span>
                        {bt !== '—' && <span className="text-[10px] px-1.5 py-0 border border-blue-800/50 text-blue-300/70 bg-blue-900/20 rounded" style={gugiFont}>{bt}</span>}
                        {!isCounter && COUNTER_ACTION_MAP[ra] && (
                          <span className="text-[9px] text-yellow-400/60" style={gugiFont}>ideal: {COUNTER_ACTION_MAP[ra]}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono font-bold ${br > 0 ? 'text-blue-400' : 'text-blue-300/40'}`}>
                          {br > 0 ? '+' : ''}{br.toFixed(1)}
                        </span>
                        <span className="text-[10px] text-blue-200/40 truncate" style={gugiFont}>
                          {buildRewardExplanation(ba, br, 'blue')}
                        </span>
                      </div>
                    </div>

                    {/* outcome */}
                    <div className="flex md:justify-end items-center">
                      <span className={`text-[10px] font-bold px-2 py-1 border rounded ${outcomeStyle}`} style={gugiFont}>
                        {outcomeLabel}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Empty State - shown before any simulation is run */}
      {!result && !running && !error && (
        <div className="bg-gray-800/30 border-2 border-green-900/50 p-12 shadow-xl text-center">
          <FaNetworkWired className="text-green-300/30 text-5xl mx-auto mb-4" />
          <p className="text-green-200/50" style={gugiFont}>Select a scenario and click "Start Simulation" to run a Red vs Blue agent battle</p>
          <p className="text-green-200/30 text-sm mt-2" style={gugiFont}>
            After running a simulation, visit the <span className="text-blue-300/60">Defense Analyser</span> to see how the Blue agent performed,
            or the <span className="text-green-300/60">Analytics</span> page for training curves and reports.
          </p>
        </div>
      )}
    </div>
  )
}

export default AttackSimulator
