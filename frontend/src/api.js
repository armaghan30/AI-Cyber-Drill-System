const API_BASE = 'http://localhost:8000/api';
const STATIC_BASE = 'http://localhost:8000';

function getToken() {
  return localStorage.getItem('token') || '';
}

// ── Per-user data scoping ───────────────────────────────────────────────
// The backend has a single shared DB. We track which scenario IDs belong
// to the current user in localStorage so each user sees only their data.

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

  // Simulations
  runSimulation: (scenarioId, maxSteps = 10) =>
    apiFetch('/simulations/run', {
      method: 'POST',
      body: JSON.stringify({ scenario_id: scenarioId, max_steps: maxSteps }),
    }),
  listSimulations: () => apiFetch('/simulations'),
  getSimulation: (id) => apiFetch(`/simulations/${id}`),

  // Training
  startTraining: (payload) =>
    apiFetch('/training', { method: 'POST', body: JSON.stringify(payload) }),
  listTrainingRuns: () => apiFetch('/training'),
  getTrainingRun: (id) => apiFetch(`/training/${id}`),

  // Reports
  dashboard: () => apiFetch('/reports/dashboard'),
  csvFiles: () => apiFetch('/reports/training/csvfiles'),
  csvRewards: (filename) => apiFetch(`/reports/training/csv/${filename}`),
  plotFiles: () => apiFetch('/reports/training/plots'),
  simulationSummary: (id) => apiFetch(`/reports/simulations/${id}/summary`),
  defenseAnalysis: () => apiFetch('/reports/defense-analysis'),
  simulationReport: (id) => apiFetch(`/reports/simulations/${id}/report`),

  // Delete
  deleteScenario: (id) =>
    apiFetch(`/scenarios/${id}`, { method: 'DELETE' }).catch(() => true),

  // ── Per-user scoped helpers ──────────────────────────────────────────
  // These filter backend data to only what the current user uploaded.

  addUserScenario: (id) => addUserScenario(id),
  removeUserScenario: (id) => removeUserScenario(id),
  getUserScenarioIds: () => getUserScenarioIds(),

  /** List only scenarios that belong to the current user */
  listMyScenarios: async () => {
    const all = await apiFetch('/scenarios');
    const myIds = getUserScenarioIds();
    return all.filter(s => myIds.includes(s.id));
  },

  /** List only simulations for the current user's scenarios */
  listMySimulations: async () => {
    const all = await apiFetch('/simulations');
    const myIds = getUserScenarioIds();
    return all.filter(s => myIds.includes(s.scenario_id));
  },

  /** List only training runs for the current user's scenarios */
  listMyTrainingRuns: async () => {
    const all = await apiFetch('/training');
    const myIds = getUserScenarioIds();
    return all.filter(r => myIds.includes(r.scenario_id));
  },

  // Static URLs
  plotUrl: (filename) => `${STATIC_BASE}/plots/${filename}.png`,
};

export default api;
