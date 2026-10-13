import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaUpload, FaNetworkWired, FaCheckCircle, FaExclamationTriangle,
  FaServer, FaShieldAlt, FaArrowRight, FaFileCode, FaSpinner,
  FaTerminal, FaRedo, FaFileAlt, FaInfoCircle, FaFlask,
} from 'react-icons/fa'
import api from '../api'

const font = { fontFamily: 'Gugi, sans-serif' }

const SENSITIVITY_OPTS = ['high', 'medium', 'low']
const SENS_COLORS = {
  high:   'text-red-400 bg-red-900/30 border-red-700/50',
  medium: 'text-yellow-400 bg-yellow-900/30 border-yellow-700/50',
  low:    'text-green-400 bg-green-900/30 border-green-700/50',
}

// ── YAML mode steps: upload → done
// ── XML  mode steps: upload → review → done

const UploadTopology = () => {
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [mode, setMode]       = useState('yaml')   // 'yaml' | 'xml'
  const [step, setStep]       = useState('upload') // 'upload' | 'review' | 'done'
  const [dragging, setDragging] = useState(false)
  const [file, setFile]       = useState(null)
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  // xml review state
  const [hosts, setHosts]             = useState([])
  const [sensitivities, setSensitivities] = useState({})
  const [scenarioName, setScenarioName]   = useState('')
  const [warnings, setWarnings]       = useState([])
  const [loadingDemo, setLoadingDemo] = useState(false)

  // done state
  const [scenario, setScenario] = useState(null)

  // ── Mode switch — resets everything ─────────────────────────────────────
  const switchMode = (m) => {
    setMode(m)
    setStep('upload')
    setFile(null)
    setHosts([])
    setSensitivities({})
    setScenarioName('')
    setScenario(null)
    setError('')
    setWarnings([])
  }

  // ── File handling ────────────────────────────────────────────────────────
  const isValidExt = (name) =>
    mode === 'yaml'
      ? name.toLowerCase().endsWith('.yaml') || name.toLowerCase().endsWith('.yml')
      : name.toLowerCase().endsWith('.xml')

  const handleFile = (f) => {
    if (!f) return
    if (!isValidExt(f.name)) {
      setError(
        mode === 'yaml'
          ? 'Please upload a YAML topology file (.yaml or .yml)'
          : 'Please upload an nmap XML file (.xml). Generate with:\nnmap -sV -O -oX scan.xml <target>'
      )
      return
    }
    setFile(f)
    setError('')
    if (mode === 'xml') {
      const base = f.name.replace(/\.xml$/i, '')
      setScenarioName(`${base}_nmap`)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  // ── YAML: upload directly ────────────────────────────────────────────────
  const handleYamlUpload = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const result = await api.uploadTopology(file)
      api.addUserScenario(result.id)
      setScenario(result)
      setStep('done')
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  // ── XML: parse first ─────────────────────────────────────────────────────
  const handleParse = async () => {
    if (!file) return
    setParsing(true)
    setError('')
    setWarnings([])
    try {
      const result = await api.parseNmap(file)
      const initialSens = {}
      result.hosts.forEach(h => { initialSens[h.key] = h.suggested_sensitivity })
      setHosts(result.hosts)
      setSensitivities(initialSens)
      setWarnings(result.warnings || [])
      setStep('review')
    } catch (e) {
      setError(e.message)
    } finally {
      setParsing(false)
    }
  }

  // ── Demo: load a built-in sample topology so users can try without nmap ──
  const handleLoadSample = async () => {
    setLoadingDemo(true)
    setError('')
    setWarnings([])
    try {
      // List existing built-in scenarios and pick a demo one if it exists.
      const list = await api.listScenarios()
      const demo = (list || []).find(s =>
        /sample|demo|small|4[-_ ]?host|example/i.test(s.filename || s.name || '')
      ) || (list || [])[0]
      if (!demo) {
        setError('No sample topology is bundled with this installation yet.')
        return
      }
      api.addUserScenario(demo.id)
      setScenario(demo)
      setStep('done')
    } catch (e) {
      setError(e.message || 'Could not load the sample topology.')
    } finally {
      setLoadingDemo(false)
    }
  }

  // ── XML: save after review ───────────────────────────────────────────────
  const handleSave = async () => {
    if (!scenarioName.trim()) { setError('Scenario name cannot be empty'); return }
    setSaving(true)
    setError('')
    try {
      const filename = scenarioName.trim().replace(/\s+/g, '_').toLowerCase() + '.yaml'
      const result = await api.saveNmap(filename, hosts, sensitivities)
      api.addUserScenario(result.id)
      setScenario(result)
      setStep('done')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const resetAll = () => {
    setStep('upload')
    setFile(null)
    setHosts([])
    setSensitivities({})
    setScenarioName('')
    setScenario(null)
    setError('')
  }

  const sensCount = hosts.reduce((acc, h) => {
    const s = sensitivities[h.key] || h.suggested_sensitivity
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})

  // Step list adapts to mode
  const steps = mode === 'yaml'
    ? [{ key: 'upload', label: '1. Upload File' }, { key: 'done', label: '2. Ready' }]
    : [{ key: 'upload', label: '1. Upload Scan' }, { key: 'review', label: '2. Review Hosts' }, { key: 'done', label: '3. Ready' }]

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="border border-green-900/40 bg-gray-900/60 backdrop-blur-sm p-6">
        <div className="flex items-center gap-3 mb-2">
          <FaNetworkWired className="text-green-400 text-2xl" />
          <h1 className="text-2xl font-bold text-green-100" style={font}>Import Network Topology</h1>
        </div>
        <p className="text-green-300/70 text-sm">
          Upload a YAML topology directly, or import an nmap XML scan and let the system
          auto-detect hosts, OS, services, and CVEs.
        </p>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => switchMode('yaml')}
          className={`flex items-center gap-3 p-5 border-2 transition-all text-left ${
            mode === 'yaml'
              ? 'border-green-600 bg-green-900/30 text-green-100'
              : 'border-green-900/40 bg-gray-900/40 text-green-500 hover:border-green-700/60 hover:text-green-300'
          }`}
        >
          <FaFileAlt className={`text-2xl flex-shrink-0 ${mode === 'yaml' ? 'text-green-400' : 'text-green-700'}`} />
          <div>
            <div className="font-bold text-sm" style={font}>Upload YAML</div>
            <div className="text-xs mt-0.5 opacity-70">Direct topology file (.yaml / .yml)</div>
          </div>
          {mode === 'yaml' && <span className="ml-auto w-2 h-2 rounded-full bg-green-400" />}
        </button>

        <button
          onClick={() => switchMode('xml')}
          className={`flex items-center gap-3 p-5 border-2 transition-all text-left ${
            mode === 'xml'
              ? 'border-green-600 bg-green-900/30 text-green-100'
              : 'border-green-900/40 bg-gray-900/40 text-green-500 hover:border-green-700/60 hover:text-green-300'
          }`}
        >
          <FaTerminal className={`text-2xl flex-shrink-0 ${mode === 'xml' ? 'text-green-400' : 'text-green-700'}`} />
          <div>
            <div className="font-bold text-sm" style={font}>Import nmap XML</div>
            <div className="text-xs mt-0.5 opacity-70">Auto-detect hosts, services &amp; CVEs (.xml)</div>
          </div>
          {mode === 'xml' && <span className="ml-auto w-2 h-2 rounded-full bg-green-400" />}
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0 border border-green-900/40 bg-gray-900/60 p-4">
        {steps.map((s, i, arr) => (
          <React.Fragment key={s.key}>
            <div className={`flex items-center gap-2 text-sm px-3 py-1 ${step === s.key ? 'text-green-300' : 'text-green-700'}`} style={font}>
              {step === s.key && <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />}
              {s.label}
            </div>
            {i < arr.length - 1 && <FaArrowRight className="text-green-900 mx-1" />}
          </React.Fragment>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="border border-red-700/50 bg-red-900/20 p-4 flex gap-3">
          <FaExclamationTriangle className="text-red-400 mt-0.5 flex-shrink-0" />
          <pre className="text-red-300 text-sm whitespace-pre-wrap font-mono">{error}</pre>
        </div>
      )}

      {/* ── STEP 1: Upload ───────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-4">

          {/* XML hint block */}
          {mode === 'xml' && (
            <div className="border border-green-900/40 bg-gray-900/40 p-4">
              <div className="flex items-center gap-2 mb-3 text-green-300" style={font}>
                <FaTerminal />
                <span className="text-sm">How to generate the nmap XML</span>
              </div>

              {/* Step 1 */}
              <div className="mb-1 text-xs text-green-600/80 font-mono">Step 1 — Find your network range</div>
              <div className="bg-black/40 border border-green-900/30 p-3 font-mono text-xs text-green-400 space-y-1 mb-3">
                <div>
                  <span className="text-green-700">$ </span>ipconfig
                  <span className="text-green-700 ml-2"># Windows — note IPv4 Address &amp; Subnet Mask</span>
                </div>
                <div>
                  <span className="text-green-700">$ </span>ip addr
                  <span className="text-green-700 ml-2"># Linux / Mac</span>
                </div>
                <div className="text-green-700 text-[10px] pt-1">
                  Example: IPv4 = 192.168.10.5, Subnet Mask = 255.255.255.0 → your range is 192.168.10.0/24
                </div>
              </div>

              {/* Step 2 */}
              <div className="mb-1 text-xs text-green-600/80 font-mono">Step 2 — Scan all hosts on your network</div>
              <div className="bg-black/40 border border-green-900/30 p-3 font-mono text-xs text-green-400 space-y-1">
                <div>
                  <span className="text-green-700">$ </span>nmap -sV -O -oX scan.xml 192.168.1.0/24
                </div>
                <div className="text-green-700 text-[10px] pt-1">
                  ↳ Replace 192.168.1.0/24 with your actual subnet &nbsp;|&nbsp; /24 = scans up to 254 IPs, only active hosts appear in the XML
                </div>
              </div>

              {/* Flag legend */}
              <ul className="mt-3 space-y-1 text-green-300/60 text-xs">
                <li>• <code className="text-green-400">-sV</code> — detect service &amp; version on each open port</li>
                <li>• <code className="text-green-400">-O</code> — detect operating system (Windows / Linux)</li>
                <li>• <code className="text-green-400">-oX scan.xml</code> — save output as XML for upload</li>
                <li>• <code className="text-green-400">192.168.1.0/24</code> — scans the entire subnet (up to 254 hosts)</li>
              </ul>
            </div>
          )}

          {/* YAML hint block */}
          {mode === 'yaml' && (
            <div className="border border-green-900/40 bg-gray-900/40 p-4">
              <div className="flex items-center gap-2 mb-2 text-green-300" style={font}>
                <FaFileAlt />
                <span className="text-sm">Expected YAML structure</span>
              </div>
              <div className="bg-black/40 border border-green-900/30 p-3 font-mono text-xs text-green-400 leading-relaxed">
                <div className="text-green-600 mb-1"># topology.yaml</div>
                <div>network:</div>
                <div>&nbsp;&nbsp;hosts:</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;WebServer:</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;os: linux</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;services: [http, https, ssh]</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;vulnerabilities: [CVE-2023-44487]</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;sensitivity: high</div>
                <div>&nbsp;&nbsp;edges:</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;- [WebServer, DatabaseServer]</div>
              </div>
            </div>
          )}

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed transition-colors cursor-pointer p-12 text-center ${
              dragging
                ? 'border-green-500 bg-green-900/20'
                : file
                ? 'border-green-700 bg-green-900/10'
                : 'border-green-900/50 bg-gray-900/40 hover:border-green-700/70'
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileRef}
              type="file"
              accept={mode === 'yaml' ? '.yaml,.yml' : '.xml'}
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />
            {file ? (
              <div className="space-y-2">
                <FaFileCode className="text-green-400 text-4xl mx-auto" />
                <p className="text-green-200 font-medium" style={font}>{file.name}</p>
                <p className="text-green-500 text-sm">{(file.size / 1024).toFixed(1)} KB — click to change</p>
              </div>
            ) : (
              <div className="space-y-3">
                <FaUpload className="text-green-700 text-4xl mx-auto" />
                <p className="text-green-400" style={font}>
                  {mode === 'yaml' ? 'Drop YAML topology here or click to browse' : 'Drop nmap XML here or click to browse'}
                </p>
                <p className="text-green-600 text-sm">
                  {mode === 'yaml' ? 'Accepts .yaml and .yml files' : 'Accepts .xml files from nmap -oX'}
                </p>
              </div>
            )}
          </div>

          {/* Action button */}
          {mode === 'yaml' ? (
            <button
              onClick={handleYamlUpload}
              disabled={!file || uploading}
              className="w-full py-3 bg-green-800/60 border border-green-700/50 text-green-100 hover:bg-green-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              style={font}
            >
              {uploading
                ? <><FaSpinner className="animate-spin" /> Uploading...</>
                : <><FaUpload /> Upload Topology</>}
            </button>
          ) : (
            <button
              onClick={handleParse}
              disabled={!file || parsing}
              className="w-full py-3 bg-green-800/60 border border-green-700/50 text-green-100 hover:bg-green-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              style={font}
            >
              {parsing
                ? <><FaSpinner className="animate-spin" /> Parsing...</>
                : <><FaNetworkWired /> Parse Topology</>}
            </button>
          )}

          {/* Sample / demo option — lets new users try the drill without
              having to run nmap on their own network first */}
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px bg-green-900/40" />
            <span className="text-green-700 text-xs" style={font}>or</span>
            <div className="flex-1 h-px bg-green-900/40" />
          </div>
          <button
            onClick={handleLoadSample}
            disabled={loadingDemo}
            className="w-full py-3 border border-green-900/50 text-green-300 hover:text-green-100 hover:border-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={font}
          >
            {loadingDemo
              ? <><FaSpinner className="animate-spin" /> Loading sample...</>
              : <><FaFlask /> Try with a sample network</>}
          </button>
          <p className="text-green-600 text-xs text-center">
            New here? Load a built-in topology and skip the nmap step.
          </p>
        </div>
      )}

      {/* ── STEP 2: Review (XML only) ─────────────────────────────────────────── */}
      {step === 'review' && (
        <div className="space-y-4">

          {/* Warnings from the parser (e.g. hosts with no services detected) */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.map((w, i) => (
                <div key={i} className="border border-yellow-700/50 bg-yellow-900/15 p-3 flex gap-3">
                  <FaInfoCircle className="text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div className="text-yellow-200 text-sm">
                    <div>{w.message}</div>
                    {Array.isArray(w.hosts) && w.hosts.length > 0 && (
                      <div className="mt-1 text-yellow-400/80 text-xs font-mono">
                        Hosts: {w.hosts.slice(0, 8).join(', ')}
                        {w.hosts.length > 8 ? `, +${w.hosts.length - 8} more` : ''}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary bar */}
          <div className="grid grid-cols-4 gap-3">
            <div className="border border-green-900/40 bg-gray-900/60 p-4 text-center">
              <div className="text-2xl font-bold text-green-300" style={font}>{hosts.length}</div>
              <div className="text-green-600 text-xs mt-1">Hosts Detected</div>
            </div>
            {['high', 'medium', 'low'].map(s => (
              <div key={s} className="border border-green-900/40 bg-gray-900/60 p-4 text-center">
                <div className={`text-2xl font-bold ${s === 'high' ? 'text-red-400' : s === 'medium' ? 'text-yellow-400' : 'text-green-400'}`} style={font}>
                  {sensCount[s] || 0}
                </div>
                <div className="text-green-600 text-xs mt-1 capitalize">{s} Sensitivity</div>
              </div>
            ))}
          </div>

          {/* Host table */}
          <div className="border border-green-900/40 bg-gray-900/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-green-900/30 flex items-center gap-2">
              <FaServer className="text-green-500" />
              <span className="text-green-200 font-medium text-sm" style={font}>
                Detected Hosts — adjust sensitivity as needed
              </span>
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-green-900/30 text-green-500 text-xs">
                    <th className="text-left px-4 py-2" style={font}>Host</th>
                    <th className="text-left px-4 py-2" style={font}>IP</th>
                    <th className="text-left px-4 py-2" style={font}>OS</th>
                    <th className="text-left px-4 py-2" style={font}>Services</th>
                    <th className="text-left px-4 py-2" style={font}>CVEs Mapped</th>
                    <th className="text-left px-4 py-2" style={font}>Sensitivity</th>
                  </tr>
                </thead>
                <tbody>
                  {hosts.map((h, i) => (
                    <tr key={h.key} className={`border-b border-green-900/20 ${i % 2 === 0 ? 'bg-gray-900/20' : ''}`}>
                      <td className="px-4 py-3 text-green-200 font-mono font-medium">{h.key}</td>
                      <td className="px-4 py-3 text-green-400/70 font-mono text-xs">{h.ip || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 border ${h.os === 'windows' ? 'text-blue-300 bg-blue-900/20 border-blue-700/40' : 'text-yellow-300 bg-yellow-900/20 border-yellow-700/40'}`}>
                          {h.os}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {h.services.length === 0 ? (
                            <span className="text-xs px-1.5 py-0.5 bg-yellow-900/20 border border-yellow-700/40 text-yellow-300 font-mono">
                              none detected
                            </span>
                          ) : (
                            <>
                              {h.services.slice(0, 4).map(s => (
                                <span key={s} className="text-xs px-1.5 py-0.5 bg-gray-800 border border-green-900/40 text-green-400/80 font-mono">
                                  {s}
                                </span>
                              ))}
                              {h.services.length > 4 && (
                                <span className="text-xs text-green-600">+{h.services.length - 4}</span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-green-600 text-xs font-mono">
                        {h.suggested_cves.length > 0
                          ? `${h.suggested_cves.length} CVE${h.suggested_cves.length > 1 ? 's' : ''}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={sensitivities[h.key] || h.suggested_sensitivity}
                          onChange={(e) => setSensitivities(prev => ({ ...prev, [h.key]: e.target.value }))}
                          className={`text-xs px-2 py-1 border rounded-none bg-gray-900 cursor-pointer focus:outline-none ${SENS_COLORS[sensitivities[h.key] || h.suggested_sensitivity]}`}
                          style={font}
                        >
                          {SENSITIVITY_OPTS.map(o => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Filename + save */}
          <div className="border border-green-900/40 bg-gray-900/60 p-5 space-y-4">
            <div className="flex items-center gap-2 text-green-300" style={font}>
              <FaShieldAlt />
              <span className="text-sm">Scenario Configuration</span>
            </div>
            <div>
              <label className="block text-green-500 text-xs mb-1" style={font}>Scenario Filename</label>
              <div className="flex items-center">
                <input
                  type="text"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  className="flex-1 bg-black/40 border border-green-900/50 text-green-200 px-3 py-2 text-sm font-mono focus:outline-none focus:border-green-600"
                  placeholder="my_network_scan"
                />
                <span className="text-green-600 text-sm px-3 py-2 bg-gray-900 border border-l-0 border-green-900/50 font-mono">.yaml</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={resetAll}
              className="flex items-center gap-2 px-4 py-3 border border-green-900/50 text-green-500 hover:text-green-300 hover:border-green-700 transition-colors"
              style={font}
            >
              <FaRedo className="text-xs" /> Start Over
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 bg-green-800/60 border border-green-700/50 text-green-100 hover:bg-green-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              style={font}
            >
              {saving
                ? <><FaSpinner className="animate-spin" /> Saving Scenario...</>
                : <><FaCheckCircle /> Create Drill Scenario</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Done (both modes) ────────────────────────────────────────────────── */}
      {step === 'done' && scenario && (
        <div className="space-y-4">
          <div className="border border-green-700/50 bg-green-900/20 p-8 text-center space-y-4">
            <FaCheckCircle className="text-green-400 text-5xl mx-auto" />
            <h2 className="text-xl font-bold text-green-200" style={font}>Scenario Created Successfully</h2>
            <p className="text-green-400 text-sm">
              <strong style={font}>{scenario.name}</strong>
              {' — '}
              {scenario.num_hosts} host{scenario.num_hosts !== 1 ? 's' : ''}
              {mode === 'yaml' ? ', topology uploaded directly' : ', imported from nmap scan'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
              <button
                onClick={() => navigate('/ai-orchestrator')}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-green-800/60 border border-green-700/50 text-green-100 hover:bg-green-700/50 transition-colors"
                style={font}
              >
                Run Drill <FaArrowRight />
              </button>
              <button
                onClick={resetAll}
                className="flex items-center justify-center gap-2 px-6 py-3 border border-green-900/50 text-green-400 hover:text-green-200 hover:border-green-700 transition-colors"
                style={font}
              >
                <FaUpload /> Import Another
              </button>
            </div>
          </div>

          {/* Summary — XML mode shows per-sensitivity counts, YAML shows generic */}
          <div className="border border-green-900/40 bg-gray-900/60 p-4">
            <div className="text-green-500 text-xs mb-3" style={font}>Topology Summary</div>
            {mode === 'xml' ? (
              <div className="grid grid-cols-3 gap-3 text-center">
                {['high', 'medium', 'low'].map(s => (
                  <div key={s} className={`border p-3 ${s === 'high' ? 'border-red-700/40' : s === 'medium' ? 'border-yellow-700/40' : 'border-green-800/40'}`}>
                    <div className={`text-xl font-bold ${s === 'high' ? 'text-red-400' : s === 'medium' ? 'text-yellow-400' : 'text-green-400'}`} style={font}>
                      {sensCount[s] || 0}
                    </div>
                    <div className="text-green-600 text-xs capitalize">{s}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-4 text-green-400">
                <FaServer className="text-green-600" />
                <span className="text-sm font-mono">{scenario.num_hosts} hosts</span>
                <span className="text-green-700">•</span>
                <span className="text-sm font-mono text-green-500">{scenario.filename}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default UploadTopology
