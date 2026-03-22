import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaShieldAlt, FaExclamationTriangle, FaBug, FaNetworkWired,
  FaServer, FaLock, FaFileDownload, FaArrowLeft, FaBrain,
  FaCheckCircle, FaTimesCircle, FaInfoCircle, FaFireAlt,
  FaWrench, FaChartLine
} from 'react-icons/fa'
import api from '../api'

const font = { fontFamily: 'Gugi, sans-serif' }

const SEVERITY_COLORS = {
  CRITICAL: { bg: 'bg-red-900/40', border: 'border-red-500', text: 'text-red-300', badge: 'bg-red-500/30 text-red-200' },
  HIGH: { bg: 'bg-orange-900/40', border: 'border-orange-500', text: 'text-orange-300', badge: 'bg-orange-500/30 text-orange-200' },
  MEDIUM: { bg: 'bg-yellow-900/40', border: 'border-yellow-500', text: 'text-yellow-300', badge: 'bg-yellow-500/30 text-yellow-200' },
  LOW: { bg: 'bg-blue-900/40', border: 'border-blue-500', text: 'text-blue-300', badge: 'bg-blue-500/30 text-blue-200' },
}

const COUNTER_MAP = {
  scan: { blue: 'Detect', mitre: 'Discovery (TA0007)', fix: 'Deploy IDS/IPS, enable network monitoring and anomaly detection' },
  exploit: { blue: 'Patch', mitre: 'Initial Access (TA0001)', fix: 'Apply security patches, update vulnerable software, use WAF' },
  escalate: { blue: 'Harden', mitre: 'Privilege Escalation (TA0004)', fix: 'Enforce least privilege, disable unnecessary services, harden OS configs' },
  lateral_move: { blue: 'Isolate', mitre: 'Lateral Movement (TA0008)', fix: 'Segment network with firewalls, implement micro-segmentation, restrict RDP/SSH' },
  exfiltrate: { blue: 'Restore', mitre: 'Exfiltration (TA0010)', fix: 'Enable DLP, encrypt sensitive data, maintain verified backups for quick restore' },
}

const CVE_DATABASE = {
  'CVE-2021-44228': { name: 'Log4Shell', severity: 'CRITICAL', desc: 'Remote code execution in Apache Log4j 2.x', fix: 'Upgrade Log4j to 2.17.1+. Set log4j2.formatMsgNoLookups=true as interim mitigation.' },
  'CVE-2021-34527': { name: 'PrintNightmare', severity: 'CRITICAL', desc: 'Windows Print Spooler remote code execution', fix: 'Disable Print Spooler service on non-print servers. Apply KB5005010 patch.' },
  'CVE-2023-0286': { name: 'OpenSSL X.509 Type Confusion', severity: 'HIGH', desc: 'X.509 certificate verification vulnerability', fix: 'Upgrade OpenSSL to 3.0.8+ or 1.1.1t+.' },
  'CVE-2022-22965': { name: 'Spring4Shell', severity: 'CRITICAL', desc: 'Spring Framework RCE via data binding', fix: 'Upgrade Spring Framework to 5.3.18+ or 5.2.20+.' },
  'CVE-2023-23397': { name: 'Outlook Elevation', severity: 'CRITICAL', desc: 'Microsoft Outlook elevation of privilege', fix: 'Apply Microsoft security update. Block TCP 445 outbound at firewall.' },
  'CVE-2022-30190': { name: 'Follina', severity: 'HIGH', desc: 'Microsoft MSDT remote code execution', fix: 'Disable MSDT URL protocol. Apply Microsoft security update.' },
  'CVE-2021-26855': { name: 'ProxyLogon', severity: 'CRITICAL', desc: 'Microsoft Exchange Server SSRF', fix: 'Apply Exchange cumulative updates. Restrict external access to ECP/OWA.' },
  'CVE-2020-1472': { name: 'Zerologon', severity: 'CRITICAL', desc: 'Netlogon elevation of privilege', fix: 'Apply August 2020 security update. Enable Domain Controller enforcement mode.' },
}

const Report = () => {
  const navigate = useNavigate()
  const [scenarios, setScenarios] = useState([])
  const [selectedScenario, setSelectedScenario] = useState(null)
  const [topoData, setTopoData] = useState(null)
  const [simulations, setSimulations] = useState([])
  const [latestSim, setLatestSim] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const scList = await api.listMyScenarios()
      setScenarios(scList)
      if (scList.length > 0) {
        await selectScenario(scList[0])
      }
    } catch (e) {
      console.error('Failed to load scenarios:', e)
    } finally {
      setLoading(false)
    }
  }

  const selectScenario = async (sc) => {
    setSelectedScenario(sc)
    try {
      const detail = await api.getScenario(sc.id)
      const topo = typeof detail.topology_data === 'string' ? JSON.parse(detail.topology_data) : detail.topology_data
      setTopoData(topo)
    } catch { setTopoData(null) }
    try {
      const sims = await api.listMySimulations()
      const scenarioSims = sims.filter(s => s.scenario_id === sc.id)
      setSimulations(scenarioSims)
      if (scenarioSims.length > 0) {
        const latest = scenarioSims[scenarioSims.length - 1]
        try {
          const full = await api.getSimulation(latest.id)
          setLatestSim(full)
        } catch { setLatestSim(latest) }
      } else {
        setLatestSim(null)
      }
    } catch { setSimulations([]); setLatestSim(null) }
  }

  // Parse topology — actual structure is { network: { hosts: {dict}, edges: [["A","B"]] } }
  const rawHosts = topoData?.network?.hosts || {}
  const rawEdges = topoData?.network?.edges || []

  // Convert dict to array with name field
  const hosts = Object.entries(rawHosts).map(([name, info]) => ({
    name,
    os: info.os || 'Unknown',
    services: info.services || [],
    vulnerabilities: info.vulnerabilities || [],
    sensitivity: info.sensitivity || 'low',
  }))

  // Convert ["H1","H2"] arrays to {source, target} objects
  const edges = rawEdges.map(e => Array.isArray(e) ? { source: e[0], target: e[1] } : e)

  const allCVEs = hosts.flatMap(h =>
    h.vulnerabilities.map(c => ({
      ...(CVE_DATABASE[c] || { name: c, severity: 'HIGH', desc: 'Known vulnerability', fix: 'Apply vendor security patch' }),
      id: c,
      host: h.name,
      os: h.os,
      services: h.services,
    }))
  )

  const criticalCount = allCVEs.filter(c => c.severity === 'CRITICAL').length
  const highCount = allCVEs.filter(c => c.severity === 'HIGH').length

  const getHostRisk = (h) => {
    let risk = 0
    h.vulnerabilities.forEach(c => {
      const info = CVE_DATABASE[c]
      risk += info?.severity === 'CRITICAL' ? 40 : info?.severity === 'HIGH' ? 25 : 15
    })
    if (h.sensitivity === 'high') risk += 20
    if (h.services.length > 2) risk += 10
    return Math.min(risk, 100)
  }

  const simSteps = latestSim?.steps || latestSim?.result?.steps || []
  const totalRedReward = simSteps.reduce((s, st) => s + (st.red_reward || 0), 0)
  const totalBlueReward = simSteps.reduce((s, st) => s + (st.blue_reward || 0), 0)
  const blueWon = totalBlueReward >= totalRedReward

  const generatePrintableReport = () => {
    const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const reportTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

    const hostRows = hosts.map(h => {
      const risk = getHostRisk(h)
      const riskLabel = risk >= 70 ? 'CRITICAL' : risk >= 40 ? 'HIGH' : risk >= 20 ? 'MEDIUM' : 'LOW'
      const badgeClass = risk >= 70 ? 'badge-critical' : risk >= 40 ? 'badge-high' : risk >= 20 ? 'badge-medium' : 'badge-low'
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;font-weight:600">${h.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6">${h.os || 'Unknown'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;font-size:12px">${(h.services || []).join(', ') || 'None'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;text-align:center">${(h.vulnerabilities || []).length}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;text-transform:capitalize">${h.sensitivity || 'normal'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;text-align:center"><span class="${badgeClass}" style="display:inline-block;padding:2px 10px;font-size:11px;font-weight:700;border-radius:3px">${riskLabel} (${risk}%)</span></td>
      </tr>`
    }).join('')

    const cveRows = allCVEs.map(c => {
      const sev = c.severity || 'HIGH'
      const badgeClass = sev === 'CRITICAL' ? 'badge-critical' : sev === 'HIGH' ? 'badge-high' : sev === 'MEDIUM' ? 'badge-medium' : 'badge-low'
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;font-weight:600;font-family:monospace">${c.id}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6">${c.name || 'Unknown CVE'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6"><span class="${badgeClass}" style="display:inline-block;padding:2px 10px;font-size:11px;font-weight:700;border-radius:3px">${sev}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6">${c.host}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;font-size:12px">${c.fix || c.desc || 'Apply vendor security patch'}</td>
      </tr>`
    }).join('')

    const firewallRecs = edges.map(e => {
      const src = hosts.find(h => (h.name) === e.source)
      const tgt = hosts.find(h => (h.name) === e.target)
      const srcRisk = src ? getHostRisk(src) : 0
      const tgtRisk = tgt ? getHostRisk(tgt) : 0
      if (srcRisk >= 40 || tgtRisk >= 40) {
        return `<li style="margin-bottom:6px">Deploy firewall between <strong>${e.source}</strong> and <strong>${e.target}</strong> &mdash; ${srcRisk >= 70 || tgtRisk >= 70 ? 'CRITICAL: one or both hosts have severe vulnerabilities' : 'HIGH risk connection detected'}</li>`
      }
      return ''
    }).filter(Boolean).join('')

    const isolationRecs = hosts.filter(h => getHostRisk(h) >= 70).map(h =>
      `<li style="margin-bottom:6px"><strong>${h.name}</strong> (Risk: ${getHostRisk(h)}%) &mdash; Immediately isolate from network. ${(h.vulnerabilities || []).length} unpatched CVE(s), ${h.sensitivity === 'high' ? 'HIGH sensitivity asset' : 'standard asset'}.</li>`
    ).join('')

    const patchPriority = [...allCVEs]
      .sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
        return (order[a.severity] || 2) - (order[b.severity] || 2)
      })
      .map((c, i) => {
        const sev = c.severity || 'HIGH'
        const badgeClass = sev === 'CRITICAL' ? 'badge-critical' : sev === 'HIGH' ? 'badge-high' : 'badge-medium'
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;text-align:center">${i + 1}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;font-weight:600;font-family:monospace">${c.id}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #dee2e6"><span class="${badgeClass}" style="display:inline-block;padding:2px 10px;font-size:11px;font-weight:700;border-radius:3px">${sev}</span></td>
          <td style="padding:8px 12px;border-bottom:1px solid #dee2e6">${c.host}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;font-size:12px">${c.fix || 'Apply vendor patch immediately'}</td>
        </tr>`
      }).join('')

    const mitreRows = Object.entries(COUNTER_MAP).map(([red, info]) =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;font-weight:600;text-transform:capitalize;color:#c0392b">${red.replace('_', ' ')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6">${info.mitre}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;font-weight:600;color:#2980b9">${info.blue}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;font-size:12px">${info.fix}</td>
      </tr>`
    ).join('')

    const serviceHardening = [...new Set(hosts.flatMap(h => h.services || []))].map(svc => {
      const recs = {
        ssh: 'Disable root login, use key-based auth only, change default port, enable fail2ban',
        http: 'Enable HTTPS with TLS 1.3, deploy WAF, set security headers (CSP, HSTS, X-Frame-Options)',
        https: 'Use TLS 1.3, enable HSTS preloading, configure certificate pinning',
        ftp: 'Replace with SFTP, disable anonymous access, encrypt all transfers',
        smb: 'Disable SMBv1, require SMB signing, restrict access by IP',
        rdp: 'Enable NLA, use MFA, restrict to VPN-only access, change default port',
        mysql: 'Bind to localhost only, use strong passwords, enable audit logging',
        dns: 'Enable DNSSEC, restrict zone transfers, use Response Rate Limiting',
        smtp: 'Enable SPF/DKIM/DMARC, require TLS, disable open relay',
      }
      return `<li style="margin-bottom:6px"><strong>${svc.toUpperCase()}</strong>: ${recs[svc.toLowerCase()] || 'Review service configuration, apply vendor security best practices, restrict access'}</li>`
    }).join('')

    const stepsTable = simSteps.map((s, i) => {
      const ra = s.red_action?.action || 'idle'
      const ba = s.blue_action?.action || 'idle'
      const rt = s.red_action?.target || '-'
      const bt = s.blue_action?.target || '-'
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;text-align:center">${s.step_number}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;color:#c0392b;font-weight:600;text-transform:capitalize">${ra.replace('_',' ')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6">${rt}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;text-align:right;font-family:monospace">${(s.red_reward||0).toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;color:#2980b9;font-weight:600;text-transform:capitalize">${ba.replace('_',' ')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6">${bt}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #dee2e6;text-align:right;font-family:monospace">${(s.blue_reward||0).toFixed(2)}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Penetration Test Report — ${selectedScenario?.name || 'Network'}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Georgia,'Times New Roman',serif; background:#fff; color:#222; padding:60px 70px; line-height:1.7; font-size:14px; }
  @media print {
    body { padding:40px 50px; }
    .no-print { display:none !important; }
    .page-break { page-break-before:always; }
  }
  h1 { font-size:28px; font-weight:700; color:#1a1a1a; margin:0; }
  h2 { font-size:18px; font-weight:700; color:#1a1a1a; margin:36px 0 12px; padding-bottom:6px; border-bottom:2px solid #1a1a1a; text-transform:uppercase; letter-spacing:1px; }
  h3 { font-size:15px; font-weight:700; color:#333; margin:20px 0 8px; }
  p { margin:8px 0; }
  table { width:100%; border-collapse:collapse; margin:12px 0; font-size:13px; }
  th { background:#f4f4f4; color:#1a1a1a; padding:10px 12px; text-align:left; border-bottom:2px solid #333; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; font-family:Arial,Helvetica,sans-serif; }
  td { padding:8px 12px; border-bottom:1px solid #dee2e6; vertical-align:top; }
  .cover { text-align:center; padding:80px 0 60px; border-bottom:3px solid #1a1a1a; margin-bottom:40px; }
  .cover h1 { font-size:36px; margin-bottom:8px; }
  .cover .subtitle { font-size:16px; color:#555; margin-bottom:30px; }
  .cover .meta { font-size:13px; color:#666; line-height:2; }
  .cover .meta strong { color:#333; }
  .badge { display:inline-block; padding:2px 10px; font-size:11px; font-weight:700; font-family:Arial,sans-serif; border-radius:3px; text-transform:uppercase; }
  .badge-critical { background:#fde8e8; color:#c0392b; border:1px solid #e6b0aa; }
  .badge-high { background:#fef5e7; color:#e67e22; border:1px solid #f5cba7; }
  .badge-medium { background:#eaf2f8; color:#2980b9; border:1px solid #aed6f1; }
  .badge-low { background:#eafaf1; color:#27ae60; border:1px solid #a9dfbf; }
  .finding-box { border:1px solid #ddd; padding:16px; margin:12px 0; background:#fafafa; }
  .finding-box.critical { border-left:4px solid #c0392b; }
  .finding-box.high { border-left:4px solid #e67e22; }
  .risk-bar { display:inline-block; height:14px; border-radius:2px; }
  ul { padding-left:24px; margin:8px 0; }
  li { margin-bottom:4px; }
  .two-col { display:flex; gap:40px; }
  .two-col > div { flex:1; }
  .toc { margin:20px 0 40px; }
  .toc a { color:#2c3e50; text-decoration:none; }
  .toc li { margin-bottom:6px; font-size:14px; }
  .footer { margin-top:50px; padding-top:16px; border-top:2px solid #1a1a1a; text-align:center; color:#888; font-size:11px; font-family:Arial,sans-serif; }
  .stamp { display:inline-block; border:3px solid #c0392b; color:#c0392b; padding:6px 20px; font-size:14px; font-weight:700; font-family:Arial,sans-serif; text-transform:uppercase; letter-spacing:2px; transform:rotate(-5deg); margin-top:20px; }
</style></head><body>

<!-- COVER PAGE -->
<div class="cover">
  <h1>Penetration Test Report</h1>
  <p class="subtitle">AI-Powered Cyber Drill System &mdash; Automated Security Assessment</p>
  <div style="margin:24px 0"><span class="stamp">${blueWon ? 'DEFENDED' : 'BREACHED'}</span></div>
  <div class="meta">
    <strong>Target Network:</strong> ${selectedScenario?.name || 'Unknown Topology'}<br>
    <strong>Assessment Date:</strong> ${reportDate}<br>
    <strong>Report Generated:</strong> ${reportTime}<br>
    <strong>Scope:</strong> ${hosts.length} Hosts | ${edges.length} Network Links | ${allCVEs.length} Vulnerabilities<br>
    <strong>Methodology:</strong> SB3 DQN Reinforcement Learning (Red/Blue Agents) aligned with MITRE ATT&CK<br>
    <strong>Classification:</strong> CONFIDENTIAL
  </div>
</div>

<!-- TABLE OF CONTENTS -->
<h2>Table of Contents</h2>
<ol class="toc">
  <li><a href="#exec">Executive Summary</a></li>
  <li><a href="#scope">Scope &amp; Methodology</a></li>
  <li><a href="#sim">Simulation Results</a></li>
  <li><a href="#hosts">Host Risk Assessment</a></li>
  <li><a href="#vulns">Vulnerability Findings</a></li>
  <li><a href="#patch">Patching Priority</a></li>
  <li><a href="#mitre">MITRE ATT&CK Mapping</a></li>
  <li><a href="#network">Network Security Recommendations</a></li>
  <li><a href="#services">Service Hardening</a></li>
  <li><a href="#remediation">Remediation Plan</a></li>
</ol>

<div class="page-break"></div>

<!-- 1. EXECUTIVE SUMMARY -->
<h2 id="exec">1. Executive Summary</h2>
<p>This report documents the findings of an automated penetration test conducted against the <strong>${selectedScenario?.name || 'target'}</strong> network topology. The assessment utilized AI-driven adversarial agents trained via Stable Baselines3 Deep Q-Network (DQN) reinforcement learning to simulate realistic attack and defense scenarios.</p>

<p>The target environment consists of <strong>${hosts.length} hosts</strong> connected via <strong>${edges.length} network links</strong>. A total of <strong>${allCVEs.length} vulnerabilities</strong> were identified across the infrastructure, of which <strong>${criticalCount} are rated CRITICAL</strong> and <strong>${highCount} are rated HIGH</strong>.</p>

${latestSim ? `<p>The automated Red vs Blue simulation ran for <strong>${simSteps.length} steps</strong>. The Red (attacker) agent accumulated a total reward of <strong>${totalRedReward.toFixed(2)}</strong>, while the Blue (defender) agent scored <strong>${totalBlueReward.toFixed(2)}</strong>. <strong>Overall assessment: ${blueWon ? 'Defense held — the Blue agent successfully contained the attack.' : 'Network compromised — the Red agent overcame defensive measures.'}</strong></p>` : '<p><em>No simulation has been executed yet. Results will appear here after running a drill from the AI Orchestrator.</em></p>'}

<div style="margin:20px 0">
  <table>
    <tr><th style="width:200px">Metric</th><th>Value</th></tr>
    <tr><td><strong>Total Hosts</strong></td><td>${hosts.length}</td></tr>
    <tr><td><strong>Network Links</strong></td><td>${edges.length}</td></tr>
    <tr><td><strong>Total Vulnerabilities</strong></td><td>${allCVEs.length}</td></tr>
    <tr><td><strong>Critical Severity</strong></td><td style="color:#c0392b;font-weight:700">${criticalCount}</td></tr>
    <tr><td><strong>High Severity</strong></td><td style="color:#e67e22;font-weight:700">${highCount}</td></tr>
    <tr><td><strong>Simulation Outcome</strong></td><td style="font-weight:700">${latestSim ? (blueWon ? 'DEFENDED' : 'BREACHED') : 'N/A'}</td></tr>
  </table>
</div>

<!-- 2. SCOPE & METHODOLOGY -->
<h2 id="scope">2. Scope &amp; Methodology</h2>
<p>The assessment targeted a network topology defined in YAML format and uploaded to the CyberDrill platform. The testing methodology combines automated vulnerability analysis with adversarial reinforcement learning simulation.</p>

<h3>2.1 Testing Approach</h3>
<ul>
  <li><strong>Topology Parsing:</strong> Network hosts, services, vulnerabilities (CVEs), and inter-host connectivity were extracted from the uploaded YAML topology file.</li>
  <li><strong>Agent Training:</strong> Two SB3 DQN agents were trained — a Red agent (attacker) learning to exploit vulnerabilities and a Blue agent (defender) learning to counter attacks.</li>
  <li><strong>Simulation:</strong> Trained agents were deployed in a step-by-step adversarial simulation where the Red agent selects attack actions and the Blue agent responds with defensive measures.</li>
  <li><strong>MITRE ATT&CK Alignment:</strong> All attack and defense actions are mapped to MITRE ATT&CK tactics (Discovery, Initial Access, Privilege Escalation, Lateral Movement, Exfiltration).</li>
</ul>

<h3>2.2 Action Space</h3>
<table>
  <tr><th>Red Agent (Attacker)</th><th>MITRE Tactic</th><th>Blue Agent (Defender)</th></tr>
  <tr><td>Scan</td><td>TA0007 — Discovery</td><td>Detect</td></tr>
  <tr><td>Exploit</td><td>TA0001 — Initial Access</td><td>Patch</td></tr>
  <tr><td>Escalate</td><td>TA0004 — Privilege Escalation</td><td>Harden</td></tr>
  <tr><td>Lateral Move</td><td>TA0008 — Lateral Movement</td><td>Isolate</td></tr>
  <tr><td>Exfiltrate</td><td>TA0010 — Exfiltration</td><td>Restore</td></tr>
</table>

<div class="page-break"></div>

<!-- 3. SIMULATION RESULTS -->
<h2 id="sim">3. Simulation Results</h2>
${latestSim ? `
<p>The adversarial simulation completed <strong>${simSteps.length} steps</strong>. Below is the summary of agent performance and the step-by-step action log.</p>

<table>
  <tr><th>Parameter</th><th>Value</th></tr>
  <tr><td>Total Steps</td><td>${simSteps.length}</td></tr>
  <tr><td>Red Agent Total Reward</td><td>${totalRedReward.toFixed(2)}</td></tr>
  <tr><td>Blue Agent Total Reward</td><td>${totalBlueReward.toFixed(2)}</td></tr>
  <tr><td>Outcome</td><td><strong>${blueWon ? 'DEFENDED' : 'BREACHED'}</strong></td></tr>
</table>

${simSteps.length > 0 ? `
<h3>3.1 Step-by-Step Action Log</h3>
<table>
  <thead><tr>
    <th style="width:50px">Step</th>
    <th style="color:#c0392b">Red Action</th><th>Target</th><th style="text-align:right">Reward</th>
    <th style="color:#2980b9">Blue Action</th><th>Target</th><th style="text-align:right">Reward</th>
  </tr></thead>
  <tbody>${stepsTable}</tbody>
</table>
` : ''}
` : '<p><em>No simulation data available. Run a security drill from the AI Orchestrator to generate results.</em></p>'}

<div class="page-break"></div>

<!-- 4. HOST RISK ASSESSMENT -->
<h2 id="hosts">4. Host Risk Assessment</h2>
<p>Each host was assessed based on the number and severity of known vulnerabilities, exposed services, and data sensitivity classification.</p>
<table>
  <thead><tr><th>Host</th><th>Operating System</th><th>Services</th><th>CVEs</th><th>Sensitivity</th><th>Risk Score</th></tr></thead>
  <tbody>${hostRows}</tbody>
</table>

<!-- 5. VULNERABILITY FINDINGS -->
<h2 id="vulns">5. Vulnerability Findings</h2>
<p>The following vulnerabilities were identified across the target infrastructure. Each finding includes the CVE identifier, severity rating, affected host, and recommended remediation.</p>
<table>
  <thead><tr><th>CVE ID</th><th>Name</th><th>Severity</th><th>Affected Host</th><th>Remediation</th></tr></thead>
  <tbody>${cveRows}</tbody>
</table>

<div class="page-break"></div>

<!-- 6. PATCHING PRIORITY -->
<h2 id="patch">6. Patching Priority</h2>
<p>Vulnerabilities are listed below in descending order of severity. CRITICAL findings should be addressed within 24 hours; HIGH findings within 7 days.</p>
<table>
  <thead><tr><th>#</th><th>CVE ID</th><th>Severity</th><th>Host</th><th>Required Action</th></tr></thead>
  <tbody>${patchPriority}</tbody>
</table>

<!-- 7. MITRE ATT&CK MAPPING -->
<h2 id="mitre">7. MITRE ATT&CK Counter-Action Mapping</h2>
<p>The table below maps each Red agent attack technique to the corresponding MITRE ATT&CK tactic and the recommended Blue agent defensive response.</p>
<table>
  <thead><tr><th>Attack Technique</th><th>MITRE ATT&CK Tactic</th><th>Defensive Counter</th><th>Recommended Implementation</th></tr></thead>
  <tbody>${mitreRows}</tbody>
</table>

<!-- 8. NETWORK SECURITY -->
<h2 id="network">8. Network Security Recommendations</h2>

<h3>8.1 Firewall Placement</h3>
${firewallRecs ? `<p>The following network connections involve high-risk hosts and require firewall rules or network segmentation:</p><ul>${firewallRecs}</ul>` : '<p>No high-risk connections requiring immediate firewall deployment were identified.</p>'}

<h3>8.2 Host Isolation</h3>
${isolationRecs ? `<p>The following hosts exceed acceptable risk thresholds and should be immediately isolated from the production network:</p><ul>${isolationRecs}</ul>` : '<p>No hosts require immediate network isolation. All hosts are within acceptable risk parameters.</p>'}

<h3>8.3 Network Segmentation Guidelines</h3>
<ul>
  <li>Deploy next-generation firewalls between segments with different sensitivity classifications</li>
  <li>Implement micro-segmentation to contain lateral movement</li>
  <li>Deploy IDS/IPS sensors at segment boundaries</li>
  <li>Enable deep packet inspection for inter-segment traffic</li>
  <li>Restrict RDP and SSH access to designated jump hosts only</li>
</ul>

<div class="page-break"></div>

<!-- 9. SERVICE HARDENING -->
<h2 id="services">9. Service Hardening Recommendations</h2>
<p>The following services were identified as exposed on target hosts. Each service should be hardened according to the guidelines below:</p>
<ul>${serviceHardening || '<li>No exposed services detected.</li>'}</ul>

<!-- 10. REMEDIATION PLAN -->
<h2 id="remediation">10. Remediation Plan</h2>

<h3>10.1 Immediate Priority (0-24 hours)</h3>
<ul>
  ${hosts.filter(h => getHostRisk(h) >= 70).map(h => `<li>Isolate <strong>${h.name}</strong> from network and begin emergency patching (${h.vulnerabilities.length} CVEs, risk score ${getHostRisk(h)}%)</li>`).join('') || '<li>No critical hosts requiring immediate isolation</li>'}
  ${criticalCount > 0 ? '<li>Patch all CRITICAL severity CVEs listed in Section 6</li>' : ''}
  <li>Verify network segmentation between high-sensitivity and general-purpose hosts</li>
</ul>

<h3>10.2 Short-term Priority (1-7 days)</h3>
<ul>
  <li>Patch all HIGH severity vulnerabilities</li>
  <li>Deploy firewall rules per Section 8.1 recommendations</li>
  <li>Harden all exposed services per Section 9 guidelines</li>
  <li>Enable centralized logging (SIEM) and alerting for all hosts</li>
</ul>

<h3>10.3 Long-term Priority (1-4 weeks)</h3>
<ul>
  <li>Implement network micro-segmentation architecture</li>
  <li>Deploy endpoint detection and response (EDR) on all hosts</li>
  <li>Establish regular vulnerability scanning and patch management schedule</li>
  <li>Conduct follow-up CyberDrill assessment to validate remediation effectiveness</li>
</ul>

<div class="footer">
  <p><strong>CONFIDENTIAL</strong> &mdash; AI-Powered Cyber Drill System</p>
  <p>Automated penetration test report generated using SB3 DQN reinforcement learning agents aligned with MITRE ATT&CK framework</p>
  <p>Report Date: ${reportDate} | This document is intended for authorized personnel only.</p>
</div>

</body></html>`

    const printWindow = window.open('', '_blank')
    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 500)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-green-300/70 text-lg" style={font}>Loading report data...</div>
      </div>
    )
  }

  if (scenarios.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <FaShieldAlt className="text-green-500/30 text-6xl mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-green-100 mb-3" style={font}>No Security Report Available</h2>
        <p className="text-green-200/60 mb-8" style={font}>
          Upload a network topology and run the AI pipeline from the Orchestrator to generate your security report.
        </p>
        <button onClick={() => navigate('/ai-orchestrator')} className="flex items-center gap-2 px-6 py-3 bg-green-900/40 border-2 border-green-500 text-green-100 hover:bg-green-900/60 transition-all mx-auto" style={font}>
          <FaBrain /> Go to Orchestrator
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-green-100 flex items-center gap-3" style={font}>
            <FaShieldAlt className="text-green-400" /> Security Report
          </h1>
          <p className="text-green-200/60 mt-1" style={font}>Comprehensive security assessment with actionable recommendations</p>
        </div>
        <button onClick={generatePrintableReport} className="flex items-center gap-2 px-6 py-3 bg-green-900/40 border-2 border-green-500 text-green-100 hover:bg-green-900/60 transition-all" style={font}>
          <FaFileDownload /> Download PDF
        </button>
      </div>

      {/* Scenario Selector */}
      {scenarios.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {scenarios.map(sc => (
            <button key={sc.id} onClick={() => selectScenario(sc)}
              className={`px-4 py-2 border-2 transition-all text-sm ${selectedScenario?.id === sc.id ? 'bg-green-900/40 border-green-500 text-green-100' : 'border-green-900/30 text-green-300/60 hover:border-green-700'}`} style={font}>
              {sc.name}
            </button>
          ))}
        </div>
      )}

      {/* Executive Summary */}
      <div className="bg-gray-800/30 border-2 border-green-900/40 p-6">
        <h2 className="text-xl font-bold text-green-100 mb-4 flex items-center gap-2" style={font}>
          <FaInfoCircle className="text-green-400" /> Executive Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-900/40 border border-green-900/30 p-4 text-center">
            <div className="text-green-300/60 text-xs mb-1" style={font}>HOSTS</div>
            <div className="text-2xl font-bold text-green-100">{hosts.length}</div>
          </div>
          <div className="bg-gray-900/40 border border-red-900/30 p-4 text-center">
            <div className="text-red-300/60 text-xs mb-1" style={font}>CRITICAL CVEs</div>
            <div className="text-2xl font-bold text-red-400">{criticalCount}</div>
          </div>
          <div className="bg-gray-900/40 border border-orange-900/30 p-4 text-center">
            <div className="text-orange-300/60 text-xs mb-1" style={font}>HIGH CVEs</div>
            <div className="text-2xl font-bold text-orange-400">{highCount}</div>
          </div>
          <div className="bg-gray-900/40 border border-blue-900/30 p-4 text-center">
            <div className="text-blue-300/60 text-xs mb-1" style={font}>CONNECTIONS</div>
            <div className="text-2xl font-bold text-blue-400">{edges.length}</div>
          </div>
        </div>
        {latestSim && (
          <div className={`p-4 border-2 ${blueWon ? 'border-green-600 bg-green-900/20' : 'border-red-600 bg-red-900/20'}`}>
            <div className="flex items-center gap-2 mb-2">
              {blueWon ? <FaCheckCircle className="text-green-400 text-lg" /> : <FaTimesCircle className="text-red-400 text-lg" />}
              <span className={`font-bold text-lg ${blueWon ? 'text-green-200' : 'text-red-200'}`} style={font}>
                {blueWon ? 'Defense Successful' : 'Network Breached'}
              </span>
            </div>
            <p className="text-green-200/60 text-sm" style={font}>
              Simulation: {simSteps.length} steps | Red Score: {totalRedReward.toFixed(1)} | Blue Score: {totalBlueReward.toFixed(1)}
            </p>
          </div>
        )}
      </div>

      {/* Host Risk Assessment */}
      <div className="bg-gray-800/30 border-2 border-green-900/40 p-6">
        <h2 className="text-xl font-bold text-green-100 mb-4 flex items-center gap-2" style={font}>
          <FaServer className="text-green-400" /> Host Risk Assessment
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {hosts.map((h, i) => {
            const risk = getHostRisk(h)
            const riskLabel = risk >= 70 ? 'CRITICAL' : risk >= 40 ? 'HIGH' : risk >= 20 ? 'MEDIUM' : 'LOW'
            const riskBorder = risk >= 70 ? 'border-red-500' : risk >= 40 ? 'border-orange-500' : risk >= 20 ? 'border-yellow-600' : 'border-green-600'
            const riskText = risk >= 70 ? 'text-red-400' : risk >= 40 ? 'text-orange-400' : risk >= 20 ? 'text-yellow-400' : 'text-green-400'
            return (
              <div key={i} className={`bg-gray-900/40 border-2 ${riskBorder} p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-green-100" style={font}>{h.name}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${riskText}`} style={font}>{riskLabel} ({risk}%)</span>
                </div>
                <div className="space-y-1 text-xs text-green-200/60" style={font}>
                  <div>OS: {h.os || 'Unknown'}</div>
                  <div>Services: {(h.services || []).join(', ') || 'None'}</div>
                  <div>CVEs: {(h.vulnerabilities || []).length} | Sensitivity: {h.sensitivity || 'normal'}</div>
                </div>
                <div className="mt-2 w-full bg-gray-700/30 h-2 rounded">
                  <div className={`h-2 rounded ${risk >= 70 ? 'bg-red-500' : risk >= 40 ? 'bg-orange-500' : risk >= 20 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${risk}%` }}></div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* CVE Inventory */}
      <div className="bg-gray-800/30 border-2 border-green-900/40 p-6">
        <h2 className="text-xl font-bold text-green-100 mb-4 flex items-center gap-2" style={font}>
          <FaBug className="text-red-400" /> Vulnerability Inventory
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-green-900/30">
                <th className="text-left p-3 text-green-300/80" style={font}>CVE ID</th>
                <th className="text-left p-3 text-green-300/80" style={font}>Name</th>
                <th className="text-left p-3 text-green-300/80" style={font}>Severity</th>
                <th className="text-left p-3 text-green-300/80" style={font}>Host</th>
                <th className="text-left p-3 text-green-300/80" style={font}>Remediation</th>
              </tr>
            </thead>
            <tbody>
              {allCVEs.map((c, i) => {
                const sev = c.severity || 'HIGH'
                const sc = SEVERITY_COLORS[sev] || SEVERITY_COLORS.HIGH
                return (
                  <tr key={i} className="border-b border-green-900/20">
                    <td className="p-3 text-blue-400 font-mono font-bold">{c.id}</td>
                    <td className="p-3 text-green-100" style={font}>{c.name || 'Unknown'}</td>
                    <td className="p-3"><span className={`px-2 py-1 text-xs font-bold ${sc.badge}`}>{sev}</span></td>
                    <td className="p-3 text-green-200/70" style={font}>{c.host}</td>
                    <td className="p-3 text-green-200/60 text-xs" style={font}>{c.fix || c.desc || 'Apply vendor patch'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MITRE ATT&CK Mapping */}
      <div className="bg-gray-800/30 border-2 border-green-900/40 p-6">
        <h2 className="text-xl font-bold text-green-100 mb-4 flex items-center gap-2" style={font}>
          <FaFireAlt className="text-orange-400" /> MITRE ATT&CK Counter-Actions
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-green-900/30">
                <th className="text-left p-3 text-red-300/80" style={font}>Red Action</th>
                <th className="text-left p-3 text-green-300/80" style={font}>MITRE Technique</th>
                <th className="text-left p-3 text-blue-300/80" style={font}>Blue Counter</th>
                <th className="text-left p-3 text-green-300/80" style={font}>Implementation</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(COUNTER_MAP).map(([red, info], i) => (
                <tr key={i} className="border-b border-green-900/20">
                  <td className="p-3 text-red-400 font-bold capitalize" style={font}>{red.replace('_', ' ')}</td>
                  <td className="p-3 text-green-200/70" style={font}>{info.mitre}</td>
                  <td className="p-3 text-blue-400 font-bold" style={font}>{info.blue}</td>
                  <td className="p-3 text-green-200/60 text-xs" style={font}>{info.fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Firewall & Isolation Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800/30 border-2 border-green-900/40 p-6">
          <h2 className="text-lg font-bold text-green-100 mb-4 flex items-center gap-2" style={font}>
            <FaNetworkWired className="text-blue-400" /> Firewall Placement
          </h2>
          <div className="space-y-2">
            {edges.filter(e => {
              const src = hosts.find(h => (h.name) === e.source)
              const tgt = hosts.find(h => (h.name) === e.target)
              return (src && getHostRisk(src) >= 40) || (tgt && getHostRisk(tgt) >= 40)
            }).map((e, i) => (
              <div key={i} className="flex items-center gap-2 p-3 bg-gray-900/40 border border-blue-900/30 text-sm">
                <FaShieldAlt className="text-blue-400 flex-shrink-0" />
                <span className="text-green-200/80" style={font}>
                  <span className="text-blue-300 font-bold">{e.source}</span> ↔ <span className="text-blue-300 font-bold">{e.target}</span>
                </span>
              </div>
            ))}
            {edges.filter(e => {
              const src = hosts.find(h => (h.name) === e.source)
              const tgt = hosts.find(h => (h.name) === e.target)
              return (src && getHostRisk(src) >= 40) || (tgt && getHostRisk(tgt) >= 40)
            }).length === 0 && (
              <p className="text-green-200/50 text-sm" style={font}>No high-risk connections requiring firewall placement.</p>
            )}
          </div>
        </div>

        <div className="bg-gray-800/30 border-2 border-green-900/40 p-6">
          <h2 className="text-lg font-bold text-green-100 mb-4 flex items-center gap-2" style={font}>
            <FaExclamationTriangle className="text-red-400" /> Isolation Required
          </h2>
          <div className="space-y-2">
            {hosts.filter(h => getHostRisk(h) >= 70).map((h, i) => (
              <div key={i} className="p-3 bg-red-900/20 border border-red-800/50 text-sm">
                <span className="text-red-300 font-bold" style={font}>{h.name}</span>
                <span className="text-red-200/60 ml-2" style={font}>— Risk: {getHostRisk(h)}%, {(h.vulnerabilities || []).length} CVEs</span>
              </div>
            ))}
            {hosts.filter(h => getHostRisk(h) >= 70).length === 0 && (
              <div className="p-3 bg-green-900/20 border border-green-800/50 text-sm flex items-center gap-2">
                <FaCheckCircle className="text-green-400" />
                <span className="text-green-200/70" style={font}>No hosts require immediate isolation</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Service Hardening */}
      <div className="bg-gray-800/30 border-2 border-green-900/40 p-6">
        <h2 className="text-xl font-bold text-green-100 mb-4 flex items-center gap-2" style={font}>
          <FaWrench className="text-purple-400" /> Service Hardening
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...new Set(hosts.flatMap(h => h.services || []))].map((svc, i) => {
            const recs = {
              ssh: 'Disable root login, use key-based auth, change default port, enable fail2ban',
              http: 'Enable HTTPS with TLS 1.3, deploy WAF, set security headers',
              https: 'Use TLS 1.3, enable HSTS preloading, configure certificate pinning',
              ftp: 'Replace with SFTP, disable anonymous access, encrypt transfers',
              smb: 'Disable SMBv1, require SMB signing, restrict access by IP',
              rdp: 'Enable NLA, use MFA, restrict to VPN-only access',
              mysql: 'Bind to localhost only, use strong passwords, enable audit logging',
              dns: 'Enable DNSSEC, restrict zone transfers, use Rate Limiting',
              smtp: 'Enable SPF/DKIM/DMARC, require TLS, disable open relay',
            }
            return (
              <div key={i} className="p-3 bg-gray-900/40 border border-purple-900/30">
                <span className="text-purple-300 font-bold text-sm" style={font}>{svc.toUpperCase()}</span>
                <p className="text-green-200/60 text-xs mt-1" style={font}>{recs[svc.toLowerCase()] || 'Review configuration and apply vendor best practices'}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Download CTA */}
      <div className="bg-gradient-to-r from-green-900/30 to-blue-900/20 border-2 border-green-800/40 p-8 text-center">
        <h2 className="text-xl font-bold text-green-100 mb-3" style={font}>Download Full Report</h2>
        <p className="text-green-200/60 mb-6 text-sm" style={font}>
          Generate a printable PDF with all findings, recommendations, and action items.
        </p>
        <button onClick={generatePrintableReport} className="flex items-center gap-2 px-8 py-4 bg-green-900/40 border-2 border-green-500 text-green-100 hover:bg-green-900/60 transition-all text-lg mx-auto" style={font}>
          <FaFileDownload /> Download as PDF
        </button>
      </div>
    </div>
  )
}

export default Report
