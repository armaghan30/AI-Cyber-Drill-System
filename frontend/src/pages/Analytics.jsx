import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaChartLine, FaChartBar, FaServer, FaShieldAlt, FaExclamationTriangle,
  FaNetworkWired, FaCheckCircle, FaSkull, FaArrowRight, FaInfoCircle, FaFileAlt, FaSync,
  FaCrosshairs, FaRoute, FaDatabase
} from 'react-icons/fa'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import api from '../api'

const font = { fontFamily: 'Gugi, sans-serif' }

// CVE severity database — covers all topology CVEs used in 4/8/50-host topologies
const CVE_DB = {
  // Windows / Microsoft
  'CVE-2021-34527': { name: 'PrintNightmare',          severity: 'CRITICAL', service: 'Print Spooler',    fix: 'Disable Print Spooler or apply KB5004945' },
  'CVE-2021-1675':  { name: 'PrintNightmare v2',       severity: 'HIGH',     service: 'Print Spooler',    fix: 'Disable Print Spooler on non-print servers' },
  'CVE-2020-0796':  { name: 'SMBGhost',                severity: 'CRITICAL', service: 'SMBv3',            fix: 'Apply KB4551762 or disable SMBv3 compression' },
  'CVE-2017-0144':  { name: 'EternalBlue',             severity: 'CRITICAL', service: 'SMBv1',            fix: 'Apply MS17-010 and disable SMBv1' },
  'CVE-2020-1472':  { name: 'Zerologon',               severity: 'CRITICAL', service: 'Netlogon',         fix: 'Apply August 2020 security update' },
  'CVE-2019-0708':  { name: 'BlueKeep',                severity: 'CRITICAL', service: 'RDP',              fix: 'Apply KB4499175 or enable NLA' },
  'CVE-2021-26855': { name: 'ProxyLogon',              severity: 'CRITICAL', service: 'Exchange Server',  fix: 'Apply Exchange cumulative updates immediately' },
  'CVE-2021-26857': { name: 'Exchange Deserialization', severity: 'HIGH',    service: 'Exchange Server',  fix: 'Apply Microsoft Exchange security updates (March 2021)' },
  'CVE-2021-34535': { name: 'RDP Client RCE',          severity: 'CRITICAL', service: 'Remote Desktop',   fix: 'Apply KB5004237 and restrict RDP client exposure' },
  'CVE-2022-21990': { name: 'RDP Client RCE v2',       severity: 'HIGH',     service: 'Remote Desktop',   fix: 'Apply February 2022 Patch Tuesday updates' },
  'CVE-2022-26923': { name: 'AD CS Priv Esc',          severity: 'CRITICAL', service: 'Active Directory', fix: 'Apply KB5014754 and audit AD CS templates' },
  'CVE-2023-23397': { name: 'Outlook Elevation',       severity: 'CRITICAL', service: 'Outlook',          fix: 'Apply Microsoft security update, block TCP 445 outbound' },
  'CVE-2022-30190': { name: 'Follina',                 severity: 'HIGH',     service: 'MSDT',             fix: 'Disable MSDT URL protocol, apply Microsoft update' },
  // Linux
  'CVE-2022-0847':  { name: 'DirtyPipe',               severity: 'HIGH',     service: 'Linux Kernel',     fix: 'Update kernel to 5.16.11+' },
  'CVE-2021-3156':  { name: 'Baron Samedit',           severity: 'HIGH',     service: 'sudo',             fix: 'Update sudo to 1.9.5p2+' },
  'CVE-2016-5195':  { name: 'DirtyCow',                severity: 'HIGH',     service: 'Linux Kernel',     fix: 'Update kernel to 4.8.3+' },
  'CVE-2021-4034':  { name: 'PwnKit',                  severity: 'HIGH',     service: 'polkit',           fix: 'Update polkit to 0.120+' },
  'CVE-2022-2588':  { name: 'DirtyCred',               severity: 'HIGH',     service: 'Linux Kernel',     fix: 'Update kernel to latest stable' },
  'CVE-2023-0386':  { name: 'OverlayFS Priv Esc',      severity: 'HIGH',     service: 'Linux Kernel',     fix: 'Update kernel to 6.2+' },
  'CVE-2021-3493':  { name: 'OverlayFS Ubuntu',        severity: 'HIGH',     service: 'Linux Kernel',     fix: 'Update Ubuntu kernel packages' },
  // Web / App servers
  'CVE-2021-44228': { name: 'Log4Shell',               severity: 'CRITICAL', service: 'Apache Log4j',    fix: 'Upgrade Log4j to 2.17.1+' },
  'CVE-2022-22965': { name: 'Spring4Shell',            severity: 'CRITICAL', service: 'Spring Framework', fix: 'Upgrade Spring Framework to 5.3.18+' },
  'CVE-2023-44487': { name: 'HTTP/2 Rapid Reset',      severity: 'CRITICAL', service: 'HTTP/2',           fix: 'Update web server to patched version' },
  'CVE-2021-41773': { name: 'Apache Path Traversal',   severity: 'CRITICAL', service: 'Apache httpd',     fix: 'Update Apache to 2.4.50+' },
  'CVE-2019-0211':  { name: 'Apache Priv Esc',         severity: 'HIGH',     service: 'Apache httpd',     fix: 'Update Apache to 2.4.39+' },
  'CVE-2023-0286':  { name: 'OpenSSL X.509 Confusion', severity: 'HIGH',     service: 'OpenSSL',          fix: 'Upgrade OpenSSL to 3.0.8+' },
  // Database
  'CVE-2023-21912': { name: 'MySQL Server DoS',        severity: 'HIGH',     service: 'MySQL',            fix: 'Apply Oracle Critical Patch Update' },
  'CVE-2022-21270': { name: 'MySQL Server Exploit',    severity: 'MEDIUM',   service: 'MySQL',            fix: 'Apply Oracle Jan 2022 CPU' },
  'CVE-2020-14812': { name: 'MySQL Server DoS v2',     severity: 'MEDIUM',   service: 'MySQL',            fix: 'Update MySQL to 8.0.22+' },
  'CVE-2019-2737':  { name: 'MySQL Server XML Vuln',   severity: 'MEDIUM',   service: 'MySQL',            fix: 'Update MySQL to 5.7.27+' },
}



// MITRE counter mapping
const COUNTER_MAP = {
  scan: 'detect', exploit: 'patch', escalate: 'harden',
  lateral_move: 'isolate', exfiltrate: 'restore',
}

const Analytics = () => {
  const nav = useNavigate()
  const [scenarios, setScenarios] = useState([])
  const [selectedScId, setSelectedScId] = useState(null)
  const [topoDetail, setTopoDetail] = useState(null)
  const [sims, setSims] = useState([])
  const [runs, setRuns] = useState([])
  const [defenseData, setDefenseData] = useState(null)
  const [selectedSim, setSelectedSim] = useState(null) // full sim detail with steps
  const [attackPath, setAttackPath] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cveExtras, setCveExtras] = useState({}) // NVD-fetched data for CVEs not in local dict

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [scList, smList, trList] = await Promise.all([
        api.listScenarios().catch(() => []),
        api.listSimulations().catch(() => []),
        api.listTrainingRuns().catch(() => []),
      ])
      setScenarios(scList); setSims(smList); setRuns(trList)

      // load defense analysis
      try { setDefenseData(await api.defenseAnalysis()) } catch {}

      // Auto-select the scenario that was most recently simulated so topology and
      // simulation data always refer to the same run. Fall back to scList[0].
      let targetScId = scList.length > 0 ? scList[0].id : null
      if (smList.length > 0 && scList.length > 0) {
        const latestScId = smList[0].scenario_id
        if (scList.find(s => s.id === latestScId)) targetScId = latestScId
      }
      if (targetScId !== null) {
        setSelectedScId(targetScId)
        try { setTopoDetail(await api.getScenario(targetScId)) } catch {}
      }

      // load latest simulation detail + attack path
      if (smList.length > 0) {
        const latest = smList[0]
        try {
          setSelectedSim(await api.getSimulation(latest.id))
          try { setAttackPath(await api.getAttackPath(latest.id)) } catch {}
        } catch {}
      }
    } catch {}
    setLoading(false)
  }

  const switchScenario = async (id) => {
    setSelectedScId(id)
    try { setTopoDetail(await api.getScenario(id)) } catch {}
    // Also load the most recent simulation for this scenario so charts sync
    const scenarioSim = sims.find(s => s.scenario_id === id)
    if (scenarioSim) {
      try {
        setSelectedSim(await api.getSimulation(scenarioSim.id))
        try { setAttackPath(await api.getAttackPath(scenarioSim.id)) } catch { setAttackPath(null) }
      } catch {}
    } else {
      setSelectedSim(null)
      setAttackPath(null)
    }
  }

  // Batch-fetch CVE data from NVD for any CVE not in the local dictionary
  useEffect(() => {
    if (!topoDetail) return
    const raw = typeof topoDetail.topology_data === 'string' ? JSON.parse(topoDetail.topology_data) : topoDetail.topology_data
    const allIds = Object.values(raw?.network?.hosts || {}).flatMap(h => h.vulnerabilities || [])
    const unknown = [...new Set(allIds)].filter(id => !CVE_DB[id])
    if (unknown.length === 0) return
    api.getCVEBatch(unknown)
      .then(data => setCveExtras(prev => ({ ...prev, ...data })))
      .catch(() => {})
  }, [topoDetail])

  // Merged CVE lookup — local dict first, NVD cache second, fallback third
  const cveInfo = (id) =>
    CVE_DB[id] || cveExtras[id] || { name: id, severity: 'MEDIUM', service: 'Unknown', fix: 'Apply vendor security patch' }

  const loadSimDetail = async (simId) => {
    try {
      setSelectedSim(await api.getSimulation(simId))
      try { setAttackPath(await api.getAttackPath(simId)) } catch { setAttackPath(null) }
    } catch {}
  }

  // ═══ TOPOLOGY DATA ═══
  const rawTopo = typeof topoDetail?.topology_data === 'string' ? JSON.parse(topoDetail.topology_data) : topoDetail?.topology_data
  const hosts = rawTopo?.network?.hosts || {}
  const edges = rawTopo?.network?.edges || []
  const hostNames = Object.keys(hosts)

  const hostVulnData = hostNames.map(name => {
    const h = hosts[name]
    const vulns = h.vulnerabilities || []
    const crit = vulns.filter(v => cveInfo(v)?.severity === 'CRITICAL').length
    const high = vulns.filter(v => cveInfo(v)?.severity === 'HIGH').length
    const medium = vulns.length - crit - high
    return {
      host: name, os: h.os, services: h.services?.length || 0,
      vulns: vulns.length, critical: crit, high, medium,
      sensitivity: h.sensitivity || 'low',
      risk: crit * 10 + high * 5 + (h.sensitivity === 'high' ? 15 : h.sensitivity === 'medium' ? 8 : 2),
    }
  })

  const allCVEs = []
  hostNames.forEach(name => {
    ;(hosts[name]?.vulnerabilities || []).forEach(cve => {
      const info = cveInfo(cve)
      allCVEs.push({ cve, host: name, ...info })
    })
  })
  allCVEs.sort((a, b) => ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[a.severity] || 3) - ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[b.severity] || 3))

  const svcDist = {}
  hostNames.forEach(n => (hosts[n]?.services || []).forEach(s => { svcDist[s] = (svcDist[s] || 0) + 1 }))
  const svcBar = Object.entries(svcDist).map(([name, count]) => ({ name, count }))

  // ═══ SIMULATION DATA ═══
  const simSteps = selectedSim?.steps || []
  const rewardTimeline = simSteps.map((s, i) => ({
    step: s.step_number,
    redCum: simSteps.slice(0, i + 1).reduce((t, x) => t + (x.red_reward || 0), 0),
    blueCum: simSteps.slice(0, i + 1).reduce((t, x) => t + (x.blue_reward || 0), 0),
    redStep: +(s.red_reward || 0).toFixed(2),
    blueStep: +(s.blue_reward || 0).toFixed(2),
  }))

  const redActionCounts = {}, blueActionCounts = {}
  simSteps.forEach(s => {
    const ra = s.red_action?.action || 'idle'; redActionCounts[ra] = (redActionCounts[ra] || 0) + 1
    const ba = s.blue_action?.action || 'idle'; blueActionCounts[ba] = (blueActionCounts[ba] || 0) + 1
  })
  const redActBar = Object.entries(redActionCounts).map(([name, value]) => ({ name, value }))
  const blueActBar = Object.entries(blueActionCounts).map(([name, value]) => ({ name, value }))

  // defense stats (used only for top overview cards)
  const winRate = defenseData?.win_rate || 0
  const totalSims = defenseData?.total_simulations || sims.length

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-green-300 text-lg" style={font}>Loading analytics...</div></div>
  }

  // ═══ EMPTY STATE ═══
  if (scenarios.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-green-100" style={font}>Analytics</h1>
        <div className="bg-gray-800/30 border-2 border-green-900/50 p-12 text-center shadow-xl space-y-4">
          <FaChartBar className="text-green-300/30 text-6xl mx-auto" />
          <h2 className="text-xl text-green-200/70" style={font}>No Data Yet</h2>
          <p className="text-green-300/50 max-w-lg mx-auto" style={font}>
            Upload a YAML topology file in the AI Orchestrator to start. The system will train agents,
            run simulations, and the results will appear here.
          </p>
          <button onClick={() => nav('/ai-orchestrator')}
            className="px-6 py-3 border-2 border-green-600 text-green-100 bg-green-900/30 hover:bg-green-900/50 transition-all" style={font}>
            Go to AI Orchestrator
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-green-100 mb-2" style={font}>Analytics</h1>
          <p className="text-green-200/70" style={font}>Network analysis, simulation results, and defense performance for your uploaded topology</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 border-2 border-green-900/50 text-green-200 hover:bg-green-900/30 transition-all" style={font}>
          <FaSync /> Refresh
        </button>
      </div>

      {/* Scenario Selector */}
      {scenarios.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {scenarios.map(sc => (
            <button key={sc.id} onClick={() => switchScenario(sc.id)}
              className={`px-4 py-2 border-2 text-sm transition-all ${
                selectedScId === sc.id ? 'bg-green-900/50 border-green-500 text-green-100' : 'bg-gray-900/30 border-green-900/50 text-green-200/70 hover:border-green-700'
              }`} style={font}>{sc.name} ({sc.num_hosts} hosts)</button>
          ))}
        </div>
      )}

      {/* ═══ OVERVIEW CARDS ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Network Hosts', val: hostNames.length, icon: FaServer, color: 'text-green-400', desc: 'Hosts in your topology' },
          { label: 'Total CVEs', val: allCVEs.length, icon: FaExclamationTriangle, color: 'text-red-400', desc: 'Known vulnerabilities found' },
          { label: 'Simulations Run', val: totalSims, icon: FaNetworkWired, color: 'text-blue-400', desc: 'Red vs Blue drills completed' },
          { label: 'Blue Win Rate', val: `${winRate}%`, icon: FaShieldAlt, color: 'text-green-400', desc: 'Defense success rate' },
        ].map((c, i) => {
          const Icon = c.icon
          return (
            <div key={i} className="bg-gray-800/30 border-2 border-green-900/50 p-5 shadow-xl">
              <div className="flex items-center gap-2 mb-2"><Icon className={c.color} /><p className="text-xs text-green-200/70" style={font}>{c.label}</p></div>
              <p className={`text-3xl font-bold ${c.color}`} style={font}>{c.val}</p>
              <p className="text-[10px] text-green-200/40 mt-1" style={font}>{c.desc}</p>
            </div>
          )
        })}
      </div>

      {/* ═══ NETWORK TOPOLOGY ANALYSIS ═══ */}
      {hostNames.length > 0 && (
        <>
          {/* Charts Row 1: Severity Distribution + Vulns per Host */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Severity Distribution — horizontal bars instead of pie */}
            <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
              <h2 className="text-xl font-bold text-green-100 mb-4" style={font}>CVE Severity Distribution</h2>
              <div className="space-y-4">
                {[
                  { label: 'CRITICAL', count: allCVEs.filter(c => c.severity === 'CRITICAL').length, color: '#dc2626', bg: 'bg-red-900/20', border: 'border-red-800/40', text: 'text-red-400' },
                  { label: 'HIGH', count: allCVEs.filter(c => c.severity === 'HIGH').length, color: '#f59e0b', bg: 'bg-yellow-900/20', border: 'border-yellow-800/40', text: 'text-yellow-400' },
                  { label: 'MEDIUM', count: allCVEs.filter(c => c.severity === 'MEDIUM').length, color: '#8b5cf6', bg: 'bg-purple-900/20', border: 'border-purple-800/40', text: 'text-purple-400' },
                  { label: 'LOW', count: allCVEs.filter(c => c.severity === 'LOW').length, color: '#22c55e', bg: 'bg-green-900/20', border: 'border-green-800/40', text: 'text-green-400' },
                ].filter(s => s.count > 0).map(s => {
                  const pct = allCVEs.length > 0 ? (s.count / allCVEs.length) * 100 : 0
                  return (
                    <div key={s.label} className={`${s.bg} border ${s.border} p-3`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-bold ${s.text}`} style={font}>{s.label}</span>
                        <span className="text-green-100 text-sm font-bold" style={font}>{s.count} <span className="text-green-200/40 text-xs font-normal">({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div className="w-full h-3 bg-gray-900/50 border border-green-900/20 overflow-hidden">
                        <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: s.color }}></div>
                      </div>
                    </div>
                  )
                })}
                <div className="pt-2 border-t border-green-900/30 flex items-center justify-between">
                  <span className="text-xs text-green-200/50" style={font}>Total Vulnerabilities</span>
                  <span className="text-lg font-bold text-green-100" style={font}>{allCVEs.length}</span>
                </div>
              </div>
            </div>

            {/* Vulnerabilities Per Host — custom bars */}
            <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
              <h2 className="text-xl font-bold text-green-100 mb-4" style={font}>Vulnerabilities Per Host</h2>
              <div className="space-y-3">
                {hostVulnData.map(h => {
                  const maxVulns = Math.max(...hostVulnData.map(x => x.vulns), 1)
                  const totalPct = (h.vulns / maxVulns) * 100
                  const critPct = h.vulns > 0 ? (h.critical / h.vulns) * totalPct : 0
                  const highPct = h.vulns > 0 ? (h.high / h.vulns) * totalPct : 0
                  const medPct = h.vulns > 0 ? (h.medium / h.vulns) * totalPct : 0
                  return (
                    <div key={h.host} className="bg-gray-900/20 border border-green-900/30 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FaServer className="text-green-400 text-xs" />
                          <span className="text-green-100 text-sm font-bold" style={font}>{h.host}</span>
                          <span className="text-green-200/40 text-[10px]" style={font}>{h.os}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-1.5 py-0.5 border ${
                            h.sensitivity === 'high' ? 'border-red-700/50 text-red-400' : h.sensitivity === 'medium' ? 'border-yellow-700/50 text-yellow-400' : 'border-green-700/50 text-green-400'
                          }`} style={font}>{h.sensitivity}</span>
                          <span className="text-green-100 font-bold text-sm" style={font}>{h.vulns}</span>
                        </div>
                      </div>
                      <div className="w-full h-4 bg-gray-900/50 border border-green-900/20 overflow-hidden flex">
                        {h.critical > 0 && <div className="h-full" style={{ width: `${critPct}%`, backgroundColor: '#dc2626' }}></div>}
                        {h.high > 0 && <div className="h-full" style={{ width: `${highPct}%`, backgroundColor: '#f59e0b' }}></div>}
                        {h.medium > 0 && <div className="h-full" style={{ width: `${medPct}%`, backgroundColor: '#8b5cf6' }}></div>}
                      </div>
                      <div className="flex gap-3 mt-1">
                        {h.critical > 0 && <span className="text-[10px] text-red-400" style={font}>{h.critical} Critical</span>}
                        {h.high > 0 && <span className="text-[10px] text-yellow-400" style={font}>{h.high} High</span>}
                        {h.medium > 0 && <span className="text-[10px] text-purple-400" style={font}>{h.medium} Medium</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Exposed Services */}
          <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-green-100 mb-4" style={font}>Exposed Services Across Network</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {svcBar.map(s => (
                <div key={s.name} className="bg-gray-900/30 border border-green-900/30 p-4 text-center hover:border-green-700/50 transition-all">
                  <p className="text-green-400 font-bold text-lg mb-1" style={font}>{s.name}</p>
                  <p className="text-2xl font-bold text-green-100" style={font}>{s.count}</p>
                  <p className="text-[10px] text-green-200/40 mt-1" style={font}>{s.count === 1 ? '1 host' : `${s.count} hosts`}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ═══ SIMULATION RESULTS ═══ */}
      {selectedSim && simSteps.length > 0 && (
        <>
          <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-green-100 mb-4" style={font}>
              <FaCrosshairs className="inline mr-2 text-red-400" />Latest Simulation Results — Drill #{Math.max(1, sims.length - sims.findIndex(s => s.id === selectedSim.id))}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-900/30 p-3 border border-green-900/30"><p className="text-xs text-green-200/50" style={font}>Steps</p><p className="text-2xl font-bold text-green-100" style={font}>{selectedSim.total_steps}</p></div>
              <div className="bg-gray-900/30 p-3 border border-red-900/30"><p className="text-xs text-red-200/50" style={font}>Red Reward</p><p className="text-2xl font-bold text-red-400" style={font}>{selectedSim.total_red_reward?.toFixed(2)}</p></div>
              <div className="bg-gray-900/30 p-3 border border-blue-900/30"><p className="text-xs text-blue-200/50" style={font}>Blue Reward</p><p className="text-2xl font-bold text-blue-400" style={font}>{selectedSim.total_blue_reward?.toFixed(2)}</p></div>
              <div className={`bg-gray-900/30 p-3 border ${selectedSim.total_blue_reward >= selectedSim.total_red_reward ? 'border-blue-700/50' : 'border-red-700/50'}`}>
                <p className="text-xs text-green-200/50" style={font}>Winner</p>
                <p className={`text-2xl font-bold ${selectedSim.total_blue_reward >= selectedSim.total_red_reward ? 'text-blue-400' : 'text-red-400'}`} style={font}>
                  {selectedSim.total_blue_reward >= selectedSim.total_red_reward ? 'BLUE' : 'RED'}
                </p>
              </div>
            </div>

            {/* Cumulative Reward Chart */}
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={rewardTimeline}>
                <defs>
                  <linearGradient id="gRed" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} /></linearGradient>
                  <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3a1a" />
                <XAxis dataKey="step" stroke="#4ade80" tick={{ fontSize: 11 }} label={{ value: 'Step', position: 'insideBottom', offset: -5, fill: '#4ade80' }} />
                <YAxis stroke="#4ade80" tick={{ fontSize: 11 }} label={{ value: 'Cumulative Reward', angle: -90, position: 'insideLeft', fill: '#4ade80' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #166534', color: '#4ade80' }} />
                <Legend />
                <Area type="monotone" dataKey="redCum" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#gRed)" name="Red (Attacker)" />
                <Area type="monotone" dataKey="blueCum" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#gBlue)" name="Blue (Defender)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Action Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
              <h2 className="text-xl font-bold text-red-400 mb-4" style={font}><FaSkull className="inline mr-2" />Red Agent Actions</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={redActBar}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a3a1a" />
                  <XAxis dataKey="name" stroke="#4ade80" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke="#4ade80" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #166534', color: '#4ade80' }} />
                  <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} name="Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
              <h2 className="text-xl font-bold text-blue-400 mb-4" style={font}><FaShieldAlt className="inline mr-2" />Blue Agent Actions</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={blueActBar}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a3a1a" />
                  <XAxis dataKey="name" stroke="#4ade80" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke="#4ade80" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #166534', color: '#4ade80' }} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Step-by-Step Log */}
          <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-green-100 mb-2" style={font}>Step-by-Step Breakdown</h2>
            <p className="text-green-200/50 text-sm mb-2" style={font}>Each step shows Red (attacker) action vs Blue (defender) response. A "Counter Match" means the Blue agent correctly chose the MITRE-aligned defense for the Red attack.</p>
            <p className="text-blue-200/40 text-xs mb-4 italic" style={font}><FaInfoCircle className="inline mr-1" />Note: MaskablePPO agents select actions based on learned reward maximization, not a fixed kill-chain sequence. The Red agent may choose actions like 'exfiltrate' early if the model learned it yields higher reward in that state.</p>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {simSteps.map(s => {
                const ra = s.red_action?.action || 'idle'
                const ba = s.blue_action?.action || 'idle'
                const expectedCounter = COUNTER_MAP[ra]
                const isCounter = expectedCounter === ba
                return (
                  <div key={s.step_number} className="bg-gray-900/30 border border-green-900/30 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-green-900/40 text-green-300 text-xs font-bold px-2 py-0.5 rounded-full" style={font}>Step {s.step_number}</span>
                      {isCounter && <span className="text-xs px-2 py-0.5 bg-green-900/30 border border-green-600/50 text-green-400" style={font}>Counter Match</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-red-950/20 border border-red-900/30 p-2 rounded">
                        <div className="flex items-center justify-between">
                          <span className="text-red-300 font-bold text-xs capitalize" style={font}><FaSkull className="inline mr-1" />Red: {ra.replace('_',' ')}</span>
                          <span className={`text-xs font-mono ${s.red_reward >= 0 ? 'text-red-400' : 'text-red-300/60'}`}>{s.red_reward >= 0 ? '+' : ''}{(s.red_reward || 0).toFixed(2)}</span>
                        </div>
                        {s.red_action?.target && <p className="text-red-200/40 text-[10px] mt-1" style={font}>Target: {s.red_action.target}</p>}
                      </div>
                      <div className="bg-blue-950/20 border border-blue-900/30 p-2 rounded">
                        <div className="flex items-center justify-between">
                          <span className="text-blue-300 font-bold text-xs capitalize" style={font}><FaShieldAlt className="inline mr-1" />Blue: {ba.replace('_',' ')}</span>
                          <span className={`text-xs font-mono ${s.blue_reward >= 0 ? 'text-blue-400' : 'text-blue-300/60'}`}>{s.blue_reward >= 0 ? '+' : ''}{(s.blue_reward || 0).toFixed(2)}</span>
                        </div>
                        {s.blue_action?.target && <p className="text-blue-200/40 text-[10px] mt-1" style={font}>Target: {s.blue_action.target}</p>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ═══ ATTACK PATH ═══ */}
      {attackPath && attackPath.entry_point && (
        <div className="bg-gray-800/30 border-2 border-red-900/40 p-6 shadow-xl">
          <h2 className="text-xl font-bold text-red-400 mb-1 flex items-center gap-2" style={font}>
            <FaRoute className="text-red-400" /> Red Agent Attack Path
          </h2>
          <p className="text-green-200/50 text-sm mb-5" style={font}>
            Full pathway the Red agent took through your network — from initial entry to exfiltration
          </p>

          {/* Path string banner */}
          <div className="bg-gray-900/40 border border-red-900/30 p-4 mb-5 overflow-x-auto">
            <p className="text-xs text-green-200/40 mb-2" style={font}>Attack Route</p>
            <div className="flex items-center gap-1 flex-wrap">
              {attackPath.path_string.split(' → ').map((node, i, arr) => (
                <React.Fragment key={i}>
                  <span className={`px-3 py-1.5 text-sm font-bold border ${
                    node === 'INTERNET' ? 'border-blue-700/60 text-blue-300 bg-blue-900/20'
                    : node === 'EXFIL'  ? 'border-red-700/60 text-red-300 bg-red-900/20'
                    : 'border-orange-700/60 text-orange-300 bg-orange-900/20'
                  }`} style={font}>{node}</span>
                  {i < arr.length - 1 && <FaArrowRight className="text-red-500/60 text-xs flex-shrink-0" />}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Compromised path */}
          {attackPath.compromised_path.length > 0 && (
            <div className="mb-5">
              <p className="text-xs text-green-200/50 mb-3" style={font}>Compromised Host Chain</p>
              <div className="space-y-2">
                {attackPath.compromised_path.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-900/30 border border-orange-900/30 p-3">
                    <span className="text-orange-400 font-bold text-xs w-5 text-center" style={font}>{i + 1}</span>
                    <FaServer className="text-orange-400 text-sm flex-shrink-0" />
                    <span className="text-orange-200 font-bold text-sm" style={font}>{item.host}</span>
                    <span className={`text-xs px-2 py-0.5 border ml-auto ${
                      item.method === 'exploit'
                        ? 'border-red-700/50 text-red-400 bg-red-900/10'
                        : 'border-yellow-700/50 text-yellow-400 bg-yellow-900/10'
                    }`} style={font}>{item.method === 'exploit' ? 'Exploited' : 'Lateral Move'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lateral movements */}
          {attackPath.lateral_movements.length > 0 && (
            <div className="mb-5">
              <p className="text-xs text-green-200/50 mb-3" style={font}>Lateral Movements</p>
              <div className="flex flex-wrap gap-2">
                {attackPath.lateral_movements.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-900/30 border border-yellow-900/30 px-3 py-2 text-sm">
                    <span className="text-yellow-300 font-bold" style={font}>{m.from || '?'}</span>
                    <FaArrowRight className="text-yellow-500/60 text-xs" />
                    <span className="text-yellow-300 font-bold" style={font}>{m.to}</span>
                    <span className="text-green-200/30 text-xs" style={font}>step {m.step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exfiltrated hosts */}
          {attackPath.exfiltrated_hosts.length > 0 && (
            <div className="mb-5">
              <p className="text-xs text-green-200/50 mb-3" style={font}>Data Exfiltrated From</p>
              <div className="flex flex-wrap gap-2">
                {attackPath.exfiltrated_hosts.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 bg-red-900/20 border border-red-700/50 px-3 py-2 text-sm">
                    <FaDatabase className="text-red-400 text-xs" />
                    <span className="text-red-300 font-bold" style={font}>{h}</span>
                    <span className="text-red-400 text-xs" style={font}>DATA STOLEN</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-red-900/30">
            {[
              { label: 'Total Actions', val: attackPath.total_actions },
              { label: 'Successful Hits', val: attackPath.successful_actions },
              { label: 'Hosts Breached', val: attackPath.compromised_path.length },
              { label: 'Hosts Exfiltrated', val: attackPath.exfiltrated_hosts.length },
            ].map((s, i) => (
              <div key={i} className="bg-gray-900/30 border border-red-900/30 p-3 text-center">
                <p className="text-xs text-green-200/40 mb-1" style={font}>{s.label}</p>
                <p className="text-xl font-bold text-red-400" style={font}>{s.val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No simulation yet */}
      {(!selectedSim || simSteps.length === 0) && scenarios.length > 0 && (
        <div className="bg-gray-800/30 border-2 border-green-900/50 p-12 text-center shadow-xl space-y-3">
          <FaNetworkWired className="text-green-300/30 text-5xl mx-auto" />
          <p className="text-green-200/50" style={font}>No simulation results yet. Go to the AI Orchestrator to run a drill.</p>
          <button onClick={() => nav('/ai-orchestrator')}
            className="px-5 py-2 border-2 border-green-700/50 text-green-200 hover:bg-green-900/30 transition-all text-sm" style={font}>
            Go to AI Orchestrator
          </button>
        </div>
      )}

      {/* CTA to Report */}
      <div className="bg-gradient-to-r from-green-900/20 to-blue-900/15 border-2 border-green-800/40 p-6 shadow-xl flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-green-100" style={font}>Ready for the full security report?</h2>
          <p className="text-green-200/60 text-sm" style={font}>
            Get topology-specific recommendations, CVE patching priorities, firewall placement, and download as PDF.
          </p>
        </div>
        <button onClick={() => nav('/report')}
          className="flex items-center gap-2 px-6 py-3 bg-green-900/40 border-2 border-green-600 text-green-100 hover:bg-green-900/60 transition-all flex-shrink-0" style={font}>
          <FaFileAlt /> View Report
        </button>
      </div>

    </div>
  )
}

export default Analytics
