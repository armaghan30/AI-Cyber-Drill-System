import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaShieldAlt, FaExclamationTriangle, FaNetworkWired,
  FaServer, FaLock, FaFileDownload, FaArrowLeft, FaBrain,
  FaCheckCircle, FaTimesCircle, FaInfoCircle,
  FaWrench, FaChartLine
} from 'react-icons/fa'
import api from '../api'
import { AssessmentPanel, PlaybookPanel, WhatIfPanel, useAssessment } from '../components/SecurityAssessment'
import { buildAssessmentSections, assessmentSummaryLine, REPORT_CSS } from './reportSections'

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
  // Windows / Microsoft
  'CVE-2021-34527': { name: 'PrintNightmare',           severity: 'CRITICAL', desc: 'Windows Print Spooler remote code execution',              fix: 'Disable Print Spooler on non-print servers. Apply KB5004945.' },
  'CVE-2021-1675':  { name: 'PrintNightmare v2',        severity: 'HIGH',     desc: 'Windows Print Spooler LPE variant',                        fix: 'Disable Print Spooler on non-print servers.' },
  'CVE-2020-0796':  { name: 'SMBGhost',                 severity: 'CRITICAL', desc: 'Windows SMBv3 Client/Server RCE',                          fix: 'Apply KB4551762 or disable SMBv3 compression.' },
  'CVE-2017-0144':  { name: 'EternalBlue',              severity: 'CRITICAL', desc: 'Windows SMBv1 remote code execution',                       fix: 'Apply MS17-010 and disable SMBv1.' },
  'CVE-2020-1472':  { name: 'Zerologon',                severity: 'CRITICAL', desc: 'Netlogon elevation of privilege — unauthenticated DC takeover', fix: 'Apply August 2020 security update. Enable DC enforcement mode.' },
  'CVE-2019-0708':  { name: 'BlueKeep',                 severity: 'CRITICAL', desc: 'Remote Desktop Services pre-auth RCE',                     fix: 'Apply KB4499175 or enable NLA.' },
  'CVE-2021-26855': { name: 'ProxyLogon',               severity: 'CRITICAL', desc: 'Microsoft Exchange Server SSRF leading to RCE',             fix: 'Apply Exchange cumulative updates. Restrict ECP/OWA access.' },
  'CVE-2021-26857': { name: 'Exchange Deserialization', severity: 'HIGH',     desc: 'Microsoft Exchange insecure deserialization allowing SYSTEM', fix: 'Apply Microsoft Exchange security updates (March 2021).' },
  'CVE-2021-34535': { name: 'RDP Client RCE',           severity: 'CRITICAL', desc: 'Remote Desktop client remote code execution',               fix: 'Apply KB5004237 and restrict RDP client exposure.' },
  'CVE-2022-21990': { name: 'RDP Client RCE v2',        severity: 'HIGH',     desc: 'Remote Desktop client RCE via crafted server',              fix: 'Apply February 2022 Patch Tuesday updates.' },
  'CVE-2022-26923': { name: 'AD CS Priv Esc',           severity: 'CRITICAL', desc: 'Active Directory Certificate Services privilege escalation', fix: 'Apply KB5014754 and audit AD CS templates.' },
  'CVE-2023-23397': { name: 'Outlook Elevation',        severity: 'CRITICAL', desc: 'Microsoft Outlook elevation of privilege via UNC path',      fix: 'Apply Microsoft security update. Block TCP 445 outbound.' },
  'CVE-2022-30190': { name: 'Follina',                  severity: 'HIGH',     desc: 'Microsoft MSDT remote code execution via Office documents',  fix: 'Disable MSDT URL protocol. Apply Microsoft security update.' },
  // Linux
  'CVE-2022-0847':  { name: 'DirtyPipe',                severity: 'HIGH',     desc: 'Linux kernel pipe privilege escalation',                    fix: 'Update kernel to 5.16.11+.' },
  'CVE-2021-3156':  { name: 'Baron Samedit',            severity: 'HIGH',     desc: 'Heap-based buffer overflow in sudo',                        fix: 'Update sudo to 1.9.5p2+.' },
  'CVE-2016-5195':  { name: 'DirtyCow',                 severity: 'HIGH',     desc: 'Linux kernel race condition privilege escalation',           fix: 'Update kernel to 4.8.3+.' },
  'CVE-2021-4034':  { name: 'PwnKit',                   severity: 'HIGH',     desc: 'polkit pkexec local privilege escalation',                  fix: 'Update polkit to 0.120+.' },
  'CVE-2022-2588':  { name: 'DirtyCred',                severity: 'HIGH',     desc: 'Linux kernel credential swapping privilege escalation',      fix: 'Update kernel to latest stable.' },
  'CVE-2023-0386':  { name: 'OverlayFS Priv Esc',       severity: 'HIGH',     desc: 'Linux overlayfs privilege escalation',                      fix: 'Update kernel to 6.2+.' },
  'CVE-2021-3493':  { name: 'OverlayFS Ubuntu',         severity: 'HIGH',     desc: 'Ubuntu-specific overlayfs privilege escalation',            fix: 'Update Ubuntu kernel packages.' },
  // Web / App servers
  'CVE-2021-44228': { name: 'Log4Shell',                severity: 'CRITICAL', desc: 'Remote code execution in Apache Log4j 2.x via JNDI lookup',  fix: 'Upgrade Log4j to 2.17.1+. Set log4j2.formatMsgNoLookups=true.' },
  'CVE-2022-22965': { name: 'Spring4Shell',             severity: 'CRITICAL', desc: 'Spring Framework RCE via data binding on JDK 9+',            fix: 'Upgrade Spring Framework to 5.3.18+ or 5.2.20+.' },
  'CVE-2023-44487': { name: 'HTTP/2 Rapid Reset',       severity: 'CRITICAL', desc: 'HTTP/2 protocol DDoS via rapid stream resets',              fix: 'Update web server to patched version.' },
  'CVE-2021-41773': { name: 'Apache Path Traversal',    severity: 'CRITICAL', desc: 'Apache httpd path traversal and RCE',                       fix: 'Update Apache to 2.4.50+.' },
  'CVE-2019-0211':  { name: 'Apache Priv Esc',          severity: 'HIGH',     desc: 'Apache httpd local privilege escalation',                   fix: 'Update Apache to 2.4.39+.' },
  'CVE-2023-0286':  { name: 'OpenSSL X.509 Confusion',  severity: 'HIGH',     desc: 'X.509 GeneralName type confusion in OpenSSL',               fix: 'Upgrade OpenSSL to 3.0.8+ or 1.1.1t+.' },
  // Database
  'CVE-2023-21912': { name: 'MySQL Server DoS',         severity: 'HIGH',     desc: 'MySQL Server denial of service vulnerability',              fix: 'Apply Oracle Critical Patch Update.' },
  'CVE-2022-21270': { name: 'MySQL Server Exploit',     severity: 'MEDIUM',   desc: 'MySQL Server exploitable vulnerability',                    fix: 'Apply Oracle Jan 2022 CPU.' },
  'CVE-2020-14812': { name: 'MySQL Server DoS v2',      severity: 'MEDIUM',   desc: 'MySQL Server denial of service',                            fix: 'Update MySQL to 8.0.22+.' },
  'CVE-2019-2737':  { name: 'MySQL Server XML Vuln',    severity: 'MEDIUM',   desc: 'MySQL Server XML vulnerability',                            fix: 'Update MySQL to 5.7.27+.' },
}

const Report = () => {
  const navigate = useNavigate()
  const [scenarios, setScenarios] = useState([])
  const [selectedScenario, setSelectedScenario] = useState(null)
  const [topoData, setTopoData] = useState(null)
  const [simulations, setSimulations] = useState([])
  const [latestSim, setLatestSim] = useState(null)
  const [attackPath, setAttackPath] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cveExtras, setCveExtras] = useState({}) // NVD-fetched data for CVEs not in local dict
  const assessmentState = useAssessment(selectedScenario?.id)
  const assessment = assessmentState.assessment

  useEffect(() => { loadData() }, [])

  // Batch-fetch CVE data from NVD for any CVE not in the local dictionary
  useEffect(() => {
    if (!topoData) return
    const allIds = Object.values(topoData?.network?.hosts || {}).flatMap(h => h.vulnerabilities || [])
    const unknown = [...new Set(allIds)].filter(id => !CVE_DATABASE[id])
    if (unknown.length === 0) return
    api.getCVEBatch(unknown)
      .then(data => setCveExtras(prev => ({ ...prev, ...data })))
      .catch(() => {})
  }, [topoData])

  // Merged CVE lookup — local dict first, NVD cache second, fallback third
  const cveInfo = (id) =>
    CVE_DATABASE[id] || (cveExtras[id] ? { ...cveExtras[id], desc: cveExtras[id].description } : null) ||
    { name: id, severity: 'MEDIUM', desc: 'Known vulnerability', fix: 'Apply vendor security patch' }

  const loadData = async () => {
    try {
      const scList = await api.listScenarios()
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
      const sims = await api.listSimulations()
      const scenarioSims = sims.filter(s => s.scenario_id === sc.id)
      setSimulations(scenarioSims)
      if (scenarioSims.length > 0) {
        // listSimulations returns ordered by created_at DESC, so [0] is the newest
        const latest = scenarioSims[0]
        try {
          const full = await api.getSimulation(latest.id)
          setLatestSim(full)
          try { setAttackPath(await api.getAttackPath(latest.id)) } catch {}
        } catch { setLatestSim(latest) }
      } else {
        setLatestSim(null); setAttackPath(null)
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
      ...cveInfo(c),
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
      const info = cveInfo(c)
      risk += info?.severity === 'CRITICAL' ? 40 : info?.severity === 'HIGH' ? 25 : 15
    })
    if (h.sensitivity === 'high') risk += 20
    if (h.services.length > 2) risk += 10
    return Math.min(risk, 100)
  }

  const simSteps = latestSim?.steps || latestSim?.result?.steps || []
  // Use the simulation's authoritative totals when available — summing simSteps
  // breaks when the steps array is empty or truncated, which is why the on-page
  // card was showing 0/0 even though the sim had real rewards.
  const totalRedReward  = (latestSim?.total_red_reward  ?? simSteps.reduce((s, st) => s + (st.red_reward  || 0), 0))
  const totalBlueReward = (latestSim?.total_blue_reward ?? simSteps.reduce((s, st) => s + (st.blue_reward || 0), 0))
  const defended = latestSim?.outcome === 'defended'
  const outcomeReason = latestSim?.reason || ''
  const outcomeText = latestSim?.outcome ? latestSim.outcome.toUpperCase() : 'NOT TESTED'

  const generatePrintableReport = () => {
    const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const reportTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

    const hostRows = hosts.map(h => {
      const risk = getHostRisk(h)
      const riskLabel = risk >= 70 ? 'CRITICAL' : risk >= 40 ? 'HIGH' : risk >= 20 ? 'MEDIUM' : 'LOW'
      const badgeClass = risk >= 70 ? 'badge-critical' : risk >= 40 ? 'badge-high' : risk >= 20 ? 'badge-medium' : 'badge-low'
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${h.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${h.os || 'Unknown'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px">${(h.services || []).join(', ') || 'None'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${(h.vulnerabilities || []).length}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-transform:capitalize">${h.sensitivity || 'normal'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center"><span class="${badgeClass}" style="display:inline-block;padding:2px 10px;font-size:11px;font-weight:700;border-radius:3px">${riskLabel} (${risk}%)</span></td>
      </tr>`
    }).join('')

    const cveRows = allCVEs.map(c => {
      const sev = c.severity || 'HIGH'
      const badgeClass = sev === 'CRITICAL' ? 'badge-critical' : sev === 'HIGH' ? 'badge-high' : sev === 'MEDIUM' ? 'badge-medium' : 'badge-low'
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;font-family:monospace">${c.id}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${c.name || 'Unknown CVE'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><span class="${badgeClass}" style="display:inline-block;padding:2px 10px;font-size:11px;font-weight:700;border-radius:3px">${sev}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${c.host}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px">${c.fix || c.desc || 'Apply vendor security patch'}</td>
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
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${i + 1}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;font-family:monospace">${c.id}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><span class="${badgeClass}" style="display:inline-block;padding:2px 10px;font-size:11px;font-weight:700;border-radius:3px">${sev}</span></td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${c.host}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px">${c.fix || 'Apply vendor patch immediately'}</td>
        </tr>`
      }).join('')

    const mitreRows = Object.entries(COUNTER_MAP).map(([red, info]) =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;text-transform:capitalize;color:#b91c1c">${red.replace('_', ' ')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${info.mitre}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#1d4ed8">${info.blue}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px">${info.fix}</td>
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
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${s.step_number}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#b91c1c;font-weight:600;text-transform:capitalize">${ra.replace('_',' ')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${rt}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace">${(s.red_reward||0).toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#1d4ed8;font-weight:600;text-transform:capitalize">${ba.replace('_',' ')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${bt}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace">${(s.blue_reward||0).toFixed(2)}</td>
      </tr>`
    }).join('')

    // Attack path for PDF
    const ap = attackPath
    const attackPathSection = ap && ap.entry_point ? `
<p>The following shows the complete pathway the Red agent took through the network during this simulation.</p>

<table style="margin-bottom:12px">
  <tr><th>Route</th><td style="font-weight:700;font-family:monospace">${ap.path_string}</td></tr>
  <tr><th>Entry Point</th><td>${ap.entry_point}</td></tr>
  <tr><th>Hosts Breached</th><td>${ap.compromised_path.length}</td></tr>
  <tr><th>Lateral Movements</th><td>${ap.lateral_movements.length}</td></tr>
  <tr><th>Exfiltrated From</th><td>${ap.exfiltrated_hosts.length > 0 ? ap.exfiltrated_hosts.join(', ') : 'None'}</td></tr>
  <tr><th>Total Attack Actions</th><td>${ap.total_actions}</td></tr>
  <tr><th>Successful Hits</th><td>${ap.successful_actions}</td></tr>
</table>

${ap.compromised_path.length > 0 ? `
<h3>Compromised Host Chain</h3>
<table>
  <thead><tr><th>#</th><th>Host</th><th>Method</th></tr></thead>
  <tbody>
    ${ap.compromised_path.map((item, i) => `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td style="font-weight:600">${item.host}</td>
      <td>${item.method === 'exploit' ? 'Initial Exploit' : 'Lateral Movement'}</td>
    </tr>`).join('')}
  </tbody>
</table>` : ''}

${ap.lateral_movements.length > 0 ? `
<h3>Lateral Movement Log</h3>
<table>
  <thead><tr><th>Step</th><th>From</th><th>To</th></tr></thead>
  <tbody>
    ${ap.lateral_movements.map(m => `<tr>
      <td style="text-align:center">${m.step}</td>
      <td>${m.from || 'Unknown'}</td>
      <td style="font-weight:600">${m.to}</td>
    </tr>`).join('')}
  </tbody>
</table>` : ''}
` : '<p><em>No successful attack path was established in this simulation.</em></p>'

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AI-Powered Cyber Drill — Security Assessment Report — ${selectedScenario?.name || 'Network'}</title>
<link href="https://fonts.googleapis.com/css2?family=Gugi&display=swap" rel="stylesheet">
<style>${REPORT_CSS}</style></head><body>

<!-- COVER PAGE -->
<div class="cover">
  <div class="brand">CyberDrill</div>
  <p class="subtitle">Security Assessment Report &mdash; ${selectedScenario?.name || 'Network'}</p>
  ${assessment?.result ? `<span class="outcome ${assessment.result.modes.current_security.breach_rate > 20 ? 'breached' : 'defended'}">BREACH LIKELIHOOD: ${assessment.result.modes.current_security.nist.level.toUpperCase()}</span>` : `<span class="outcome ${latestSim?.outcome || 'none'}">LATEST DRILL: ${outcomeText}</span>`}
  <div class="meta">
    <strong>Target Network:</strong> ${selectedScenario?.name || 'Unknown Topology'}<br>
    <strong>Assessment Date:</strong> ${reportDate}<br>
    <strong>Report Generated:</strong> ${reportTime}<br>
    <strong>Scope:</strong> ${hosts.length} Hosts | ${edges.length} Network Links | ${allCVEs.length} Vulnerabilities<br>
    <strong>Methodology:</strong> Simulated Red vs Blue drills with trained MaskablePPO agents, mapped to MITRE ATT&CK; likelihood rated with NIST SP 800-30<br>
    <strong>Classification:</strong> CONFIDENTIAL
  </div>
</div>

<!-- TABLE OF CONTENTS -->
<h2>Table of Contents</h2>
<ol class="toc">
  <li><a href="#exec">Executive Summary</a></li>
  <li><a href="#assessment">Security Assessment</a></li>
  <li><a href="#playbook">AI Defence Playbook</a></li>
  <li><a href="#whatif">What-if Hardening</a></li>
  <li><a href="#scope">Scope &amp; Methodology</a></li>
  <li><a href="#sim">Latest Drill Results</a></li>
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
<p>This report documents a simulation-based security assessment of the <strong>${selectedScenario?.name || 'target'}</strong> network. A digital copy of the network was attacked by a trained Red agent and defended by a trained Blue agent (Stable Baselines3 MaskablePPO), without touching the real systems.</p>
${assessment?.result ? `<div class="note"><strong>${assessmentSummaryLine(assessment.result)}</strong></div>` : ''}

<p>The target environment consists of <strong>${hosts.length} hosts</strong> connected via <strong>${edges.length} network links</strong>. A total of <strong>${allCVEs.length} vulnerabilities</strong> were identified across the infrastructure, of which <strong>${criticalCount} are rated CRITICAL</strong> and <strong>${highCount} are rated HIGH</strong>.</p>

${latestSim ? `<p>The automated Red vs Blue drill ran for <strong>${simSteps.length} steps</strong>. <strong>Outcome: ${outcomeText}${outcomeReason ? ` (${outcomeReason})` : ''}.</strong> A drill counts as breached when data is exfiltrated or more than 20% of hosts are compromised at the end. Training rewards (used only to train the agents, not a security score): Red ${totalRedReward.toFixed(1)}, Blue ${totalBlueReward.toFixed(1)}.</p>` : '<p><em>No simulation has been executed yet. Results will appear here after running a drill from the AI Orchestrator.</em></p>'}

<div style="margin:20px 0">
  <table>
    <tr><th style="width:200px">Metric</th><th>Value</th></tr>
    <tr><td><strong>Total Hosts</strong></td><td>${hosts.length}</td></tr>
    <tr><td><strong>Network Links</strong></td><td>${edges.length}</td></tr>
    <tr><td><strong>Total Vulnerabilities</strong></td><td>${allCVEs.length}</td></tr>
    <tr><td><strong>Critical Severity</strong></td><td style="color:#b91c1c;font-weight:700">${criticalCount}</td></tr>
    <tr><td><strong>High Severity</strong></td><td style="color:#c2410c;font-weight:700">${highCount}</td></tr>
    <tr><td><strong>Simulation Outcome</strong></td><td style="font-weight:700">${latestSim ? outcomeText : 'N/A'}</td></tr>
  </table>
</div>

<!-- 2-4. SECURITY ASSESSMENT -->
${buildAssessmentSections(assessment)}

<div class="page-break"></div>

<!-- 5. SCOPE & METHODOLOGY -->
<h2 id="scope">5. Scope &amp; Methodology</h2>
<p>The assessment targeted a network topology defined in YAML format and uploaded to the CyberDrill platform. The testing methodology combines automated vulnerability analysis with adversarial reinforcement learning simulation.</p>

<h3>5.1 Testing Approach</h3>
<ul>
  <li><strong>Topology Parsing:</strong> Network hosts, services, vulnerabilities (CVEs), and inter-host connectivity were extracted from the uploaded YAML topology file.</li>
  <li><strong>Agent Training:</strong> Two SB3 MaskablePPO agents were trained — a Red agent (attacker) learning to exploit vulnerabilities and a Blue agent (defender) learning to counter attacks.</li>
  <li><strong>Simulation:</strong> Trained agents were deployed in a step-by-step adversarial simulation where the Red agent selects attack actions and the Blue agent responds with defensive measures.</li>
  <li><strong>MITRE ATT&CK Alignment:</strong> All attack and defense actions are mapped to MITRE ATT&CK tactics (Discovery, Initial Access, Privilege Escalation, Lateral Movement, Exfiltration).</li>
</ul>

<h3>5.2 Action Space</h3>
<table>
  <tr><th>Red Agent (Attacker)</th><th>MITRE Tactic</th><th>Blue Agent (Defender)</th></tr>
  <tr><td>Scan</td><td>TA0007 — Discovery</td><td>Detect</td></tr>
  <tr><td>Exploit</td><td>TA0001 — Initial Access</td><td>Patch</td></tr>
  <tr><td>Escalate</td><td>TA0004 — Privilege Escalation</td><td>Harden</td></tr>
  <tr><td>Lateral Move</td><td>TA0008 — Lateral Movement</td><td>Isolate</td></tr>
  <tr><td>Exfiltrate</td><td>TA0010 — Exfiltration</td><td>Restore</td></tr>
  <tr><td>&mdash;</td><td>&mdash;</td><td>Deploy firewall</td></tr>
</table>

<div class="page-break"></div>

<!-- 6. SIMULATION RESULTS -->
<h2 id="sim">6. Latest Drill Results</h2>
${latestSim ? `
<p>The adversarial simulation completed <strong>${simSteps.length} steps</strong>. Below is the summary of agent performance and the step-by-step action log.</p>

<table>
  <tr><th>Parameter</th><th>Value</th></tr>
  <tr><td>Total Steps</td><td>${simSteps.length}</td></tr>
  <tr><td>Outcome</td><td><strong>${outcomeText}</strong>${outcomeReason ? ` &mdash; ${outcomeReason}` : ''}</td></tr>
  <tr><td>Red training reward</td><td>${totalRedReward.toFixed(2)}</td></tr>
  <tr><td>Blue training reward</td><td>${totalBlueReward.toFixed(2)}</td></tr>
</table>

${simSteps.length > 0 ? `
<h3>6.1 Step-by-Step Action Log</h3>
<table>
  <thead><tr>
    <th style="width:50px">Step</th>
    <th style="color:#b91c1c">Red Action</th><th>Target</th><th style="text-align:right">Training reward</th>
    <th style="color:#1d4ed8">Blue Action</th><th>Target</th><th style="text-align:right">Training reward</th>
  </tr></thead>
  <tbody>${stepsTable}</tbody>
</table>
` : ''}
` : '<p><em>No simulation data available. Run a security drill from the AI Orchestrator to generate results.</em></p>'}

<div class="page-break"></div>

<!-- ATTACK PATH -->
<h3 id="attackpath">6.2 Red Agent Attack Path</h3>
${attackPathSection}

<div class="page-break"></div>

<!-- 7. HOST RISK ASSESSMENT -->
<h2 id="hosts">7. Host Risk Assessment</h2>
<p>Each host was assessed based on the number and severity of known vulnerabilities, exposed services, and data sensitivity classification.</p>
<table>
  <thead><tr><th>Host</th><th>Operating System</th><th>Services</th><th>CVEs</th><th>Sensitivity</th><th>Risk Score</th></tr></thead>
  <tbody>${hostRows}</tbody>
</table>

<!-- 8. VULNERABILITY FINDINGS -->
<h2 id="vulns">8. Vulnerability Findings</h2>
<p>The following vulnerabilities were identified across the target infrastructure. Each finding includes the CVE identifier, severity rating, affected host, and recommended remediation.</p>
<table>
  <thead><tr><th>CVE ID</th><th>Name</th><th>Severity</th><th>Affected Host</th><th>Remediation</th></tr></thead>
  <tbody>${cveRows}</tbody>
</table>

<div class="page-break"></div>

<!-- 9. PATCHING PRIORITY -->
<h2 id="patch">9. Patching Priority</h2>
<p>Vulnerabilities are listed below in descending order of severity. CRITICAL findings should be addressed within 24 hours; HIGH findings within 7 days.</p>
<table>
  <thead><tr><th>#</th><th>CVE ID</th><th>Severity</th><th>Host</th><th>Required Action</th></tr></thead>
  <tbody>${patchPriority}</tbody>
</table>

<!-- 10. MITRE ATT&CK MAPPING -->
<h2 id="mitre">10. MITRE ATT&CK Counter-Action Mapping</h2>
<p>The table below maps each Red agent attack technique to the corresponding MITRE ATT&CK tactic and the recommended Blue agent defensive response.</p>
<table>
  <thead><tr><th>Attack Technique</th><th>MITRE ATT&CK Tactic</th><th>Defensive Counter</th><th>Recommended Implementation</th></tr></thead>
  <tbody>${mitreRows}</tbody>
</table>

<!-- 11. NETWORK SECURITY -->
<h2 id="network">11. Network Security Recommendations</h2>

<h3>11.1 Firewall Placement</h3>
${firewallRecs ? `<p>The following network connections involve high-risk hosts and require firewall rules or network segmentation:</p><ul>${firewallRecs}</ul>` : '<p>No high-risk connections requiring immediate firewall deployment were identified.</p>'}

<h3>11.2 Host Isolation</h3>
${isolationRecs ? `<p>The following hosts exceed acceptable risk thresholds and should be immediately isolated from the production network:</p><ul>${isolationRecs}</ul>` : '<p>No hosts require immediate network isolation. All hosts are within acceptable risk parameters.</p>'}

<h3>11.3 Network Segmentation Guidelines</h3>
<ul>
  <li>Deploy next-generation firewalls between segments with different sensitivity classifications</li>
  <li>Implement micro-segmentation to contain lateral movement</li>
  <li>Deploy IDS/IPS sensors at segment boundaries</li>
  <li>Enable deep packet inspection for inter-segment traffic</li>
  <li>Restrict RDP and SSH access to designated jump hosts only</li>
</ul>

<div class="page-break"></div>

<!-- 12. SERVICE HARDENING -->
<h2 id="services">12. Service Hardening Recommendations</h2>
<p>The following services were identified as exposed on target hosts. Each service should be hardened according to the guidelines below:</p>
<ul>${serviceHardening || '<li>No exposed services detected.</li>'}</ul>

<!-- 13. REMEDIATION PLAN -->
<h2 id="remediation">13. Remediation Plan</h2>

<h3>13.1 Immediate Priority (0-24 hours)</h3>
<ul>
  ${hosts.filter(h => getHostRisk(h) >= 70).map(h => `<li>Isolate <strong>${h.name}</strong> from network and begin emergency patching (${h.vulnerabilities.length} CVEs, risk score ${getHostRisk(h)}%)</li>`).join('') || '<li>No critical hosts requiring immediate isolation</li>'}
  ${criticalCount > 0 ? '<li>Patch all CRITICAL severity CVEs listed in Section 9</li>' : ''}
  <li>Verify network segmentation between high-sensitivity and general-purpose hosts</li>
</ul>

<h3>13.2 Short-term Priority (1-7 days)</h3>
<ul>
  <li>Patch all HIGH severity vulnerabilities</li>
  <li>Apply the fixes in Section 4 first, then the firewall rules in Section 11.1</li>
  <li>Harden all exposed services per Section 12 guidelines</li>
  <li>Enable centralized logging (SIEM) and alerting for all hosts</li>
</ul>

<h3>13.3 Long-term Priority (1-4 weeks)</h3>
<ul>
  <li>Implement network micro-segmentation architecture</li>
  <li>Deploy endpoint detection and response (EDR) on all hosts</li>
  <li>Establish regular vulnerability scanning and patch management schedule</li>
  <li>Conduct follow-up CyberDrill assessment to validate remediation effectiveness</li>
</ul>

<div class="footer">
  <p><strong>CONFIDENTIAL</strong> &mdash; AI-Powered Cyber Drill System</p>
  <p>Simulation-based security assessment &middot; Red vs Blue MaskablePPO agents &middot; MITRE ATT&CK &middot; NIST SP 800-30 likelihood scale</p>
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
        {assessment?.result && (
          <p className="text-green-100 text-sm mb-3" style={font}>{assessmentSummaryLine(assessment.result)}</p>
        )}
        {latestSim?.outcome && (
          <div className={`p-4 border-2 ${defended ? 'border-green-600 bg-green-900/20' : 'border-red-600 bg-red-900/20'}`}>
            <div className="flex items-center gap-2 mb-2">
              {defended ? <FaCheckCircle className="text-green-400 text-lg" /> : <FaTimesCircle className="text-red-400 text-lg" />}
              <span className={`font-bold text-lg ${defended ? 'text-green-200' : 'text-red-200'}`} style={font}>
                {defended ? 'DEFENDED' : 'BREACHED'}
              </span>
              {outcomeReason && <span className="text-green-200/70 text-sm" style={font}>· {outcomeReason}</span>}
            </div>
            <p className="text-gray-400 text-xs" style={font}>
              Simulation: {simSteps.length} steps · Training reward: Red {totalRedReward.toFixed(1)}, Blue {totalBlueReward.toFixed(1)} (not a security score)
            </p>
          </div>
        )}
      </div>

      <AssessmentPanel state={assessmentState} />
      <PlaybookPanel assessment={assessment} />
      <WhatIfPanel assessment={assessment} />

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

      {/* The full CVE inventory is in the PDF report (Vulnerability Findings, Patching Priority) */}

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
