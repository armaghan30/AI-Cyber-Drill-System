import React, { useState, useEffect } from 'react'
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
    try {
      const res = await api.runSimulation(parseInt(scenarioId), maxSteps)
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const resetSim = () => {
    setResult(null)
    setError(null)
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
          {!running && !result ? (
            <button
              onClick={startSim}
              disabled={!scenarioId}
              className="flex items-center space-x-2 px-6 py-3 bg-transparent border-2 border-green-900/50 text-green-100 hover:bg-green-900/30 transition-all disabled:opacity-50"
              style={gugiFont}
            >
              <FaPlay />
              <span>Start Simulation</span>
            </button>
          ) : result ? (
            <button
              onClick={resetSim}
              className="flex items-center space-x-2 px-6 py-3 bg-transparent border-2 border-green-900/50 text-green-100 hover:bg-green-900/30 transition-all"
              style={gugiFont}
            >
              <FaStop />
              <span>New Simulation</span>
            </button>
          ) : (
            <div className="flex items-center space-x-2 px-6 py-3 border-2 border-green-900/50 text-green-200/70" style={gugiFont}>
              <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></div>
              <span>Running...</span>
            </div>
          )}
        </div>
      </div>

      {/* "What's Happening" info box for non-technical users */}
      <div className="bg-gray-800/30 border-2 border-green-900/50 p-5 shadow-xl flex items-start space-x-4">
        <FaInfoCircle className="text-green-400 text-2xl mt-1 flex-shrink-0" />
        <div>
          <h2 className="text-lg font-bold text-green-100 mb-1" style={gugiFont}>What's Happening?</h2>
          <p className="text-green-200/70 text-sm leading-relaxed" style={gugiFont}>
            This simulator runs AI-powered Red (attacker) and Blue (defender) agents against each other on a virtual
            network topology. The Red agent tries to compromise hosts while the Blue agent tries to protect them.
            Each step, both agents choose an action simultaneously. The simulation tracks their rewards to determine
            which agent performed better overall.
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

      {/* Loading Spinner */}
      {running && (
        <div className="bg-gray-800/30 border-2 border-green-900/50 p-12 shadow-xl text-center">
          <div className="w-12 h-12 border-4 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-green-200/70" style={gugiFont}>Running Red vs Blue simulation...</p>
          <p className="text-green-200/50 text-sm mt-2" style={gugiFont}>Executing {maxSteps} steps on the selected topology</p>
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

          {/* Detailed Step-by-Step Explanation */}
          <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-green-100 mb-2" style={gugiFont}>Detailed Step-by-Step Breakdown</h2>
            <p className="text-green-200/50 text-sm mb-6" style={gugiFont}>
              Each step shows what both agents did, what happened, and the reward they received.
            </p>
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {result.steps?.map((stepData) => {
                const redActionName = stepData.red_action?.action || 'idle'
                const blueActionName = stepData.blue_action?.action || 'idle'
                const redRewardValue = stepData.red_reward || 0
                const blueRewardValue = stepData.blue_reward || 0

                const redNarrative = buildActionNarrative(stepData.red_action, RED_ACTION_DESCRIPTIONS)
                const blueNarrative = buildActionNarrative(stepData.blue_action, BLUE_ACTION_DESCRIPTIONS)
                const redRewardReason = buildRewardExplanation(redActionName, redRewardValue, 'red')
                const blueRewardReason = buildRewardExplanation(blueActionName, blueRewardValue, 'blue')

                return (
                  <div
                    key={stepData.step_number}
                    className="bg-gray-900/30 border border-green-900/30 p-4 hover:bg-gray-900/50 transition-all"
                  >
                    {/* Step Header */}
                    <div className="flex items-center space-x-3 mb-3 pb-2 border-b border-green-900/20">
                      <span className="bg-green-900/40 text-green-300 text-xs font-bold px-3 py-1 rounded-full" style={gugiFont}>
                        Step {stepData.step_number}
                      </span>
                      <FaArrowRight className="text-green-600/50 text-xs" />
                      <span className="text-green-200/40 text-xs" style={gugiFont}>
                        Red: {redActionName} vs Blue: {blueActionName}
                      </span>
                      {COUNTER_ACTION_MAP[redActionName] === blueActionName && (
                        <span className="text-xs px-2 py-0.5 bg-green-900/30 border border-green-600/50 text-green-400" style={gugiFont}>
                          Counter Match
                        </span>
                      )}
                      {COUNTER_ACTION_MAP[redActionName] && COUNTER_ACTION_MAP[redActionName] !== blueActionName && (
                        <span className="text-xs px-2 py-0.5 bg-yellow-900/20 border border-yellow-700/50 text-yellow-400" style={gugiFont}>
                          Ideal counter: {COUNTER_ACTION_MAP[redActionName]}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Red Agent Section */}
                      <div className="bg-red-950/20 border border-red-900/30 p-3 rounded">
                        <div className="flex items-center space-x-2 mb-2">
                          <FaSkull className="text-red-400 text-sm" />
                          <span className="text-red-300 font-bold text-sm" style={gugiFont}>Red Agent (Attacker)</span>
                        </div>
                        <p className="text-red-200/80 text-sm mb-2" style={gugiFont}>
                          {redNarrative}
                        </p>
                        <div className="flex items-center space-x-2">
                          <span
                            className={`text-sm font-bold font-mono ${redRewardValue >= 0 ? 'text-red-400' : 'text-red-300/60'}`}
                          >
                            {redRewardValue >= 0 ? '+' : ''}{redRewardValue.toFixed(2)}
                          </span>
                          <span className="text-red-200/50 text-xs" style={gugiFont}>
                            — {redRewardReason}
                          </span>
                        </div>
                      </div>

                      {/* Blue Agent Section */}
                      <div className="bg-blue-950/20 border border-blue-900/30 p-3 rounded">
                        <div className="flex items-center space-x-2 mb-2">
                          <FaShieldAlt className="text-blue-400 text-sm" />
                          <span className="text-blue-300 font-bold text-sm" style={gugiFont}>Blue Agent (Defender)</span>
                        </div>
                        <p className="text-blue-200/80 text-sm mb-2" style={gugiFont}>
                          {blueNarrative}
                        </p>
                        <div className="flex items-center space-x-2">
                          <span
                            className={`text-sm font-bold font-mono ${blueRewardValue >= 0 ? 'text-blue-400' : 'text-blue-300/60'}`}
                          >
                            {blueRewardValue >= 0 ? '+' : ''}{blueRewardValue.toFixed(2)}
                          </span>
                          <span className="text-blue-200/50 text-xs" style={gugiFont}>
                            — {blueRewardReason}
                          </span>
                        </div>
                      </div>
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
