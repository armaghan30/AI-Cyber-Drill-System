# AI-Powered Cyber Drill System — Frontend

React single-page application for the AI-Powered Cyber Drill System FYP. Provides the dashboard, drill launcher, live simulation views, analytics, and security report UI on top of the FastAPI backend.

---

## Tech Stack

- **React 18** — UI library
- **Vite** — Dev server and build tool
- **Tailwind CSS** — Utility-first styling
- **React Router v6** — Client-side routing
- **React Icons** — Icon set
- **Recharts** — Reward timelines and analytics charts

---

## Pages

### Authenticated (inside `Layout` with sidebar)

| Path | Component | Purpose |
|------|-----------|---------|
| `/home` | `Home.jsx` | Landing page with quick stats |
| `/ai-orchestrator` | `AIOrchestrator.jsx` | Upload a topology and launch a drill. Streams the 3-stage pipeline: `uploaded` → `simulating` → `done` |
| `/network-monitor` | `CommandCentre.jsx` | Live host status grid during a drill |
| `/analytics` | `Analytics.jsx` | Per-drill reward timeline, action distribution, attack path, CVE inventory, step log |
| `/report` | `Report.jsx` | Printable security report (cover, executive summary, host risk, CVEs, simulation steps, firewall, MITRE, remediation) |
| `/settings` | `Settings.jsx` | User preferences and RL algorithm settings |
| `/profile` | `Profile.jsx` | Account details |

The sidebar exposes exactly six pages: Home, AI Orchestrator, Network Monitor, Analytics, Security Report, Settings. Profile is reachable from the layout but not the sidebar.

### Unauthenticated

| Path | Component | Purpose |
|------|-----------|---------|
| `/login` | `Login.jsx` | Sign in (HMAC bearer token cached in `localStorage`) |
| `/register` | `Register.jsx` | Create a new user |
| `/forgot-password` | `ForgotPassword.jsx` | Password reset flow |

---

## Project Structure

```
frontend/
|-- src/
|   |-- App.jsx                 Route definitions + auth gate
|   |-- main.jsx                Entry point
|   |-- index.css               Tailwind directives + global styles
|   |-- api.js                  Backend client (fetch wrapper, token handling)
|   |-- components/
|   |   |-- Layout.jsx          Sidebar + outlet for authenticated routes
|   |-- pages/                  Page components (see table above)
|
|-- index.html                  Vite entry HTML
|-- package.json
|-- vite.config.js
|-- tailwind.config.js
|-- postcss.config.js
|-- README.md
```

---

## Installation

```bash
npm install
```

---

## How to Run

### Development server (with hot reload)

```bash
npm run dev
```

Vite serves on `http://localhost:5173` by default. The backend must be running on `http://localhost:8000` — see the root `README.md` for the backend run command.

### Production build

```bash
npm run build
```

Outputs static assets to `dist/`. The backend's CORS config already allows the Vite dev origins (5173–5174) and common React dev origins (3000–3003).

---

## Backend Communication

All API calls go through `src/api.js`, which:

- Prepends the backend base URL (`http://localhost:8000/api`)
- Attaches the `Authorization: Bearer <token>` header from `localStorage`
- Returns parsed JSON or throws on non-2xx responses

Auth flow:
1. `Login.jsx` calls `POST /api/auth/login` and stores the returned token + username in `localStorage`.
2. `App.jsx` runs `api.me()` on every mount to validate the cached token — if the backend was reset between sessions, the stale token is cleared and the user is bounced back to `/login`.
3. The user logs out via the sidebar, which clears `localStorage` and flips `isAuthenticated` to `false`.

---

## Persistence

A small amount of UI state is kept in `localStorage` so it survives navigation and reload:

- `token`, `username` — auth state
- AI Orchestrator drill stage — keeps the active drill alive across tab navigation

---

## Notes for Reviewers

- The drill itself runs server-side. The frontend polls `/api/simulations/{id}` (or step endpoints) to stream live progress.
- The Security Report has **two PDF paths**: a backend-rendered version (`pdf_service.py`, ReportLab) and a frontend `window.print()` version (`Report.jsx`). Both cover the same sections.
- The Analytics page intentionally omits an aggregated "Overall Defense Performance" panel — per-scenario metrics are the project's preferred presentation.
