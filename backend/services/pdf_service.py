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

    # figure out model type from simulation or guess
    model_type = "MaskablePPO"
    if scenario.num_hosts <= 8:
        model_type = "PPO"

    # work out winner
    blue_won = False
    if sim:
        blue_won = (sim.total_blue_reward or 0) >= (sim.total_red_reward or 0)

    # ── build PDF ──
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('title', fontSize=22, fontName='Helvetica-Bold', leading=28,
                                  textColor=colors.HexColor('#111111'), spaceAfter=6, alignment=TA_CENTER)
    sub_style = ParagraphStyle('sub', fontSize=11, fontName='Helvetica',
                                textColor=colors.HexColor('#555555'), spaceAfter=4, alignment=TA_CENTER)
    h2_style = ParagraphStyle('h2', fontSize=14, fontName='Helvetica-Bold',
                               textColor=colors.HexColor('#111111'), spaceBefore=16, spaceAfter=6,
                               borderPadding=(0, 0, 4, 0))
    h3_style = ParagraphStyle('h3', fontSize=11, fontName='Helvetica-Bold',
                               textColor=colors.HexColor('#333333'), spaceBefore=10, spaceAfter=4)
    body_style = ParagraphStyle('body', fontSize=9, fontName='Helvetica',
                                 textColor=colors.HexColor('#222222'), spaceAfter=4, leading=14)
    small_style = ParagraphStyle('small', fontSize=8, fontName='Helvetica',
                                  textColor=colors.HexColor('#555555'), spaceAfter=2)
    mono_style = ParagraphStyle('mono', fontSize=8, fontName='Courier',
                                 textColor=colors.HexColor('#333333'))

    # severity colors
    sev_colors = {
        'CRITICAL': colors.HexColor('#c0392b'),
        'HIGH': colors.HexColor('#e67e22'),
        'MEDIUM': colors.HexColor('#2980b9'),
        'LOW': colors.HexColor('#27ae60'),
    }

    def sev_para(sev):
        c = sev_colors.get(sev, colors.gray)
        return Paragraph(f'<font color="#{c.hexval()[2:]}"><b>{sev}</b></font>', body_style)

    today = datetime.date.today().strftime('%B %d, %Y')
    story = []

    # ── COVER PAGE ──
    story.append(Spacer(1, 2*cm))
    story.append(Paragraph("AI-POWERED CYBER DRILL", title_style))
    story.append(Paragraph("Security Assessment Report &mdash; Red vs Blue Adversarial Reinforcement Learning", sub_style))
    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.black))
    story.append(Spacer(1, 0.5*cm))

    outcome_color = colors.HexColor('#27ae60') if blue_won else colors.HexColor('#c0392b')
    outcome_text = 'DEFENDED' if blue_won else 'BREACHED'
    outcome_style = ParagraphStyle('outcome', fontSize=28, fontName='Helvetica-Bold', leading=34,
                                    textColor=outcome_color, alignment=TA_CENTER, spaceAfter=12)
    story.append(Paragraph(f'[ {outcome_text} ]', outcome_style))

    cover_data = [
        ['Target Network:', scenario.name],
        ['Total Hosts:', str(scenario.num_hosts)],
        ['Network Links:', str(len(edges_data))],
        ['Assessment Date:', today],
        ['AI Algorithm:', model_type],
        ['Classification:', 'CONFIDENTIAL'],
    ]
    cover_table = Table(cover_data, colWidths=[5*cm, 10*cm])
    cover_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, -1), (-1, -1), 0.5, colors.lightgrey),
    ]))
    story.append(cover_table)
    story.append(PageBreak())

    # ── 1. EXECUTIVE SUMMARY ──
    story.append(Paragraph("1. Executive Summary", h2_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
    story.append(Spacer(1, 0.2*cm))

    all_cves = []
    for h_name, h_info in hosts_data.items():
        for cve in h_info.get('vulnerabilities', []):
            all_cves.append({'cve': cve, 'host': h_name, 'severity': CVE_SEV.get(cve, 'MEDIUM')})

    crit_count = sum(1 for c in all_cves if c['severity'] == 'CRITICAL')
    high_count = sum(1 for c in all_cves if c['severity'] == 'HIGH')

    story.append(Paragraph(
        f"This report documents the automated security assessment of the <b>{scenario.name}</b> network "
        f"({scenario.num_hosts} hosts, {len(edges_data)} connections). The AI-powered drill used adversarial "
        f"reinforcement learning ({model_type}) — a Red agent (attacker) competing against a Blue agent (defender) "
        f"— to discover attack paths and measure network resilience.",
        body_style
    ))

    if sim:
        story.append(Paragraph(
            f"The simulation ran for <b>{sim.total_steps} steps</b>. "
            f"Red agent score: <b>{sim.total_red_reward:.1f}</b> | "
            f"Blue agent score: <b>{sim.total_blue_reward:.1f}</b>. "
            f"Outcome: <b>{outcome_text}</b>.",
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
    exec_table = Table(exec_data, colWidths=[8*cm, 7*cm])
    exec_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9f9f9'), colors.white]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
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

    # ── 2. HOST RISK ASSESSMENT ──
    story.append(PageBreak())
    story.append(Paragraph("2. Host Risk Assessment", h2_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
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
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9f9f9'), colors.white]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(h_table)

    # ── 3. CVE INVENTORY ──
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("3. Vulnerability Inventory", h2_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
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
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9f9f9'), colors.white]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(cve_table)

    # ── 4. SIMULATION RESULTS ──
    if sim and steps:
        story.append(PageBreak())
        story.append(Paragraph("4. Simulation Results", h2_style))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
        story.append(Spacer(1, 0.2*cm))

        story.append(Paragraph(
            f"The adversarial drill ran for <b>{sim.total_steps} steps</b> using the <b>{model_type}</b> algorithm. "
            f"Red agent (attacker) accumulated <b>{sim.total_red_reward:.2f}</b> reward. "
            f"Blue agent (defender) accumulated <b>{sim.total_blue_reward:.2f}</b> reward.",
            body_style
        ))

        # step log (first 20 steps to keep PDF short)
        step_rows = [['Step', 'Red Action', 'Target', 'R. Reward', 'Blue Action', 'Target', 'B. Reward']]
        for s in steps[:20]:
            ra = s.red_action.get('action', 'idle') if s.red_action else 'idle'
            rt = s.red_action.get('target', '-') if s.red_action else '-'
            ba = s.blue_action.get('action', 'idle') if s.blue_action else 'idle'
            bt = s.blue_action.get('target', '-') if s.blue_action else '-'
            step_rows.append([
                str(s.step_number),
                Paragraph(f'<font color="#c0392b">{ra}</font>', small_style),
                Paragraph(str(rt or '-'), small_style),
                f'{s.red_reward:.1f}',
                Paragraph(f'<font color="#2980b9">{ba}</font>', small_style),
                Paragraph(str(bt or '-'), small_style),
                f'{s.blue_reward:.1f}',
            ])

        step_table = Table(step_rows, colWidths=[1*cm, 2.5*cm, 2.8*cm, 1.8*cm, 2.5*cm, 2.8*cm, 1.8*cm])
        step_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9f9f9'), colors.white]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
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
            story.append(Paragraph("5. Red Agent Attack Path", h2_style))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
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
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#fbe9e7')),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
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
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#fef6f5'), colors.white]),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
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
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9f9f9'), colors.white]),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
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
                        f"&bull; <b><font color='#c0392b'>{host}</font></b> &mdash; sensitive data was successfully exfiltrated by the Red agent.",
                        body_style
                    ))

    # ── 6. FIREWALL ANALYSIS ──
    if fw and fw['recommended_rules']:
        story.append(PageBreak())
        story.append(Paragraph("6. Simulated Firewall Engine — Recommended Rules", h2_style))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
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
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#eaf4fb'), colors.white]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(fw_table)

    # ── 7. MITRE + RECOMMENDATIONS ──
    story.append(PageBreak())
    story.append(Paragraph("7. MITRE ATT&amp;CK Mapping &amp; Recommendations", h2_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
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
            Paragraph(f'<font color="#c0392b"><b>{red}</b></font>', body_style),
            Paragraph(tactic, small_style),
            Paragraph(f'<font color="#2980b9"><b>{blue}</b></font>', body_style),
            Paragraph(fix, small_style),
        ])

    m_table = Table(mitre_rows, colWidths=[2.5*cm, 4*cm, 2.5*cm, 7*cm])
    m_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9f9f9'), colors.white]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
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
        story.append(Paragraph(f"&bull; Patch all {crit_count} CRITICAL CVEs listed in Section 3", body_style))

    story.append(Paragraph("<b>Short-term (1-7 days):</b>", body_style))
    story.append(Paragraph("&bull; Patch all HIGH severity vulnerabilities", body_style))
    story.append(Paragraph("&bull; Apply AI-recommended firewall rules from Section 5", body_style))
    story.append(Paragraph("&bull; Harden exposed services (SSH, RDP, SMB, HTTP)", body_style))

    story.append(Paragraph("<b>Long-term (1-4 weeks):</b>", body_style))
    story.append(Paragraph("&bull; Implement network micro-segmentation", body_style))
    story.append(Paragraph("&bull; Deploy EDR on all hosts", body_style))
    story.append(Paragraph("&bull; Schedule regular CyberDrill assessments to track improvement", body_style))

    # footer note
    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))
    story.append(Paragraph(
        f"CONFIDENTIAL — AI-Powered Cyber Drill System | "
        f"Generated: {today} | "
        f"Algorithm: {model_type} | "
        f"For authorized personnel only.",
        ParagraphStyle('footer', fontSize=7, fontName='Helvetica',
                        textColor=colors.grey, alignment=TA_CENTER, spaceBefore=4)
    ))

    doc.build(story)
    buf.seek(0)
    return buf
