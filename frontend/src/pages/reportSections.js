// Printable report: shared styles and the security assessment sections (2-4).

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const LEVEL_CLASS = {
  'Very High': 'lvl-vh', High: 'lvl-h', Moderate: 'lvl-m', Low: 'lvl-l', 'Very Low': 'lvl-vl',
}
const ACTION_NAMES = { deploy_firewall: 'Firewall', patch: 'Patch', harden: 'Harden' }

// colours follow the app: gray-900 panels, green-400/600/900 accents, Gugi headings
export const REPORT_CSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,Helvetica,sans-serif; background:#fff; color:#1f2937; padding:48px 60px; line-height:1.6; font-size:13px;
         -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @media print {
    body { padding:28px 36px; }
    .no-print { display:none !important; }
    .page-break { page-break-before:always; }
  }
  h1, h2, .brand { font-family:'Gugi',Arial,sans-serif; font-weight:400; }
  h2 { font-size:17px; color:#14532d; margin:32px 0 10px; padding-bottom:5px; border-bottom:2px solid #16a34a; }
  h3 { font-size:14px; font-weight:700; color:#166534; margin:18px 0 6px; }
  p { margin:6px 0; }
  table { width:100%; border-collapse:collapse; margin:10px 0; font-size:12px; }
  th { background:#f0fdf4; color:#14532d; padding:8px 10px; text-align:left; border-bottom:2px solid #16a34a; font-size:11px; text-transform:uppercase; letter-spacing:0.4px; }
  td { padding:7px 10px; border-bottom:1px solid #e5e7eb; vertical-align:top; }
  ul, ol { padding-left:22px; margin:6px 0; }
  li { margin-bottom:4px; }
  a { color:#166534; text-decoration:none; }
  .muted { color:#6b7280; font-size:11px; }
  .cover { background:#111827; color:#d1fae5; padding:44px 40px 36px; border-left:6px solid #16a34a; margin-bottom:32px; }
  .cover .brand { font-size:34px; color:#4ade80; }
  .cover .subtitle { font-size:14px; color:#bbf7d0; margin:4px 0 22px; }
  .cover .meta { font-size:12px; color:#d1d5db; line-height:1.9; }
  .cover .meta strong { color:#f0fdf4; }
  .outcome { display:inline-block; padding:4px 14px; font-weight:700; font-size:13px; letter-spacing:1px; border:2px solid; margin-bottom:18px; }
  .outcome.breached { color:#fca5a5; border-color:#ef4444; background:rgba(239,68,68,0.12); }
  .outcome.defended { color:#86efac; border-color:#22c55e; background:rgba(34,197,94,0.12); }
  .outcome.none { color:#d1d5db; border-color:#6b7280; }
  .badge { display:inline-block; padding:1px 8px; font-size:10px; font-weight:700; border-radius:2px; text-transform:uppercase; }
  .badge-critical { background:#fee2e2; color:#b91c1c; }
  .badge-high { background:#ffedd5; color:#c2410c; }
  .badge-medium { background:#fef9c3; color:#a16207; }
  .badge-low { background:#dcfce7; color:#15803d; }
  .lvl { display:inline-block; padding:2px 10px; font-weight:700; border-radius:2px; }
  .lvl-vh { background:#fee2e2; color:#b91c1c; }
  .lvl-h { background:#ffedd5; color:#c2410c; }
  .lvl-m { background:#fef9c3; color:#a16207; }
  .lvl-l, .lvl-vl { background:#dcfce7; color:#15803d; }
  .cards { display:flex; gap:14px; margin:10px 0; }
  .card { flex:1; border:1px solid #d1d5db; border-top:3px solid #16a34a; padding:10px 14px; }
  .card .label { font-size:10px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px; }
  .card .big { font-size:15px; margin:4px 0; }
  .note { border-left:3px solid #16a34a; background:#f0fdf4; padding:8px 12px; margin:10px 0; }
  .warn { border-left:3px solid #d97706; background:#fffbeb; padding:8px 12px; margin:10px 0; }
  .toc li { margin-bottom:4px; }
  .footer { margin-top:44px; padding-top:12px; border-top:2px solid #16a34a; text-align:center; color:#6b7280; font-size:11px; }
`

const modeCard = (title, m) => `
  <div class="card">
    <div class="label">${esc(title)}</div>
    <div class="big"><span class="lvl ${LEVEL_CLASS[m.nist.level] || 'lvl-m'}">${esc(m.nist.level)}</span></div>
    <div>Breach rate <strong>${m.breach_rate}%</strong> <span class="muted">(95% range ${m.ci95.low}&ndash;${m.ci95.high}%)</span></div>
    <div class="muted">${m.breaches}/${m.drills} drills breached &middot; avg ${m.mean_hosts_compromised} hosts compromised &middot; data stolen from ${m.mean_hosts_exfiltrated} hosts on average</div>
  </div>`

export const assessmentSummaryLine = (r) => {
  const cur = r.modes.current_security, ai = r.modes.ai_defence
  return `Assessed likelihood of a breach: ${cur.nist.level} (${cur.breach_rate}%) with current security; ` +
    `${ai.nist.level} (${ai.breach_rate}%) with AI defence (NIST SP 800-30 Table G-4).`
}

const noAssessment = '<p class="muted">No security assessment has been run for this network yet. Run one from the Security Report page.</p>'

export function buildAssessmentSections(assessment) {
  const r = assessment?.result
  if (!r) {
    return `<h2 id="assessment">2. Security Assessment</h2>${noAssessment}
<h2 id="playbook">3. AI Defence Playbook</h2>${noAssessment}
<h2 id="whatif">4. What-if Hardening</h2>${noAssessment}`
  }
  const cur = r.modes.current_security, ai = r.modes.ai_defence, n = r.drills_per_mode
  const pb = r.playbook, wi = r.what_if

  const assessmentHtml = `
<h2 id="assessment">2. Security Assessment</h2>
<p>The trained attacker ran <strong>${n} drills of ${r.steps} steps</strong> against a digital copy of the network, first with no active
defence and then with the trained AI defender. A drill counts as breached when ${esc(r.breach_criterion)}. The breach rate is
rated on the likelihood scale of <strong>${esc(r.citation)}</strong>.</p>
<div class="cards">${modeCard('Current security (no active defence)', cur)}${modeCard('With AI defence', ai)}</div>
${r.breach_rate_reduction !== undefined ? `<p>The AI defender lowered the breach rate by <strong>${r.breach_rate_reduction} percentage points</strong>.</p>` : ''}
<table>
  <thead><tr><th>Likelihood level</th><th>Breach rate</th><th>Meaning (NIST SP 800-30)</th></tr></thead>
  <tbody>
    <tr><td><span class="lvl lvl-vh">Very High</span></td><td>96&ndash;100%</td><td>almost certain to have adverse impacts</td></tr>
    <tr><td><span class="lvl lvl-h">High</span></td><td>80&ndash;95%</td><td>highly likely to have adverse impacts</td></tr>
    <tr><td><span class="lvl lvl-m">Moderate</span></td><td>21&ndash;79%</td><td>somewhat likely to have adverse impacts</td></tr>
    <tr><td><span class="lvl lvl-l">Low</span></td><td>5&ndash;20%</td><td>unlikely to have adverse impacts</td></tr>
    <tr><td><span class="lvl lvl-vl">Very Low</span></td><td>0&ndash;4%</td><td>highly unlikely to have adverse impacts</td></tr>
  </tbody>
</table>
<h3>2.1 Most attacked hosts (no active defence)</h3>
<table>
  <thead><tr><th>Host</th><th>Compromised</th><th>Data stolen</th></tr></thead>
  <tbody>${cur.top_hosts.map(h => `<tr><td><strong>${esc(h.host)}</strong></td><td>${h.compromised_drills}/${n} drills</td><td>${h.exfiltrated_drills}/${n} drills</td></tr>`).join('')}</tbody>
</table>
<h3>2.2 CVEs the attacker used</h3>
<table>
  <thead><tr><th>CVE</th><th>Host</th><th>Used in</th></tr></thead>
  <tbody>${cur.top_cves.map(c => `<tr><td style="font-family:monospace">${esc(c.cve)}</td><td>${esc(c.hosts.join(', '))}</td><td>${c.drills}/${n} drills</td></tr>`).join('')}</tbody>
</table>`

  const playbookHtml = !pb ? `<h2 id="playbook">3. AI Defence Playbook</h2>${noAssessment}` : `
<h2 id="playbook">3. AI Defence Playbook</h2>
<p>What the trained defender did across ${pb.drills} drills, and how much it changed the outcome compared with no active defence.</p>
<h3>3.1 Do first</h3>
<ol>${pb.immediate.map(i => `<li>${esc(i.advice)} <span class="muted">(${i.drills}/${pb.drills} drills, usually step ${i.typical_step})</span></li>`).join('')}</ol>
<h3>3.2 Hardening priorities</h3>
<table>
  <thead><tr><th>Host</th><th>Action</th><th>Drills</th><th>Compromised (before &rarr; after)</th><th>Data stolen (before &rarr; after)</th></tr></thead>
  <tbody>${pb.hardening.map(h => {
    const untouched = h.compromised_before === 0 && h.stolen_before === 0
    return `<tr><td><strong>${esc(h.host)}</strong> <span class="muted">${esc(h.sensitivity || '')}</span></td>
      <td>${Object.keys(h.actions).map(a => ACTION_NAMES[a] || a).join(', ')}</td><td>${h.drills}/${pb.drills}</td>
      ${untouched ? '<td colspan="2" class="muted">not attacked in these drills (no measured effect)</td>'
        : `<td>${h.compromised_before} &rarr; ${h.compromised_after}</td><td>${h.stolen_before} &rarr; ${h.stolen_after}</td>`}</tr>`
  }).join('')}</tbody>
</table>
<h3>3.3 Incident response</h3>
<p>${esc(pb.incident_response.note)}</p>
${pb.gaps.length ? `<h3>3.4 Remaining gaps (still breached with AI defence)</h3>
<table>
  <thead><tr><th>Host</th><th>Compromised</th><th>Data stolen</th><th>Recommended fix</th></tr></thead>
  <tbody>${pb.gaps.map(g => `<tr><td><strong>${esc(g.host)}</strong></td><td>${g.compromised}/${pb.drills}</td><td>${g.stolen}/${pb.drills}</td><td>${esc(g.advice)}</td></tr>`).join('')}</tbody>
</table>` : ''}`

  const whatifHtml = !wi ? `<h2 id="whatif">4. What-if Hardening</h2>${noAssessment}` : `
<h2 id="whatif">4. What-if Hardening</h2>
<p>The top ${wi.fixes.length} fixes below were applied to a copy of the network, which was then attacked again with no active defence.</p>
<table>
  <thead><tr><th>#</th><th>Fix</th><th>Why</th></tr></thead>
  <tbody>${wi.fixes.map((f, i) => `<tr><td>${i + 1}</td><td><strong>${esc(f.advice)}</strong></td><td>${esc(f.reason)}</td></tr>`).join('')}</tbody>
</table>
${wi.after ? `<div class="cards">${modeCard('Before (current security)', wi.before)}${modeCard('After the fixes', wi.after)}</div>` : ''}
${wi.remaining_entry_points?.length ? `<div class="warn">${esc(wi.entry_points_note)}</div>` : ''}
<div class="note">${esc(wi.caveat)}</div>`

  return assessmentHtml + playbookHtml + whatifHtml
}
