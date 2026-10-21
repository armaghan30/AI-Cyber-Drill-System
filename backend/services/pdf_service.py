import io
import yaml
import datetime
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

from sqlalchemy.orm import Session
from backend.config import settings
from backend.models.scenario import Scenario
from backend.models.simulation import Simulation, SimulationStep
from backend.services.report_service import get_firewall_analysis
from backend.services.simulation_service import get_attack_path
from backend.services.assessment_service import latest_assessment, public_result

PANEL = colors.HexColor('#111827')
GREEN_DARK = colors.HexColor('#14532d')
GREEN = colors.HexColor('#16a34a')
GREEN_LIGHT = colors.HexColor('#4ade80')
GREEN_SOFT = colors.HexColor('#f0fdf4')
LINE = colors.HexColor('#e5e7eb')
INK = colors.HexColor('#1f2937')
LEVEL_COLORS = {
    'Very High': ('#b91c1c', '#fee2e2'), 'High': ('#c2410c', '#ffedd5'), 'Moderate': ('#a16207', '#fef9c3'),
    'Low': ('#15803d', '#dcfce7'), 'Very Low': ('#15803d', '#dcfce7'),
}
ACTION_NAMES = {'deploy_firewall': 'Firewall', 'patch': 'Patch', 'harden': 'Harden'}


def _table_style(extra=()):
    return TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), GREEN_SOFT),
        ('TEXTCOLOR', (0, 0), (-1, 0), GREEN_DARK),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('LINEBELOW', (0, 0), (-1, 0), 1.2, GREEN),
        ('LINEBELOW', (0, 1), (-1, -1), 0.4, LINE),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        *extra,
    ])

# small CVE db for severity lookup
CVE_SEV = {
    'CVE-2021-34527': 'CRITICAL', 'CVE-2020-0796': 'CRITICAL',
    'CVE-2017-0144': 'CRITICAL', 'CVE-2022-0847': 'HIGH',
    'CVE-2021-3156': 'HIGH', 'CVE-2016-5195': 'HIGH',
    'CVE-2020-1472': 'CRITICAL', 'CVE-2019-0708': 'CRITICAL',
    'CVE-2021-1675': 'HIGH', 'CVE-2021-4034': 'HIGH',
    'CVE-2022-2588': 'HIGH', 'CVE-2023-0386': 'HIGH',
    'CVE-2021-3493': 'HIGH', 'CVE-2023-44487': 'CRITICAL',
    'CVE-2021-41773': 'CRITICAL', 'CVE-2019-0211': 'HIGH',
    'CVE-2023-21912': 'HIGH', 'CVE-2022-21270': 'MEDIUM',
    'CVE-2020-14812': 'MEDIUM', 'CVE-2019-2737': 'MEDIUM',
}


def _host_risk(host_info):
    risk = 0
    for cve in host_info.get('vulnerabilities', []):
        sev = CVE_SEV.get(cve, 'MEDIUM')
        risk += 40 if sev == 'CRITICAL' else 25 if sev == 'HIGH' else 15
    if host_info.get('sensitivity') == 'high':
        risk += 20
    if len(host_info.get('services', [])) > 2:
        risk += 10
    return min(risk, 100)


def _risk_label(score):
    if score >= 70: return 'CRITICAL'
    if score >= 40: return 'HIGH'
    if score >= 20: return 'MEDIUM'
    return 'LOW'


def generate_pdf(db: Session, scenario_id: int, sim_id: int = None):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        return None

    # load topology from yaml
    if scenario.is_demo:
        topo_path = settings.TOPOLOGY_DIR / "baselines" / scenario.filename
    elif scenario.user_id:
        topo_path = settings.USER_UPLOADS_DIR / str(scenario.user_id) / scenario.filename
    else:
        topo_path = settings.TOPOLOGY_DIR / scenario.filename
    try:
        with open(topo_path, 'r') as f:
            topo = yaml.safe_load(f)
    except Exception:
        topo = {}

    hosts_data = topo.get('network', {}).get('hosts', {})
    edges_data = topo.get('network', {}).get('edges', [])

    # get simulation
    sim = None
    steps = []
    if sim_id:
        sim = db.query(Simulation).filter(Simulation.id == sim_id).first()
    if not sim:
        sim = db.query(Simulation).filter(
            Simulation.scenario_id == scenario_id
        ).order_by(Simulation.id.desc()).first()

    if sim:
        steps = db.query(SimulationStep).filter(
            SimulationStep.simulation_id == sim.id
        ).order_by(SimulationStep.step_number).all()

    # get firewall analysis
    fw = get_firewall_analysis(db, sim.id) if sim else None

    model_type = "MaskablePPO"
    a = latest_assessment(db, scenario_id)
    result = public_result(a.result) if a else None

    # breach-based verdict (orchestrator/verdict.py), not a reward comparison
    verdict = sim.verdict if sim else None
    defended = bool(verdict) and verdict["outcome"] == "defended"

    # ── build PDF ──
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('title', fontSize=26, fontName='Helvetica-Bold', leading=30,
                                  textColor=GREEN_LIGHT, spaceAfter=4)
    sub_style = ParagraphStyle('sub', fontSize=11, fontName='Helvetica',
                                textColor=colors.HexColor('#bbf7d0'), spaceAfter=10)
    cover_meta = ParagraphStyle('cover_meta', fontSize=9, fontName='Helvetica', leading=15,
                                 textColor=colors.HexColor('#d1d5db'))
    h2_style = ParagraphStyle('h2', fontSize=14, fontName='Helvetica-Bold',
                               textColor=GREEN_DARK, spaceBefore=16, spaceAfter=6)
    h3_style = ParagraphStyle('h3', fontSize=10.5, fontName='Helvetica-Bold',
                               textColor=colors.HexColor('#166534'), spaceBefore=10, spaceAfter=4)
    body_style = ParagraphStyle('body', fontSize=9, fontName='Helvetica',
                                 textColor=INK, spaceAfter=4, leading=14)
    small_style = ParagraphStyle('small', fontSize=8, fontName='Helvetica',
                                  textColor=colors.HexColor('#6b7280'), spaceAfter=2)
    mono_style = ParagraphStyle('mono', fontSize=8, fontName='Courier',
                                 textColor=colors.HexColor('#333333'))

    # severity colors
    sev_colors = {
        'CRITICAL': colors.HexColor('#b91c1c'),
        'HIGH': colors.HexColor('#c2410c'),
        'MEDIUM': colors.HexColor('#a16207'),
        'LOW': colors.HexColor('#15803d'),
    }

    def sev_para(sev):
        c = sev_colors.get(sev, colors.gray)
        return Paragraph(f'<font color="#{c.hexval()[2:]}"><b>{sev}</b></font>', body_style)

    today = datetime.date.today().strftime('%B %d, %Y')
    story = []

    # ── COVER PAGE ──
    outcome_text = 'DEFENDED' if defended else 'BREACHED'
    if result:
        cur = result['modes']['current_security']
        headline = f"Breach likelihood: <b>{cur['nist']['level']}</b> ({cur['breach_rate']}%, NIST SP 800-30)"
    elif verdict:
        headline = f"Latest drill: <b>{outcome_text}</b> &mdash; {verdict['reason']}"
    else:
        headline = "No drill or assessment has been run yet"
    meta = (f"<b>Target network:</b> {scenario.name}<br/>"
            f"<b>Scope:</b> {scenario.num_hosts} hosts, {len(edges_data)} network links<br/>"
            f"<b>Assessment date:</b> {today}<br/>"
            f"<b>Method:</b> simulated Red vs Blue drills ({model_type}), MITRE ATT&amp;CK, NIST SP 800-30<br/>"
            f"<b>Classification:</b> CONFIDENTIAL")
    cover = Table([[Paragraph("CyberDrill", title_style)],
                   [Paragraph("Security Assessment Report", sub_style)],
                   [Paragraph(headline, ParagraphStyle('headline', parent=sub_style, fontSize=12,
                                                       textColor=colors.white, spaceAfter=14))],
                   [Paragraph(meta, cover_meta)]],
                  colWidths=[17*cm])
    cover.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), PANEL),
        ('LINEBEFORE', (0, 0), (0, -1), 5, GREEN),
        ('LEFTPADDING', (0, 0), (-1, -1), 22),
        ('TOPPADDING', (0, 0), (0, 0), 26),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 24),
    ]))
    story.append(Spacer(1, 1.5*cm))
    story.append(cover)
    story.append(PageBreak())

    # ── 1. EXECUTIVE SUMMARY ──
    story.append(Paragraph("1. Executive Summary", h2_style))
    story.append(HRFlowable(width="100%", thickness=1.2, color=GREEN))
    story.append(Spacer(1, 0.2*cm))

    all_cves = []
    for h_name, h_info in hosts_data.items():
        for cve in h_info.get('vulnerabilities', []):
            all_cves.append({'cve': cve, 'host': h_name, 'severity': CVE_SEV.get(cve, 'MEDIUM')})

    crit_count = sum(1 for c in all_cves if c['severity'] == 'CRITICAL')
    high_count = sum(1 for c in all_cves if c['severity'] == 'HIGH')

    story.append(Paragraph(
        f"This report documents a simulation-based security assessment of the <b>{scenario.name}</b> network "
        f"({scenario.num_hosts} hosts, {len(edges_data)} connections). A digital copy of the network was attacked "
        f"by a trained Red agent and defended by a trained Blue agent ({model_type}), without touching the real systems.",
        body_style
    ))
    if result:
        cur, ai = result['modes']['current_security'], result['modes']['ai_defence']
        story.append(Paragraph(
            f"<b>Assessed likelihood of a breach: {cur['nist']['level']} ({cur['breach_rate']}%) with current security; "
            f"{ai['nist']['level']} ({ai['breach_rate']}%) with AI defence</b> (NIST SP 800-30 Table G-4, "
            f"{result['drills_per_mode']} drills per mode).",
            body_style
        ))

    if sim:
        story.append(Paragraph(
            f"The simulation ran for <b>{sim.total_steps} steps</b>. "
            f"Outcome: <b>{outcome_text}</b>. "
            f"(Training rewards, used only to train the agents: Red {sim.total_red_reward:.1f}, "
            f"Blue {sim.total_blue_reward:.1f}.)",
            body_style
        ))
        if verdict:
            story.append(Paragraph(
                f"The outcome is decided by what happened to the network, not by the training rewards: "
                f"a drill counts as BREACHED if data was exfiltrated or more than 20% of hosts "
                f"are compromised at the end. Final state: <b>{verdict['hosts_compromised']}/"
                f"{verdict['hosts_total']}</b> hosts compromised, <b>{verdict['hosts_exfiltrated']}</b> "
                f"host(s) exfiltrated.",
                body_style
            ))

    exec_data = [
        ['Metric', 'Value'],
        ['Hosts Assessed', str(scenario.num_hosts)],
        ['Network Connections', str(len(edges_data))],
        ['Total Vulnerabilities', str(len(all_cves))],
        ['Critical CVEs', str(crit_count)],
        ['High CVEs', str(high_count)],
        ['Simulation Steps', str(sim.total_steps) if sim else 'N/A'],
        ['Drill Outcome', outcome_text],
    ]
    if result:
        exec_data.insert(1, ['Breach likelihood (current security)', f"{cur['nist']['level']} ({cur['breach_rate']}%)"])
        exec_data.insert(2, ['Breach likelihood (with AI defence)', f"{ai['nist']['level']} ({ai['breach_rate']}%)"])
    exec_table = Table(exec_data, colWidths=[8*cm, 7*cm])
    exec_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), GREEN_SOFT),
        ('TEXTCOLOR', (0, 0), (-1, 0), GREEN_DARK), ('LINEBELOW', (0, 0), (-1, 0), 1.2, GREEN),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9fafb'), colors.white]),
        ('LINEBELOW', (0, 1), (-1, -1), 0.4, LINE),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(exec_table)

    # posture improvement
    if fw:
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph("AI Defense Impact", h3_style))
        story.append(Paragraph(
            f"The trained Blue agent applied <b>{fw['total_firewall_rules']} firewall rules</b>, "
            f"blocked <b>{fw['lateral_moves_blocked']} lateral movement attempts</b>, and "
            f"cut <b>{len(fw['recommended_rules'])} unique network pathways</b> that Red was using for propagation.",
            body_style
        ))

    # ── 2-4. SECURITY ASSESSMENT, PLAYBOOK, WHAT-IF ──
    styles_ = {'h2': h2_style, 'h3': h3_style, 'body': body_style, 'small': small_style}
    _assessment_sections(story, result, styles_)

    # ── 5. HOST RISK ASSESSMENT ──
    story.append(PageBreak())
    story.append(Paragraph("5. Host Risk Assessment", h2_style))
    story.append(HRFlowable(width="100%", thickness=1.2, color=GREEN))
    story.append(Spacer(1, 0.2*cm))

    host_rows = [['Host', 'OS', 'Services', 'CVEs', 'Sensitivity', 'Risk']]
    for h_name, h_info in hosts_data.items():
        score = _host_risk(h_info)
        label = _risk_label(score)
        sc = sev_colors.get(label, colors.gray)
        host_rows.append([
            Paragraph(f'<b>{h_name}</b>', body_style),
            Paragraph(h_info.get('os', 'Unknown'), small_style),
            Paragraph(', '.join(h_info.get('services', [])) or 'None', small_style),
            str(len(h_info.get('vulnerabilities', []))),
            h_info.get('sensitivity', 'low'),
            Paragraph(f'<font color="#{sc.hexval()[2:]}"><b>{label} ({score}%)</b></font>', body_style),
        ])

    h_table = Table(host_rows, colWidths=[3.5*cm, 2.5*cm, 3.5*cm, 1.2*cm, 2*cm, 3.3*cm])
    h_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), GREEN_SOFT),
        ('TEXTCOLOR', (0, 0), (-1, 0), GREEN_DARK), ('LINEBELOW', (0, 0), (-1, 0), 1.2, GREEN),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9fafb'), colors.white]),
        ('LINEBELOW', (0, 1), (-1, -1), 0.4, LINE),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(h_table)

    # ── 3. CVE INVENTORY ──
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("6. Vulnerability Inventory", h2_style))
    story.append(HRFlowable(width="100%", thickness=1.2, color=GREEN))
    story.append(Spacer(1, 0.2*cm))

    # sort by severity
    sev_order = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}
    sorted_cves = sorted(all_cves, key=lambda x: sev_order.get(x['severity'], 3))

    cve_rows = [['CVE ID', 'Severity', 'Affected Host', 'Recommended Action']]
    for c in sorted_cves:
        sc = sev_colors.get(c['severity'], colors.gray)
        cve_rows.append([
            Paragraph(f'<font name="Courier" size="8">{c["cve"]}</font>', body_style),
            Paragraph(f'<font color="#{sc.hexval()[2:]}"><b>{c["severity"]}</b></font>', body_style),
            c['host'],
            Paragraph('Apply vendor security patch and update to latest version', small_style),
        ])

    cve_table = Table(cve_rows, colWidths=[4*cm, 2.2*cm, 3*cm, 6.8*cm])
    cve_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), GREEN_SOFT),
        ('TEXTCOLOR', (0, 0), (-1, 0), GREEN_DARK), ('LINEBELOW', (0, 0), (-1, 0), 1.2, GREEN),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9fafb'), colors.white]),
        ('LINEBELOW', (0, 1), (-1, -1), 0.4, LINE),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(cve_table)

    # ── 4. SIMULATION RESULTS ──
    if sim and steps:
        story.append(PageBreak())
        story.append(Paragraph("7. Latest Drill Results", h2_style))
        story.append(HRFlowable(width="100%", thickness=1.2, color=GREEN))
        story.append(Spacer(1, 0.2*cm))

        story.append(Paragraph(
            f"The adversarial drill ran for <b>{sim.total_steps} steps</b> using the <b>{model_type}</b> algorithm. "
            f"Training rewards (not a security score): Red {sim.total_red_reward:.2f}, "
            f"Blue {sim.total_blue_reward:.2f}.",
            body_style
        ))

        # step log (first 20 steps to keep PDF short)
        step_rows = [['Step', 'Red Action', 'Target', 'R. Train.', 'Blue Action', 'Target', 'B. Train.']]
        for s in steps[:20]:
            ra = s.red_action.get('action', 'idle') if s.red_action else 'idle'
            rt = s.red_action.get('target', '-') if s.red_action else '-'
            ba = s.blue_action.get('action', 'idle') if s.blue_action else 'idle'
            bt = s.blue_action.get('target', '-') if s.blue_action else '-'
            step_rows.append([
                str(s.step_number),
                Paragraph(f'<font color="#b91c1c">{ra}</font>', small_style),
                Paragraph(str(rt or '-'), small_style),
                f'{s.red_reward:.1f}',
                Paragraph(f'<font color="#1d4ed8">{ba}</font>', small_style),
                Paragraph(str(bt or '-'), small_style),
                f'{s.blue_reward:.1f}',
            ])

        step_table = Table(step_rows, colWidths=[1*cm, 2.5*cm, 2.8*cm, 1.8*cm, 2.5*cm, 2.8*cm, 1.8*cm])
        step_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), GREEN_SOFT),
            ('TEXTCOLOR', (0, 0), (-1, 0), GREEN_DARK), ('LINEBELOW', (0, 0), (-1, 0), 1.2, GREEN),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9fafb'), colors.white]),
            ('LINEBELOW', (0, 1), (-1, -1), 0.4, LINE),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(step_table)

        if len(steps) > 20:
            story.append(Paragraph(f'... and {len(steps) - 20} more steps (truncated for brevity)', small_style))

    # ── 5. RED AGENT ATTACK PATH ──
    if sim:
        try:
            ap = get_attack_path(db, sim.id)
        except Exception:
            ap = None
        if ap and ap.get('entry_point'):
            story.append(PageBreak())
            story.append(Paragraph("8. Red Agent Attack Path", h2_style))
            story.append(HRFlowable(width="100%", thickness=1.2, color=GREEN))
            story.append(Spacer(1, 0.2*cm))
            story.append(Paragraph(
                "This section reconstructs the exact route the Red (attacker) agent took through the network: "
                "where it gained initial access, which hosts it pivoted through, and which hosts it ultimately "
                "exfiltrated data from. Use this to understand <b>how</b> a breach unfolded, not just <b>that</b> it occurred.",
                body_style
            ))
            story.append(Spacer(1, 0.2*cm))

            # Path summary
            path_str = ap.get('path_string', 'No path data')
            story.append(Paragraph(f"<b>Attack Route:</b> <font name='Courier'>{path_str}</font>", body_style))
            story.append(Spacer(1, 0.15*cm))

            summary_rows = [
                ['Entry Point', str(ap.get('entry_point') or '-')],
                ['Hosts Breached', str(len(ap.get('compromised_path', [])))],
                ['Lateral Movements', str(len(ap.get('lateral_movements', [])))],
                ['Hosts Exfiltrated', str(len(ap.get('exfiltrated_hosts', [])))],
                ['Total Red Actions', str(ap.get('total_actions', 0))],
                ['Successful Hits', str(ap.get('successful_actions', 0))],
            ]
            sum_table = Table(summary_rows, colWidths=[6*cm, 9*cm])
            sum_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BACKGROUND', (0, 0), (0, -1), GREEN_SOFT),
                ('LINEBELOW', (0, 1), (-1, -1), 0.4, LINE),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
            ]))
            story.append(sum_table)

            # Compromised host chain
            comp_path = ap.get('compromised_path', [])
            if comp_path:
                story.append(Spacer(1, 0.4*cm))
                story.append(Paragraph("Compromised Host Chain", h3_style))
                chain_rows = [['Order', 'Host', 'Method of Compromise']]
                for i, node in enumerate(comp_path, 1):
                    chain_rows.append([
                        str(i),
                        Paragraph(f'<b>{node.get("host", "-")}</b>', body_style),
                        Paragraph(node.get('method', '-').replace('_', ' '), small_style),
                    ])
                chain_table = Table(chain_rows, colWidths=[1.5*cm, 5*cm, 8.5*cm])
                chain_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), GREEN_SOFT),
                    ('TEXTCOLOR', (0, 0), (-1, 0), GREEN_DARK), ('LINEBELOW', (0, 0), (-1, 0), 1.2, GREEN),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9fafb'), colors.white]),
                    ('LINEBELOW', (0, 1), (-1, -1), 0.4, LINE),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ]))
                story.append(chain_table)

            # Lateral movements
            lats = ap.get('lateral_movements', [])
            if lats:
                story.append(Spacer(1, 0.4*cm))
                story.append(Paragraph("Lateral Movement Log", h3_style))
                lat_rows = [['Step', 'From', 'To']]
                for lat in lats:
                    lat_rows.append([
                        str(lat.get('step', '-')),
                        Paragraph(str(lat.get('from') or '-'), small_style),
                        Paragraph(str(lat.get('to') or '-'), small_style),
                    ])
                lat_table = Table(lat_rows, colWidths=[1.5*cm, 6.5*cm, 7*cm])
                lat_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), GREEN_SOFT),
                    ('TEXTCOLOR', (0, 0), (-1, 0), GREEN_DARK), ('LINEBELOW', (0, 0), (-1, 0), 1.2, GREEN),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9fafb'), colors.white]),
                    ('LINEBELOW', (0, 1), (-1, -1), 0.4, LINE),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                ]))
                story.append(lat_table)

            # Exfiltrated hosts
            exfil = ap.get('exfiltrated_hosts', [])
            if exfil:
                story.append(Spacer(1, 0.4*cm))
                story.append(Paragraph("Exfiltrated Hosts (Data Loss)", h3_style))
                for host in exfil:
                    story.append(Paragraph(
                        f"&bull; <b><font color='#b91c1c'>{host}</font></b> &mdash; sensitive data was successfully exfiltrated by the Red agent.",
                        body_style
                    ))

    # ── 6. FIREWALL ANALYSIS ──
    if fw and fw['recommended_rules']:
        story.append(PageBreak())
        story.append(Paragraph("9. Simulated Firewall Engine — Recommended Rules", h2_style))
        story.append(HRFlowable(width="100%", thickness=1.2, color=GREEN))
        story.append(Spacer(1, 0.2*cm))
        story.append(Paragraph(fw.get('summary', ''), body_style))
        story.append(Spacer(1, 0.2*cm))

        fw_rows = [['#', 'Firewall Rule (Block Connection)', 'Action']]
        for i, rule in enumerate(fw['recommended_rules'], 1):
            fw_rows.append([
                str(i),
                Paragraph(f'<font name="Courier">{rule}</font>', body_style),
                'DENY all traffic',
            ])

        fw_table = Table(fw_rows, colWidths=[1*cm, 10*cm, 5*cm])
        fw_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), GREEN_SOFT),
            ('TEXTCOLOR', (0, 0), (-1, 0), GREEN_DARK), ('LINEBELOW', (0, 0), (-1, 0), 1.2, GREEN),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9fafb'), colors.white]),
            ('LINEBELOW', (0, 1), (-1, -1), 0.4, LINE),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(fw_table)

    # ── 7. MITRE + RECOMMENDATIONS ──
    story.append(PageBreak())
    story.append(Paragraph("10. MITRE ATT&amp;CK Mapping &amp; Recommendations", h2_style))
    story.append(HRFlowable(width="100%", thickness=1.2, color=GREEN))
    story.append(Spacer(1, 0.2*cm))

    mitre_rows = [['Red Action', 'MITRE Tactic', 'Blue Counter', 'Recommended Fix']]
    mitre_data = [
        ('Scan', 'Discovery (TA0007)', 'Detect', 'Deploy IDS/IPS, enable network monitoring and anomaly detection'),
        ('Exploit', 'Initial Access (TA0001)', 'Patch', 'Apply security patches, update vulnerable software, use WAF'),
        ('Escalate', 'Privilege Escalation (TA0004)', 'Harden', 'Enforce least privilege, disable unnecessary services'),
        ('Lateral Move', 'Lateral Movement (TA0008)', 'Isolate/Firewall', 'Segment network, implement micro-segmentation, restrict RDP/SSH'),
        ('Exfiltrate', 'Exfiltration (TA0010)', 'Restore', 'Enable DLP, encrypt data, maintain verified backups'),
    ]
    for red, tactic, blue, fix in mitre_data:
        mitre_rows.append([
            Paragraph(f'<font color="#b91c1c"><b>{red}</b></font>', body_style),
            Paragraph(tactic, small_style),
            Paragraph(f'<font color="#1d4ed8"><b>{blue}</b></font>', body_style),
            Paragraph(fix, small_style),
        ])

    m_table = Table(mitre_rows, colWidths=[2.5*cm, 4*cm, 2.5*cm, 7*cm])
    m_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), GREEN_SOFT),
        ('TEXTCOLOR', (0, 0), (-1, 0), GREEN_DARK), ('LINEBELOW', (0, 0), (-1, 0), 1.2, GREEN),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9fafb'), colors.white]),
        ('LINEBELOW', (0, 1), (-1, -1), 0.4, LINE),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(m_table)

    # remediation plan
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("Remediation Priorities", h3_style))

    critical_hosts = [n for n, h in hosts_data.items() if _host_risk(h) >= 70]
    story.append(Paragraph("<b>Immediate (0-24 hrs):</b>", body_style))
    if critical_hosts:
        for h in critical_hosts:
            story.append(Paragraph(f"&bull; Isolate and emergency-patch <b>{h}</b> (risk score {_host_risk(hosts_data[h])}%)", body_style))
    else:
        story.append(Paragraph("&bull; No hosts require emergency isolation", body_style))
    if crit_count:
        story.append(Paragraph(f"&bull; Patch all {crit_count} CRITICAL CVEs listed in Section 6", body_style))

    story.append(Paragraph("<b>Short-term (1-7 days):</b>", body_style))
    story.append(Paragraph("&bull; Patch all HIGH severity vulnerabilities", body_style))
    story.append(Paragraph("&bull; Apply the what-if fixes from Section 4, then the firewall rules in Section 9", body_style))
    story.append(Paragraph("&bull; Harden exposed services (SSH, RDP, SMB, HTTP)", body_style))

    story.append(Paragraph("<b>Long-term (1-4 weeks):</b>", body_style))
    story.append(Paragraph("&bull; Implement network micro-segmentation", body_style))
    story.append(Paragraph("&bull; Deploy EDR on all hosts", body_style))
    story.append(Paragraph("&bull; Schedule regular CyberDrill assessments to track improvement", body_style))

    # footer note
    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width="100%", thickness=1.2, color=GREEN))
    story.append(Paragraph(
        f"CONFIDENTIAL — CyberDrill | "
        f"Generated: {today} | "
        f"Algorithm: {model_type} | "
        f"For authorized personnel only.",
        ParagraphStyle('footer', fontSize=7, fontName='Helvetica',
                        textColor=colors.HexColor('#6b7280'), alignment=TA_CENTER, spaceBefore=4)
    ))

    doc.build(story)
    buf.seek(0)
    return buf


def _level(level):
    fg, bg = LEVEL_COLORS.get(level, LEVEL_COLORS['Moderate'])
    return f'<font color="{fg}"><b>{level}</b></font>'


def _mode_cell(title, m, st):
    return [Paragraph(f'<font color="#6b7280" size="7.5">{title.upper()}</font>', st['small']),
            Paragraph(f'<font size="13">{_level(m["nist"]["level"])}</font>', st['body']),
            Paragraph(f'Breach rate <b>{m["breach_rate"]}%</b> (95% range {m["ci95"]["low"]}&ndash;{m["ci95"]["high"]}%)', st['body']),
            Paragraph(f'{m["breaches"]}/{m["drills"]} drills breached &middot; avg {m["mean_hosts_compromised"]} hosts compromised, '
                      f'data stolen from {m["mean_hosts_exfiltrated"]} hosts on average', st['small'])]


def _two_cards(left, right):
    t = Table([[left, right]], colWidths=[8.4*cm, 8.4*cm])
    t.setStyle(TableStyle([
        ('BOX', (0, 0), (0, 0), 0.6, LINE), ('BOX', (1, 0), (1, 0), 0.6, LINE),
        ('LINEABOVE', (0, 0), (-1, 0), 2.5, GREEN),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8), ('TOPPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t


def _note(text, st, color=GREEN, bg=GREEN_SOFT):
    t = Table([[Paragraph(text, st['body'])]], colWidths=[17*cm])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), bg), ('LINEBEFORE', (0, 0), (0, -1), 3, color),
                           ('LEFTPADDING', (0, 0), (-1, -1), 8)]))
    return t


def _assessment_sections(story, result, st):
    h2, h3, body, small = st['h2'], st['h3'], st['body'], st['small']

    def heading(text):
        story.append(PageBreak())
        story.append(Paragraph(text, h2))
        story.append(HRFlowable(width="100%", thickness=1.2, color=GREEN))
        story.append(Spacer(1, 0.2*cm))

    if not result:
        heading("2. Security Assessment")
        story.append(Paragraph("No security assessment has been run for this network yet. Run one from the Security "
                               "Report page; sections 2-4 (assessment, AI defence playbook and what-if hardening) "
                               "will then appear here.", body))
        return

    cur, ai, n = result['modes']['current_security'], result['modes']['ai_defence'], result['drills_per_mode']
    heading("2. Security Assessment")
    story.append(Paragraph(
        f"The trained attacker ran <b>{n} drills of {result['steps']} steps</b> against a digital copy of the network, "
        f"first with no active defence and then with the trained AI defender. A drill counts as breached when "
        f"{result['breach_criterion']}. The breach rate is rated on the likelihood scale of <b>{result['citation']}</b>.", body))
    story.append(_two_cards(_mode_cell('Current security (no active defence)', cur, st),
                            _mode_cell('With AI defence', ai, st)))
    if 'breach_rate_reduction' in result:
        story.append(Spacer(1, 0.2*cm))
        story.append(Paragraph(f"The AI defender lowered the breach rate by <b>{result['breach_rate_reduction']} percentage points</b>.", body))

    scale = [['Likelihood level', 'Breach rate', 'Meaning (NIST SP 800-30)']]
    for level, rng, meaning in (('Very High', '96-100%', 'almost certain to have adverse impacts'),
                                ('High', '80-95%', 'highly likely to have adverse impacts'),
                                ('Moderate', '21-79%', 'somewhat likely to have adverse impacts'),
                                ('Low', '5-20%', 'unlikely to have adverse impacts'),
                                ('Very Low', '0-4%', 'highly unlikely to have adverse impacts')):
        scale.append([Paragraph(_level(level), body), rng, meaning])
    t = Table(scale, colWidths=[3.5*cm, 3*cm, 10.5*cm])
    t.setStyle(_table_style())
    story.append(Spacer(1, 0.2*cm))
    story.append(t)

    story.append(Paragraph("2.1 Most attacked hosts (no active defence)", h3))
    rows = [['Host', 'Compromised', 'Data stolen']] + [
        [h['host'], f"{h['compromised_drills']}/{n} drills", f"{h['exfiltrated_drills']}/{n} drills"] for h in cur['top_hosts']]
    t = Table(rows, colWidths=[5*cm, 6*cm, 6*cm])
    t.setStyle(_table_style())
    story.append(t)
    story.append(Paragraph("2.2 CVEs the attacker used", h3))
    rows = [['CVE', 'Host', 'Used in']] + [
        [Paragraph(f'<font name="Courier">{c["cve"]}</font>', body), ', '.join(c['hosts']), f"{c['drills']}/{n} drills"]
        for c in cur['top_cves']]
    t = Table(rows, colWidths=[5*cm, 6*cm, 6*cm])
    t.setStyle(_table_style())
    story.append(t)

    pb = result.get('playbook')
    heading("3. AI Defence Playbook")
    if pb:
        m = pb['drills']
        story.append(Paragraph(f"What the trained defender did across {m} drills, and how much it changed the outcome "
                               "compared with no active defence.", body))
        story.append(Paragraph("3.1 Do first", h3))
        for k, i in enumerate(pb['immediate'], 1):
            story.append(Paragraph(f"{k}. {i['advice']} <font color='#6b7280'>({i['drills']}/{m} drills, usually step {i['typical_step']})</font>", body))
        story.append(Paragraph("3.2 Hardening priorities", h3))
        rows = [['Host', 'Action', 'Drills', 'Compromised\n(before > after)', 'Data stolen\n(before > after)']]
        for h in pb['hardening']:
            acts = ', '.join(ACTION_NAMES.get(x, x) for x in h['actions'])
            if h.get('compromised_before', 0) == 0 and h.get('stolen_before', 0) == 0:
                rows.append([h['host'], acts, f"{h['drills']}/{m}", Paragraph('<font color="#6b7280">not attacked (no measured effect)</font>', small), ''])
            else:
                rows.append([h['host'], acts, f"{h['drills']}/{m}",
                             f"{h.get('compromised_before', '-')} > {h['compromised_after']}",
                             f"{h.get('stolen_before', '-')} > {h['stolen_after']}"])
        t = Table(rows, colWidths=[2.6*cm, 3.4*cm, 2*cm, 4.5*cm, 4.5*cm])
        t.setStyle(_table_style())
        story.append(t)
        story.append(Paragraph("3.3 Incident response", h3))
        story.append(Paragraph(pb['incident_response']['note'], body))
        if pb['gaps']:
            story.append(Paragraph("3.4 Remaining gaps (still breached with AI defence)", h3))
            rows = [['Host', 'Compromised', 'Data stolen', 'Recommended fix']] + [
                [g['host'], f"{g['compromised']}/{m}", f"{g['stolen']}/{m}", Paragraph(g['advice'], small)] for g in pb['gaps']]
            t = Table(rows, colWidths=[2.6*cm, 2.8*cm, 2.8*cm, 8.8*cm])
            t.setStyle(_table_style())
            story.append(t)

    wi = result.get('what_if')
    heading("4. What-if Hardening")
    if wi:
        story.append(Paragraph(f"The top {len(wi['fixes'])} fixes below were applied to a copy of the network, which was "
                               "then attacked again with no active defence.", body))
        rows = [['#', 'Fix', 'Why']] + [
            [str(k), Paragraph(f"<b>{f['advice']}</b>", small), Paragraph(f['reason'], small)] for k, f in enumerate(wi['fixes'], 1)]
        t = Table(rows, colWidths=[0.8*cm, 7.6*cm, 8.6*cm])
        t.setStyle(_table_style())
        story.append(t)
        story.append(Spacer(1, 0.2*cm))
        if wi.get('after'):
            story.append(_two_cards(_mode_cell('Before (current security)', wi['before'], st),
                                    _mode_cell('After the fixes', wi['after'], st)))
            story.append(Spacer(1, 0.2*cm))
        if wi.get('remaining_entry_points'):
            story.append(_note(wi['entry_points_note'], st, colors.HexColor('#d97706'), colors.HexColor('#fffbeb')))
            story.append(Spacer(1, 0.15*cm))
        story.append(_note(wi['caveat'], st))
