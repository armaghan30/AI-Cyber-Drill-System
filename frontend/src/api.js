const API_BASE = 'http://localhost:8000/api';
const STATIC_BASE = 'http://localhost:8000';

function getToken() {
  return localStorage.getItem('token') || '';
}

function _userKey() {
  const u = localStorage.getItem('username');
  return u ? `cyberDrill_scenarios_${u}` : null;
}

function getUserScenarioIds() {
  const key = _userKey();
  if (!key) return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}

function addUserScenario(id) {
  const key = _userKey();
  if (!key) return;
  const ids = getUserScenarioIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(key, JSON.stringify(ids));
  }
}

function removeUserScenario(id) {
  const key = _userKey();
  if (!key) return;
  const ids = getUserScenarioIds().filter(x => x !== id);
  localStorage.setItem(key, JSON.stringify(ids));
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'API error');
  }
  return res.json();
}

const api = {
  // Auth
  login: (username, password) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  register: (username, email, password) =>
    apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),
  me: () => apiFetch('/auth/me'),

  // Health
  health: () => apiFetch('/health'),

  // Scenarios
  listScenarios: () => apiFetch('/scenarios'),
  getScenario: (id) => apiFetch(`/scenarios/${id}`),
  uploadTopology: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/scenarios/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Upload failed');
    }
    return res.json();
  },
  deleteScenario: (id) =>
    apiFetch(`/scenarios/${id}`, { method: 'DELETE' }).catch(() => true),
  getTrainingStatus: (scenarioId) =>
    apiFetch(`/scenarios/${scenarioId}/training-status`),

  // Simulations — full run
  runSimulation: (scenarioId, maxSteps = 10) =>
    apiFetch('/simulations/run', {
      method: 'POST',
      body: JSON.stringify({ scenario_id: scenarioId, max_steps: maxSteps }),
    }),
  listSimulations: () => apiFetch('/simulations'),
  getSimulation: (id) => apiFetch(`/simulations/${id}`),
  getAttackPath: (simId) => apiFetch(`/simulations/${simId}/attack-path`),

  // Simulations — live step-by-step
  createSimulation: (scenarioId, maxSteps = 50) =>
    apiFetch('/simulations/', {
      method: 'POST',
      body: JSON.stringify({ scenario_id: scenarioId, max_steps: maxSteps }),
    }),
  runStep: (sessionId) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${API_BASE}/simulations/${sessionId}/step`, {
      method: 'POST',
      headers,
      signal: controller.signal,
    })
      .then(res => {
        clearTimeout(timer);
        if (!res.ok) return res.json().catch(() => ({ detail: res.statusText })).then(e => { throw new Error(e.detail || 'Step failed'); });
        return res.json();
      })
      .catch(err => {
        clearTimeout(timer);
        if (err.name === 'AbortError') throw new Error('Step timed out — backend is busy. Try closing other browser tabs.');
        throw err;
      });
  },
  stopSimulation: (sessionId) =>
    apiFetch(`/simulations/${sessionId}/stop`, { method: 'POST' }),


  // Security assessment
  startAssessment: (scenarioId, drills = 30, steps = 15) =>
    apiFetch('/assessments/', { method: 'POST', body: JSON.stringify({ scenario_id: scenarioId, drills, steps }) }),
  getAssessment: (id) => apiFetch(`/assessments/${id}`),
  listAssessments: (scenarioId) => apiFetch(`/assessments/?scenario_id=${scenarioId}`),

  // Training
  startTraining: (payload) =>
    apiFetch('/training', { method: 'POST', body: JSON.stringify(payload) }),
  listTrainingRuns: () => apiFetch('/training'),
  getTrainingRun: (id) => apiFetch(`/training/${id}`),
  pauseTraining: (runId) =>
    apiFetch(`/training/${runId}/pause`, { method: 'POST' }),
  resumeTraining: (runId) =>
    apiFetch(`/training/${runId}/resume`, { method: 'POST' }),
  stopTraining: (runId) =>
    apiFetch(`/training/${runId}/stop`, { method: 'POST' }),

  // Reports
  dashboard: () => apiFetch('/reports/dashboard'),
  csvFiles: () => apiFetch('/reports/training/csvfiles'),
  csvRewards: (filename) => apiFetch(`/reports/training/csv/${filename}`),
  plotFiles: () => apiFetch('/reports/training/plots'),
  simulationSummary: (id) => apiFetch(`/reports/simulations/${id}/summary`),
  defenseAnalysis: () => apiFetch('/reports/defense-analysis'),
  simulationReport: (id) => apiFetch(`/reports/simulations/${id}/report`),
  firewallAnalysis: (simId) => apiFetch(`/reports/simulations/${simId}/firewall`),
  aiRecommendations: (scenarioId) =>
    apiFetch(`/reports/scenarios/${scenarioId}/recommendations`),
  downloadPdf: async (scenarioId, simId) => {
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const url = `${API_BASE}/reports/scenarios/${scenarioId}/pdf${simId ? `?sim_id=${simId}` : ''}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'PDF generation failed');
    }
    return res.blob();
  },

  // Per-user scoped helpers (kept for backwards compat)
  addUserScenario: (id) => addUserScenario(id),
  removeUserScenario: (id) => removeUserScenario(id),
  getUserScenarioIds: () => getUserScenarioIds(),
  listMyScenarios: () => apiFetch('/scenarios'),
  listMySimulations: () => apiFetch('/simulations'),
  listMyTrainingRuns: () => apiFetch('/training'),

  // Nmap import
  parseNmap: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/topology/parse-nmap`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Parse failed');
    }
    return res.json();
  },

  saveNmap: (filename, hosts, sensitivities, edges = []) =>
    apiFetch('/topology/save-nmap', {
      method: 'POST',
      body: JSON.stringify({ filename, hosts, sensitivities, edges }),
    }),

  // CVE lookup — single or batch
  getCVE: (cveId) => apiFetch(`/cve/${encodeURIComponent(cveId)}`),
  getCVEBatch: (cveIds) =>
    apiFetch('/cve/batch', {
      method: 'POST',
      body: JSON.stringify({ ids: cveIds }),
    }),

  // Static URLs
  plotUrl: (filename) => `${STATIC_BASE}/plots/${filename}.png`,
};

export default api;
