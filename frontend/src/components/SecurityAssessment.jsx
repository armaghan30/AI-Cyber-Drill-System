import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FaChartLine, FaClipboardList, FaFlask, FaPlay, FaRedo } from 'react-icons/fa'
import api from '../api'

const font = { fontFamily: 'Gugi, sans-serif' }

export const NIST_SCALE = [
  { level: 'Very High', range: '96-100', text: 'text-red-400', border: 'border-red-500' },
  { level: 'High', range: '80-95', text: 'text-orange-400', border: 'border-orange-500' },
  { level: 'Moderate', range: '21-79', text: 'text-yellow-400', border: 'border-yellow-500' },
  { level: 'Low', range: '5-20', text: 'text-green-300', border: 'border-green-600' },
  { level: 'Very Low', range: '0-4', text: 'text-green-400', border: 'border-green-500' },
]
const levelStyle = (level) => NIST_SCALE.find(s => s.level === level) || NIST_SCALE[2]
const ACTION_NAMES = { deploy_firewall: 'Firewall', patch: 'Patch', harden: 'Harden' }
// the backend sends UTC times without a zone
const asLocalTime = (ts) => ts ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + 'Z').toLocaleString() : ''

export function useAssessment(scenarioId) {
  const [latest, setLatest] = useState(null)
  const [active, setActive] = useState(null)
  const [error, setError] = useState('')
  const timer = useRef(null)

  const poll = useCallback((id) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const a = await api.getAssessment(id)
        if (a.status === 'completed') { setLatest(a); setActive(null) }
        else if (a.status === 'failed') { setError(a.error_message || 'Assessment failed'); setActive(null) }
        else { setActive(a); poll(id) }
      } catch (e) { setError(e.message); setActive(null) }
    }, 2000)
  }, [])

  useEffect(() => {
    setLatest(null); setActive(null); setError('')
    if (!scenarioId) return
    api.listAssessments(scenarioId).then(list => {
      setLatest(list.find(a => a.status === 'completed') || null)
      const running = list.find(a => a.status === 'queued' || a.status === 'running')
      if (running) { setActive(running); poll(running.id) }
    }).catch(() => {})
    return () => clearTimeout(timer.current)
  }, [scenarioId, poll])

  const start = async () => {
    setError('')
    try {
      const a = await api.startAssessment(scenarioId)
      setActive(a)
      poll(a.id)
    } catch (e) { setError(e.message) }
  }

  return { assessment: latest, active, error, start }
}

const Panel = ({ icon: Icon, title, children, right }) => (
  <div className="bg-gray-800/30 border-2 border-green-900/40 p-6">
    <div className="flex items-center justify-between gap-4 mb-4">
      <h2 className="text-xl font-bold text-green-100 flex items-center gap-2" style={font}>
        <Icon className="text-green-400" /> {title}
      </h2>
      {right}
    </div>
    {children}
  </div>
)

const ModeCard = ({ title, mode }) => {
  const s = levelStyle(mode.nist.level)
  return (
    <div className={`bg-gray-900/40 border-2 ${s.border} p-4`}>
      <div className="text-green-300/60 text-xs mb-2" style={font}>{title}</div>
      <div className={`text-2xl font-bold ${s.text}`} style={font}>{mode.nist.level}</div>
      <div className="text-green-100 text-sm mt-1" style={font}>
        Breach rate {mode.breach_rate}% <span className="text-green-200/50">(95% range {mode.ci95.low}–{mode.ci95.high}%)</span>
      </div>
      <div className="text-green-200/60 text-xs mt-2" style={font}>
        {mode.breaches}/{mode.drills} drills breached · avg {mode.mean_hosts_compromised} hosts compromised · data stolen from {mode.mean_hosts_exfiltrated} hosts on average
      </div>
    </div>
  )
}

export const AssessmentPanel = ({ state }) => {
  const { assessment, active, error, start } = state
  const r = assessment?.result
  const running = !!active
  const pct = active?.progress_total ? Math.round(active.progress_done / active.progress_total * 100) : 0

  const button = (
    <button onClick={start} disabled={running}
      className="flex items-center gap-2 px-4 py-2 bg-green-900/40 border-2 border-green-600 text-green-100 hover:bg-green-900/60 disabled:opacity-50 transition-all text-sm" style={font}>
      {r ? <FaRedo /> : <FaPlay />} {r ? 'Run again' : 'Run security assessment'}
    </button>
  )

  return (
    <Panel icon={FaChartLine} title="Security Assessment" right={button}>
      {running && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-green-200/70 mb-1" style={font}>
            <span>Running drills…</span><span>Drill {active.progress_done} / {active.progress_total}</span>
          </div>
          <div className="w-full bg-gray-700/30 h-2"><div className="h-2 bg-green-500 transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      {error && <p className="text-red-300 text-sm mb-3" style={font}>{error}</p>}

      {!r && !running && (
        <p className="text-green-200/60 text-sm" style={font}>
          Runs 30 attack drills with no active defence, 30 with the trained AI defender and 30 on a hardened copy of the network,
          then rates the likelihood of a breach on the NIST SP 800-30 scale.
        </p>
      )}

      {r && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ModeCard title="CURRENT SECURITY (no active defence)" mode={r.modes.current_security} />
            <ModeCard title="WITH AI DEFENCE (trained Blue agent)" mode={r.modes.ai_defence} />
          </div>
          {r.breach_rate_reduction !== undefined && (
            <p className="text-green-200/70 text-sm mt-3" style={font}>
              The AI defender lowered the breach rate by {r.breach_rate_reduction} percentage points.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <h3 className="text-sm font-bold text-green-200/70 mb-2" style={font}>Most attacked hosts (no active defence)</h3>
              <table className="w-full text-xs text-green-200/80" style={font}>
                <thead><tr className="text-green-300/60 text-left"><th className="py-1">Host</th><th>Compromised</th><th>Data stolen</th></tr></thead>
                <tbody>
                  {r.modes.current_security.top_hosts.map(h => (
                    <tr key={h.host} className="border-t border-green-900/30">
                      <td className="py-1 text-green-100">{h.host}</td>
                      <td>{h.compromised_drills}/{r.drills_per_mode}</td>
                      <td>{h.exfiltrated_drills}/{r.drills_per_mode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="text-sm font-bold text-green-200/70 mb-2" style={font}>CVEs the attacker used</h3>
              <table className="w-full text-xs text-green-200/80" style={font}>
                <thead><tr className="text-green-300/60 text-left"><th className="py-1">CVE</th><th>Host</th><th>Drills</th></tr></thead>
                <tbody>
                  {r.modes.current_security.top_cves.map(c => (
                    <tr key={c.cve} className="border-t border-green-900/30">
                      <td className="py-1 text-green-100">{c.cve}</td><td>{c.hosts.join(', ')}</td><td>{c.drills}/{r.drills_per_mode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-green-900/30 text-xs text-green-200/50" style={font}>
            <div className="flex flex-wrap gap-3 mb-1">
              {NIST_SCALE.map(s => <span key={s.level} className={s.text}>{s.level} {s.range}%</span>)}
            </div>
            Likelihood scale: {r.citation}. A drill counts as breached when {r.breach_criterion}.
            {' '}{r.drills_per_mode} drills of {r.steps} steps per mode · {asLocalTime(assessment.completed_at || assessment.created_at)}
          </div>
        </>
      )}
    </Panel>
  )
}

export const PlaybookPanel = ({ assessment }) => {
  const pb = assessment?.result?.playbook
  if (!pb) return null
  const n = pb.drills
  return (
    <Panel icon={FaClipboardList} title="AI Defence Playbook">
      <p className="text-green-200/60 text-sm mb-4" style={font}>What the trained defender did across {n} drills, and how much it changed the outcome.</p>

      <h3 className="text-sm font-bold text-green-200/70 mb-2" style={font}>Do first</h3>
      <ol className="list-decimal pl-5 mb-4 space-y-1 text-sm text-green-100" style={font}>
        {pb.immediate.map((i, k) => (
          <li key={k}>{i.advice} <span className="text-green-200/50 text-xs">({i.drills}/{n} drills, usually step {i.typical_step})</span></li>
        ))}
      </ol>

      <h3 className="text-sm font-bold text-green-200/70 mb-2" style={font}>Hardening priorities</h3>
      <table className="w-full text-xs text-green-200/80 mb-4" style={font}>
        <thead><tr className="text-green-300/60 text-left"><th className="py-1">Host</th><th>Action</th><th>Drills</th><th>Compromised</th><th>Data stolen</th></tr></thead>
        <tbody>
          {pb.hardening.map(h => {
            const untouched = h.compromised_before === 0 && h.stolen_before === 0
            return (
              <tr key={h.host} className="border-t border-green-900/30">
                <td className="py-1 text-green-100">{h.host} <span className="text-green-200/40">{h.sensitivity}</span></td>
                <td>{Object.keys(h.actions).map(a => ACTION_NAMES[a] || a).join(', ')}</td>
                <td>{h.drills}/{n}</td>
                {untouched
                  ? <td colSpan={2} className="text-green-200/40">not attacked in these drills (no measured effect)</td>
                  : <>
                      <td>{h.compromised_before} → {h.compromised_after}</td>
                      <td>{h.stolen_before} → {h.stolen_after}</td>
                    </>}
              </tr>
            )
          })}
        </tbody>
      </table>

      <h3 className="text-sm font-bold text-green-200/70 mb-1" style={font}>Incident response</h3>
      <p className="text-green-200/70 text-sm mb-4" style={font}>{pb.incident_response.note}</p>

      {pb.gaps.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-green-200/70 mb-2" style={font}>Remaining gaps (still breached with AI defence)</h3>
          <ul className="space-y-1 text-sm" style={font}>
            {pb.gaps.map(g => (
              <li key={g.host} className="text-red-300">
                {g.advice} <span className="text-green-200/50 text-xs">· compromised {g.compromised}/{n}, data stolen {g.stolen}/{n}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

export const WhatIfPanel = ({ assessment }) => {
  const wi = assessment?.result?.what_if
  if (!wi) return null
  return (
    <Panel icon={FaFlask} title="What-if Hardening">
      <p className="text-green-200/60 text-sm mb-3" style={font}>
        The top {wi.fixes.length} fixes were applied to a copy of the network, which was then attacked again with no active defence.
      </p>
      <ol className="list-decimal pl-5 mb-4 space-y-1 text-sm text-green-100" style={font}>
        {wi.fixes.map((f, k) => <li key={k}>{f.advice} <span className="text-green-200/50 text-xs">· {f.reason}</span></li>)}
      </ol>
      {wi.after && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ModeCard title="BEFORE (current security)" mode={wi.before} />
          <ModeCard title="AFTER THE FIXES" mode={wi.after} />
        </div>
      )}
      {wi.remaining_entry_points?.length > 0 && (
        <p className="text-yellow-300/80 text-sm mt-3" style={font}>{wi.entry_points_note}</p>
      )}
      <p className="text-green-200/50 text-xs italic mt-2" style={font}>{wi.caveat}</p>
    </Panel>
  )
}
