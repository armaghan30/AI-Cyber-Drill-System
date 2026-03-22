import React, { useState, useEffect } from 'react'
import { FaShieldAlt, FaCheckCircle, FaExclamationTriangle, FaChartLine, FaSync, FaDownload, FaBook, FaFlag, FaCrosshairs, FaLightbulb } from 'react-icons/fa'
import api from '../api'

// MITRE ATT&CK aligned blue defense actions with counter-attack mapping
const defenseActionGlossary = {
  detect: 'Monitors network for intrusion detection — counters Red Scan (MITRE: Discovery)',
  patch: 'Applies security patches to close CVEs — counters Red Exploit (MITRE: Initial Access)',
  harden: 'Strengthens host config to prevent privilege escalation — counters Red Escalate (MITRE: Privilege Escalation)',
  isolate: 'Disconnects host from network to block lateral movement — counters Red Lateral Move (MITRE: Lateral Movement)',
  restore: 'Wipes and restores compromised host to clean state — counters Red Exfiltrate (MITRE: Exfiltration)',
  monitor: 'Actively watches network traffic to detect suspicious behavior',
}

// Glossary for common red agent attack actions
const attackActionDescriptions = {
  exploit: 'Exploits a known vulnerability to gain access to a host',
  scan: 'Scans the network to discover hosts and open ports',
  escalate: 'Escalates privileges on a compromised host to gain deeper access',
  spread: 'Moves laterally from one compromised host to another',
  exfiltrate: 'Steals data from a compromised host',
  phish: 'Sends a phishing attack to trick users into revealing credentials',
}

// Helper: look up a glossary description for an action string
const getBlueActionDescription = (actionString) => {
  if (!actionString) return 'Unknown defense action'
  const actionLowerCase = actionString.toLowerCase()
  for (const [keyword, description] of Object.entries(defenseActionGlossary)) {
    if (actionLowerCase.includes(keyword)) return description
  }
  return 'Defense action taken by the Blue agent'
}

const getRedActionDescription = (actionString) => {
  if (!actionString) return 'Unknown attack action'
  const actionLowerCase = actionString.toLowerCase()
  for (const [keyword, description] of Object.entries(attackActionDescriptions)) {
    if (actionLowerCase.includes(keyword)) return description
  }
  return 'Attack action taken by the Red agent'
}

// Extract the base action name (e.g. "isolate" from "isolate host_3")
const extractBaseActionName = (actionString) => {
  if (!actionString) return 'unknown'
  return actionString.split(/[\s_(\[]/)[0].toLowerCase()
}

// Shared Gugi font style used across all text elements
const gugiFont = { fontFamily: 'Gugi, sans-serif' }

// ──────────────────────────────────────────────
// Battle Summary: generates a plain-English explanation of what happened
// ──────────────────────────────────────────────
const BattleSummarySection = ({ report }) => {
  if (!report) return null

  const winnerIsBlue = report.winner === 'blue'
  const totalStepCount = report.total_steps || 0
  const blueRewardTotal = report.total_blue_reward || 0
  const redRewardTotal = report.total_red_reward || 0

  // Count actions per agent from the step log
  const blueActionCounts = {}
  const redActionCounts = {}
  if (report.steps) {
    report.steps.forEach((stepEntry) => {
      const blueBaseName = extractBaseActionName(stepEntry.blue_action)
      const redBaseName = extractBaseActionName(stepEntry.red_action)
      blueActionCounts[blueBaseName] = (blueActionCounts[blueBaseName] || 0) + 1
      redActionCounts[redBaseName] = (redActionCounts[redBaseName] || 0) + 1
    })
  }

  const mostUsedBlueAction = Object.entries(blueActionCounts).sort((a, b) => b[1] - a[1])[0]
  const mostUsedRedAction = Object.entries(redActionCounts).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
      <div className="flex items-center space-x-3 mb-4">
        <FaFlag className={winnerIsBlue ? 'text-blue-400 text-xl' : 'text-red-400 text-xl'} />
        <h2 className="text-xl font-bold text-green-100" style={gugiFont}>Battle Summary</h2>
      </div>

      <div className="space-y-3 text-green-200/80 text-sm leading-relaxed" style={gugiFont}>
        <p>
          This simulation ran for <span className="text-green-100 font-bold">{totalStepCount} steps</span>.
          The <span className={winnerIsBlue ? 'text-blue-400 font-bold' : 'text-red-400 font-bold'}>
            {winnerIsBlue ? 'Blue (Defender)' : 'Red (Attacker)'}
          </span> agent won the engagement.
        </p>

        <p>
          The Blue agent accumulated a total reward of <span className="text-blue-400 font-bold">{blueRewardTotal}</span>,
          while the Red agent scored <span className="text-red-400 font-bold">{redRewardTotal}</span>.
          {winnerIsBlue
            ? ' The defender successfully contained the attacker\'s operations and maintained network integrity.'
            : ' The attacker managed to compromise critical systems despite defensive efforts.'}
        </p>

        {mostUsedBlueAction && (
          <p>
            The Blue agent relied most heavily on <span className="text-blue-300 font-bold">{mostUsedBlueAction[0]}</span> ({mostUsedBlueAction[1]} times)
            {' '}&mdash; {getBlueActionDescription(mostUsedBlueAction[0])}.
          </p>
        )}

        {mostUsedRedAction && (
          <p>
            The Red agent's primary strategy was <span className="text-red-300 font-bold">{mostUsedRedAction[0]}</span> ({mostUsedRedAction[1]} times)
            {' '}&mdash; {getRedActionDescription(mostUsedRedAction[0])}.
          </p>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Strategy Analysis: which defenses were most/least effective
// ──────────────────────────────────────────────
const StrategyAnalysisSection = ({ report }) => {
  if (!report?.steps || report.steps.length === 0) return null

  // Accumulate reward per blue action type to find effectiveness
  const rewardMap = {}
  report.steps.forEach((stepEntry) => {
    const blueBaseName = extractBaseActionName(stepEntry.blue_action)
    if (!rewardMap[blueBaseName]) {
      rewardMap[blueBaseName] = { totalReward: 0, usageCount: 0 }
    }
    rewardMap[blueBaseName].totalReward += stepEntry.blue_reward || 0
    rewardMap[blueBaseName].usageCount += 1
  })

  // Sort by average reward per use to rank effectiveness
  const ranking = Object.entries(rewardMap)
    .map(([actionName, stats]) => ({
      actionName,
      totalReward: stats.totalReward,
      usageCount: stats.usageCount,
      averageReward: stats.usageCount > 0 ? (stats.totalReward / stats.usageCount) : 0,
    }))
    .sort((a, b) => b.averageReward - a.averageReward)

  const bestAction = ranking[0]
  const worstAction = ranking[ranking.length - 1]

  // Generate improvement suggestions based on what the agent did
  const suggestions = []
  const usedNames = ranking.map(entry => entry.actionName)

  // Check which glossary actions were never used
  const unusedActions = Object.keys(defenseActionGlossary).filter(
    (glossaryAction) => !usedNames.includes(glossaryAction)
  )

  if (unusedActions.length > 0) {
    suggestions.push(
      `The Blue agent never used: ${unusedActions.join(', ')}. Incorporating these could improve defense diversity.`
    )
  }

  if (worstAction && worstAction.averageReward < 0) {
    suggestions.push(
      `The "${worstAction.actionName}" action had a negative average reward (${worstAction.averageReward.toFixed(2)}). Consider reducing its usage or timing it differently.`
    )
  }

  if (bestAction && bestAction.usageCount < report.steps.length * 0.2) {
    suggestions.push(
      `The most effective action "${bestAction.actionName}" was only used ${bestAction.usageCount} times. Using it more frequently might yield better results.`
    )
  }

  return (
    <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
      <div className="flex items-center space-x-3 mb-4">
        <FaLightbulb className="text-yellow-400 text-xl" />
        <h2 className="text-xl font-bold text-green-100" style={gugiFont}>Strategy Analysis</h2>
      </div>

      {/* Effectiveness ranking table */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-green-200/70 mb-3 uppercase tracking-wider" style={gugiFont}>
          Defense Effectiveness Ranking
        </h3>
        <div className="space-y-2">
          {ranking.map((entry, index) => {
            const isTopAction = index === 0
            const isBottomAction = index === ranking.length - 1 && ranking.length > 1
            return (
              <div
                key={entry.actionName}
                className={`flex items-center justify-between p-3 border ${
                  isTopAction
                    ? 'border-green-600/50 bg-green-900/20'
                    : isBottomAction
                      ? 'border-red-900/50 bg-red-900/10'
                      : 'border-green-900/30 bg-gray-900/20'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-green-200/50 text-xs w-6" style={gugiFont}>#{index + 1}</span>
                  <span className="text-green-100 font-semibold" style={gugiFont}>{entry.actionName}</span>
                  <span className="text-green-200/50 text-xs" style={gugiFont}>({entry.usageCount}x)</span>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-green-200/50 text-xs" style={gugiFont}>
                    Total: {entry.totalReward.toFixed(2)}
                  </span>
                  <span
                    className={`font-bold text-sm ${entry.averageReward >= 0 ? 'text-green-400' : 'text-red-400'}`}
                    style={gugiFont}
                  >
                    Avg: {entry.averageReward.toFixed(2)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Most / least effective callouts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {bestAction && (
          <div className="bg-green-900/20 border border-green-700/50 p-4">
            <h4 className="text-green-400 text-sm font-bold mb-1" style={gugiFont}>Most Effective</h4>
            <p className="text-green-100 font-bold text-lg" style={gugiFont}>{bestAction.actionName}</p>
            <p className="text-green-200/60 text-xs mt-1" style={gugiFont}>
              Avg reward: {bestAction.averageReward.toFixed(2)} over {bestAction.usageCount} uses
            </p>
            <p className="text-green-200/50 text-xs mt-2" style={gugiFont}>
              {getBlueActionDescription(bestAction.actionName)}
            </p>
          </div>
        )}

        {worstAction && ranking.length > 1 && (
          <div className="bg-red-900/10 border border-red-900/50 p-4">
            <h4 className="text-red-400 text-sm font-bold mb-1" style={gugiFont}>Least Effective</h4>
            <p className="text-red-100 font-bold text-lg" style={gugiFont}>{worstAction.actionName}</p>
            <p className="text-red-200/60 text-xs mt-1" style={gugiFont}>
              Avg reward: {worstAction.averageReward.toFixed(2)} over {worstAction.usageCount} uses
            </p>
            <p className="text-red-200/50 text-xs mt-2" style={gugiFont}>
              {getBlueActionDescription(worstAction.actionName)}
            </p>
          </div>
        )}
      </div>

      {/* Improvement suggestions */}
      {suggestions.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-green-200/70 mb-3 uppercase tracking-wider" style={gugiFont}>
            How Blue Could Improve
          </h3>
          <ul className="space-y-2">
            {suggestions.map((suggestion, suggestionIndex) => (
              <li key={suggestionIndex} className="flex items-start space-x-2 text-sm text-green-200/70" style={gugiFont}>
                <span className="text-yellow-400 mt-0.5">&#9679;</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Blue Actions List: all blue actions from a simulation with descriptions
// ──────────────────────────────────────────────
const BlueActionsListSection = ({ report }) => {
  if (!report?.steps || report.steps.length === 0) return null

  // Deduplicate blue actions to show each unique action and its description
  const uniqueBlueActions = {}
  report.steps.forEach((stepEntry) => {
    const blueBaseName = extractBaseActionName(stepEntry.blue_action)
    if (!uniqueBlueActions[blueBaseName]) {
      uniqueBlueActions[blueBaseName] = {
        fullActionExample: stepEntry.blue_action,
        description: getBlueActionDescription(stepEntry.blue_action),
        occurrenceCount: 0,
      }
    }
    uniqueBlueActions[blueBaseName].occurrenceCount += 1
  })

  return (
    <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
      <div className="flex items-center space-x-3 mb-4">
        <FaShieldAlt className="text-blue-400 text-xl" />
        <h2 className="text-xl font-bold text-green-100" style={gugiFont}>Blue Agent Actions Used</h2>
      </div>
      <div className="space-y-3">
        {Object.entries(uniqueBlueActions)
          .sort((a, b) => b[1].occurrenceCount - a[1].occurrenceCount)
          .map(([actionName, actionDetails]) => (
            <div key={actionName} className="bg-gray-900/20 border border-green-900/30 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-blue-300 font-bold" style={gugiFont}>{actionName}</span>
                <span className="text-green-200/50 text-xs" style={gugiFont}>Used {actionDetails.occurrenceCount} times</span>
              </div>
              <p className="text-green-200/60 text-sm" style={gugiFont}>{actionDetails.description}</p>
              <p className="text-green-200/40 text-xs mt-1" style={gugiFont}>
                Example: <span className="text-green-300/60">{actionDetails.fullActionExample}</span>
              </p>
            </div>
          ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Step Timeline: shows each step with Red and Blue actions side by side
// ──────────────────────────────────────────────
const StepTimelineSection = ({ report }) => {
  if (!report?.steps || report.steps.length === 0) return null

  return (
    <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
      <div className="flex items-center space-x-3 mb-4">
        <FaCrosshairs className="text-green-400 text-xl" />
        <h2 className="text-xl font-bold text-green-100" style={gugiFont}>Step-by-Step Timeline</h2>
      </div>
      <div className="space-y-0 max-h-[600px] overflow-y-auto pr-2">
        {report.steps.map((stepEntry, stepIndex) => {
          const isLastStep = stepIndex === report.steps.length - 1
          return (
            <div key={stepIndex} className="relative flex">
              {/* Timeline spine */}
              <div className="flex flex-col items-center mr-4">
                <div className="w-8 h-8 rounded-full bg-green-900/50 border-2 border-green-700/50 flex items-center justify-center text-xs text-green-300 font-bold flex-shrink-0" style={gugiFont}>
                  {stepEntry.step}
                </div>
                {!isLastStep && (
                  <div className="w-0.5 flex-1 bg-green-900/30 min-h-[20px]"></div>
                )}
              </div>

              {/* Step content: Red on left, Blue on right */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
                {/* Red agent action */}
                <div className="bg-red-900/10 border border-red-900/30 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-red-400 text-xs font-bold uppercase tracking-wider" style={gugiFont}>Red Attack</span>
                    <span className="text-red-400 text-sm font-bold" style={gugiFont}>
                      {stepEntry.red_reward >= 0 ? '+' : ''}{stepEntry.red_reward}
                    </span>
                  </div>
                  <p className="text-red-200 text-sm font-semibold" style={gugiFont}>{stepEntry.red_action}</p>
                  <p className="text-red-200/40 text-xs mt-1" style={gugiFont}>{getRedActionDescription(stepEntry.red_action)}</p>
                </div>

                {/* Blue agent action */}
                <div className="bg-blue-900/10 border border-blue-900/30 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-blue-400 text-xs font-bold uppercase tracking-wider" style={gugiFont}>Blue Defense</span>
                    <span className="text-blue-400 text-sm font-bold" style={gugiFont}>
                      {stepEntry.blue_reward >= 0 ? '+' : ''}{stepEntry.blue_reward}
                    </span>
                  </div>
                  <p className="text-blue-200 text-sm font-semibold" style={gugiFont}>{stepEntry.blue_action}</p>
                  <p className="text-blue-200/40 text-xs mt-1" style={gugiFont}>{getBlueActionDescription(stepEntry.blue_action)}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Defense Action Glossary: reference for all blue actions
// ──────────────────────────────────────────────
const GlossarySection = () => {
  const glossaryIconColors = {
    isolate: 'text-orange-400',
    patch: 'text-cyan-400',
    harden: 'text-yellow-400',
    monitor: 'text-purple-400',
    restore: 'text-green-400',
  }

  return (
    <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
      <div className="flex items-center space-x-3 mb-4">
        <FaBook className="text-green-400 text-xl" />
        <h2 className="text-xl font-bold text-green-100" style={gugiFont}>Defense Action Glossary</h2>
      </div>
      <p className="text-green-200/50 text-sm mb-4" style={gugiFont}>
        Reference guide for all available Blue agent defense actions and what they do.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(defenseActionGlossary).map(([actionName, actionDescription]) => (
          <div key={actionName} className="bg-gray-900/20 border border-green-900/30 p-4 hover:border-green-800/50 transition-colors">
            <div className="flex items-center space-x-2 mb-2">
              <FaShieldAlt className={glossaryIconColors[actionName] || 'text-green-400'} />
              <span className="text-green-100 font-bold uppercase text-sm tracking-wider" style={gugiFont}>
                {actionName}
              </span>
            </div>
            <p className="text-green-200/60 text-sm leading-relaxed" style={gugiFont}>
              {actionDescription}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════
// Main DefenseAnalyser component
// ══════════════════════════════════════════════
const DefenseAnalyser = () => {
  const [analysisData, setAnalysisData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedSimId, setSelectedSimId] = useState(null)
  const [report, setReport] = useState(null)

  const loadAnalysis = () => {
    setLoading(true)
    setErrorMsg('')
    api.defenseAnalysis()
      .then((responseData) => {
        setAnalysisData(responseData)
        setLoading(false)
      })
      .catch((fetchError) => {
        setErrorMsg(fetchError.message || 'Failed to load defense analysis')
        setLoading(false)
      })
  }

  useEffect(() => {
    loadAnalysis()
  }, [])

  const loadReport = (simulationId) => {
    setSelectedSimId(simulationId)
    setReport(null)
    api.simulationReport(simulationId)
      .then((reportData) => setReport(reportData))
      .catch(() => setReport(null))
  }

  // Download the full simulation report as JSON
  const downloadReport = () => {
    if (!report) return
    const jsonBlob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const downloadUrl = URL.createObjectURL(jsonBlob)
    const downloadAnchor = document.createElement('a')
    downloadAnchor.href = downloadUrl
    downloadAnchor.download = `defense_report_simulation_${report.simulation_id}.json`
    downloadAnchor.click()
    URL.revokeObjectURL(downloadUrl)
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-green-300 text-lg" style={gugiFont}>Loading defense analysis...</div>
      </div>
    )
  }

  // ── Error state ──
  if (errorMsg) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-green-100" style={gugiFont}>Defense Analyser</h1>
        <div className="bg-red-900/30 border-2 border-red-700 text-red-200 p-6 text-center" style={gugiFont}>
          {errorMsg}
          <br /><br />
          <button onClick={loadAnalysis} className="px-4 py-2 border border-red-700 hover:bg-red-900/30 transition-colors">Retry</button>
        </div>
      </div>
    )
  }

  const noData = !analysisData || analysisData.total_simulations === 0

  // Compute overview card values from the analysis data
  const totalSims = analysisData?.total_simulations || 0
  const blueWins = analysisData?.blue_wins || 0
  const redWins = analysisData?.red_wins || 0
  const winRate = analysisData?.win_rate || 0
  const avgBlueReward = analysisData?.avg_blue_reward || 0
  const actionDist = analysisData?.defense_actions || {}
  const recentSims = analysisData?.recent_simulations || []

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-green-100 mb-2" style={gugiFont}>Defense Analyser</h1>
          <p className="text-green-200/70" style={gugiFont}>Blue agent defense performance across all simulations</p>
        </div>
        <button
          onClick={loadAnalysis}
          className="flex items-center space-x-2 px-4 py-2 border-2 border-green-900/50 text-green-100 hover:bg-green-900/30 transition-all"
          style={gugiFont}
        >
          <FaSync />
          <span>Refresh</span>
        </button>
      </div>

      {noData ? (
        <div className="bg-gray-800/30 border-2 border-green-900/50 p-12 text-center shadow-xl space-y-4">
          <FaShieldAlt className="text-green-300/30 text-6xl mx-auto" />
          <h2 className="text-xl text-green-200/70" style={gugiFont}>No Simulation Data Yet</h2>
          <p className="text-green-300/50 max-w-lg mx-auto" style={gugiFont}>
            The Defense Analyser needs simulation data to work with. Go to the
            <span className="text-green-200"> Attack Simulator</span> or
            <span className="text-green-200"> AI Orchestrator</span> and run a Red vs Blue simulation first.
            Once complete, come back here to see how the Blue agent defended your network.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button onClick={() => window.location.href = '/attack-simulator'}
              className="px-5 py-2 border-2 border-green-700/50 text-green-200 hover:bg-green-900/30 transition-all text-sm" style={gugiFont}>
              Go to Attack Simulator
            </button>
            <button onClick={() => window.location.href = '/ai-orchestrator'}
              className="px-5 py-2 border-2 border-purple-700/50 text-purple-200 hover:bg-purple-900/30 transition-all text-sm" style={gugiFont}>
              Go to AI Orchestrator
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: 'Total Simulations', value: totalSims, icon: FaChartLine, color: 'text-blue-400' },
              { title: 'Blue Wins', value: blueWins, icon: FaShieldAlt, color: 'text-green-400' },
              { title: 'Red Wins', value: redWins, icon: FaExclamationTriangle, color: 'text-red-400' },
              { title: 'Blue Win Rate', value: `${winRate}%`, icon: FaCheckCircle, color: 'text-green-400' },
            ].map((overviewCard, cardIndex) => {
              const CardIcon = overviewCard.icon
              return (
                <div key={cardIndex} className="bg-gray-800/30 border-2 border-green-900/50 p-6 hover:border-green-800 transition-all shadow-xl group">
                  <div className="flex items-center justify-between mb-4">
                    <div className="bg-green-900/30 p-3 border border-green-800/50">
                      <CardIcon className={`${overviewCard.color} text-2xl`} />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-green-100 mb-1" style={gugiFont}>{overviewCard.value}</h3>
                  <p className="text-green-200/70 text-sm" style={gugiFont}>{overviewCard.title}</p>
                </div>
              )
            })}
          </div>

          {/* Win Rate Distribution Bar */}
          <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-green-100 mb-4" style={gugiFont}>Win Rate Distribution</h2>
            <div className="flex items-center space-x-4 mb-2">
              <span className="text-blue-400 text-sm w-24" style={gugiFont}>Blue: {blueWins}</span>
              <div className="flex-1 h-8 bg-gray-900/50 border border-green-900/30 overflow-hidden flex">
                <div className="bg-blue-600/70 h-full transition-all" style={{ width: `${winRate}%` }}></div>
                <div className="bg-red-600/70 h-full transition-all" style={{ width: `${100 - winRate}%` }}></div>
              </div>
              <span className="text-red-400 text-sm w-24 text-right" style={gugiFont}>Red: {redWins}</span>
            </div>
            <div className="text-center text-green-200/50 text-sm" style={gugiFont}>
              Avg Blue Reward: {avgBlueReward}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Defense Action Distribution */}
            <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
              <h2 className="text-xl font-bold text-green-100 mb-4" style={gugiFont}>Defense Actions Used</h2>
              {Object.keys(actionDist).length === 0 ? (
                <p className="text-green-200/50 text-sm" style={gugiFont}>No action data available</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(actionDist)
                    .sort((a, b) => b[1] - a[1])
                    .map(([actionName, actionCount], actionIndex) => {
                      const totalActionCount = Object.values(actionDist).reduce((sum, val) => sum + val, 0)
                      const actionPercentage = ((actionCount / totalActionCount) * 100).toFixed(1)
                      return (
                        <div key={actionIndex}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-green-200" style={gugiFont}>{actionName}</span>
                            <span className="text-green-300/70" style={gugiFont}>{actionCount} ({actionPercentage}%)</span>
                          </div>
                          <div className="w-full bg-gray-900/50 h-2 border border-green-900/30 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-green-600 to-green-800" style={{ width: `${actionPercentage}%` }}></div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>

            {/* Recent Simulations List */}
            <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
              <h2 className="text-xl font-bold text-green-100 mb-4" style={gugiFont}>Recent Simulations</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {recentSims.map((simulationEntry) => (
                  <div
                    key={simulationEntry.id}
                    onClick={() => loadReport(simulationEntry.id)}
                    className={`bg-gray-900/20 border p-4 cursor-pointer transition-all ${
                      selectedSimId === simulationEntry.id ? 'border-green-600' : 'border-green-900/30 hover:border-green-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-green-100 font-semibold" style={gugiFont}>Simulation #{simulationEntry.id}</span>
                      <span className={`px-2 py-1 text-xs ${
                        simulationEntry.winner === 'blue'
                          ? 'bg-blue-900/30 border border-blue-700/50 text-blue-400'
                          : 'bg-red-900/30 border border-red-700/50 text-red-400'
                      }`} style={gugiFont}>
                        {simulationEntry.winner.toUpperCase()} WINS
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-green-200/70" style={gugiFont}>
                      <span>Steps: {simulationEntry.total_steps}</span>
                      <span>Blue: {simulationEntry.blue_reward} | Red: {simulationEntry.red_reward}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Simulation Detail Report Section ── */}
          {report && (
            <>
              {/* Report header with stats and download button */}
              <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-green-100" style={gugiFont}>
                    Simulation #{report.simulation_id} Report
                  </h2>
                  <button
                    onClick={downloadReport}
                    className="flex items-center space-x-2 px-4 py-2 border border-green-900/50 text-green-200 hover:bg-green-900/30 transition-colors text-sm"
                    style={gugiFont}
                  >
                    <FaDownload />
                    <span>Download Full Report (JSON)</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-900/20 border border-green-900/30 p-3 text-center">
                    <div className="text-lg font-bold text-green-100" style={gugiFont}>{report.total_steps}</div>
                    <div className="text-xs text-green-200/50" style={gugiFont}>Total Steps</div>
                  </div>
                  <div className="bg-gray-900/20 border border-green-900/30 p-3 text-center">
                    <div className="text-lg font-bold text-green-100" style={gugiFont}>{report.winner?.toUpperCase()}</div>
                    <div className="text-xs text-green-200/50" style={gugiFont}>Winner</div>
                  </div>
                  <div className="bg-gray-900/20 border border-green-900/30 p-3 text-center">
                    <div className="text-lg font-bold text-blue-400" style={gugiFont}>{report.total_blue_reward}</div>
                    <div className="text-xs text-green-200/50" style={gugiFont}>Blue Total</div>
                  </div>
                  <div className="bg-gray-900/20 border border-green-900/30 p-3 text-center">
                    <div className="text-lg font-bold text-red-400" style={gugiFont}>{report.total_red_reward}</div>
                    <div className="text-xs text-green-200/50" style={gugiFont}>Red Total</div>
                  </div>
                </div>
              </div>

              {/* Battle Summary */}
              <BattleSummarySection report={report} />

              {/* Blue Agent Actions Used */}
              <BlueActionsListSection report={report} />

              {/* Strategy Analysis */}
              <StrategyAnalysisSection report={report} />

              {/* Step-by-Step Timeline */}
              <StepTimelineSection report={report} />
            </>
          )}

          {/* Defense Action Glossary (always visible) */}
          <GlossarySection />
        </>
      )}
    </div>
  )
}

export default DefenseAnalyser
