

import os
import sys
import yaml

# ── CVE pools by OS / service type ─────────────────────────────────────────

CVE_LINUX_WEB = [
    "CVE-2021-44228",   # Log4Shell
    "CVE-2023-44487",   # HTTP/2 Rapid Reset
    "CVE-2022-22965",   # Spring4Shell
    "CVE-2021-41773",   # Apache path traversal
    "CVE-2022-26134",   # Confluence OGNL injection
]

CVE_LINUX_SSH = [
    "CVE-2022-0847",    # DirtyPipe
    "CVE-2021-3156",    # sudo heap overflow
    "CVE-2021-4034",    # pkexec LPE
    "CVE-2016-5195",    # DirtyCow
    "CVE-2021-3493",    # Ubuntu OverlayFS LPE
    "CVE-2023-0386",    # OverlayFS fsetid
    "CVE-2022-2588",    # route4_change UAF
]

CVE_WINDOWS_SMB = [
    "CVE-2017-0144",    # EternalBlue
    "CVE-2020-0796",    # SMBGhost
    "CVE-2021-34527",   # PrintNightmare
    "CVE-2020-1472",    # ZeroLogon
    "CVE-2021-1675",    # PrintNightmare variant
]

CVE_WINDOWS_RDP = [
    "CVE-2019-0708",    # BlueKeep
    "CVE-2021-34535",   # RDP client RCE
    "CVE-2022-21990",   # RDP RCE
]

CVE_DB = [
    "CVE-2023-0386",    # OverlayFS
    "CVE-2022-2588",    # kernel UAF
    "CVE-2021-3493",    # LPE
    "CVE-2021-4034",    # pkexec
    "CVE-2020-1472",    # ZeroLogon (for MSSQL host)
    "CVE-2021-34527",   # PrintNightmare (Windows DB host)
]

CVE_MAIL = [
    "CVE-2021-26855",   # Exchange ProxyLogon
    "CVE-2021-26857",   # Exchange deserialization
    "CVE-2022-41040",   # Exchange ProxyNotShell
    "CVE-2022-41082",   # Exchange RCE
]

CVE_DC = [
    "CVE-2020-1472",    # ZeroLogon
    "CVE-2021-34527",   # PrintNightmare
    "CVE-2021-1675",    # PrintNightmare variant
    "CVE-2022-26923",   # AD cert services LPE
    "CVE-2021-42287",   # noPac
    "CVE-2021-42278",   # sAMAccountName spoofing
]


def pick(pool, n):
    """Pick n CVEs from pool, cycling if needed."""
    out = []
    for i in range(n):
        out.append(pool[i % len(pool)])
    return list(dict.fromkeys(out))  # deduplicate preserving order


def build_topology():
    hosts = {}

    # ── DMZ tier: H1-H10 (low sensitivity, internet-facing) ────────────────
    dmz_configs = [
        ("linux",   ["http", "https", "dns"],          CVE_LINUX_WEB,  2),
        ("linux",   ["http", "https", "smtp"],         CVE_LINUX_WEB + CVE_MAIL, 2),
        ("linux",   ["http", "https", "proxy"],        CVE_LINUX_WEB,  2),
        ("windows", ["http", "https", "rdp"],          CVE_WINDOWS_RDP + CVE_LINUX_WEB, 2),
        ("linux",   ["smtp", "imap", "https"],         CVE_MAIL,       2),
        ("linux",   ["dns", "http"],                   CVE_LINUX_WEB,  2),
        ("linux",   ["http", "https", "ftp"],          CVE_LINUX_WEB,  2),
        ("windows", ["http", "https", "smb"],          CVE_WINDOWS_SMB[:2] + CVE_LINUX_WEB[:2], 2),
        ("linux",   ["https", "ssh"],                  CVE_LINUX_SSH[:2] + CVE_LINUX_WEB[:2], 2),
        ("linux",   ["http", "https", "ntp"],          CVE_LINUX_WEB,  2),
    ]

    for i, (os_, svcs, cve_pool, n_cve) in enumerate(dmz_configs, start=1):
        hosts[f"H{i}"] = {
            "os": os_,
            "services": svcs,
            "vulnerabilities": pick(cve_pool, n_cve),
            "sensitivity": "low",
        }

    # ── Application/Internal tier: H11-H30 (medium sensitivity) ────────────
    app_configs = [
        ("linux",   ["http", "ssh", "docker"],         CVE_LINUX_SSH,  3),
        ("windows", ["smb", "rdp", "http"],            CVE_WINDOWS_SMB + CVE_WINDOWS_RDP, 3),
        ("linux",   ["http", "ssh", "memcached"],      CVE_LINUX_SSH + CVE_LINUX_WEB, 3),
        ("windows", ["smb", "mssql", "rdp"],           CVE_WINDOWS_SMB + CVE_WINDOWS_RDP, 3),
        ("linux",   ["ssh", "nfs", "http"],            CVE_LINUX_SSH,  3),
        ("windows", ["rdp", "smb", "winrm"],           CVE_WINDOWS_SMB + CVE_WINDOWS_RDP, 3),
        ("linux",   ["ssh", "http", "redis"],          CVE_LINUX_WEB + CVE_LINUX_SSH, 3),
        ("windows", ["smb", "rdp", "http"],            CVE_WINDOWS_SMB,  3),
        ("linux",   ["ssh", "docker", "http"],         CVE_LINUX_SSH + CVE_LINUX_WEB, 3),
        ("windows", ["rdp", "smb", "mssql"],           CVE_WINDOWS_SMB + CVE_WINDOWS_RDP, 3),
        ("linux",   ["ssh", "http", "tomcat"],         CVE_LINUX_WEB + CVE_LINUX_SSH, 3),
        ("windows", ["smb", "rdp", "winrm"],           CVE_WINDOWS_SMB,  3),
        ("linux",   ["ssh", "http", "elasticsearch"],  CVE_LINUX_WEB + CVE_LINUX_SSH, 3),
        ("windows", ["rdp", "smb", "http"],            CVE_WINDOWS_RDP + CVE_WINDOWS_SMB, 3),
        ("linux",   ["ssh", "kafka", "http"],          CVE_LINUX_SSH,  3),
        ("windows", ["smb", "rdp", "mssql"],           CVE_WINDOWS_SMB + CVE_WINDOWS_RDP, 3),
        ("linux",   ["ssh", "http", "nginx"],          CVE_LINUX_WEB + CVE_LINUX_SSH, 3),
        ("windows", ["rdp", "smb", "winrm"],           CVE_WINDOWS_SMB,  3),
        ("linux",   ["ssh", "http", "rabbitmq"],       CVE_LINUX_SSH + CVE_LINUX_WEB, 3),
        ("windows", ["smb", "rdp", "http"],            CVE_WINDOWS_SMB + CVE_WINDOWS_RDP, 3),
    ]

    for i, (os_, svcs, cve_pool, n_cve) in enumerate(app_configs, start=11):
        hosts[f"H{i}"] = {
            "os": os_,
            "services": svcs,
            "vulnerabilities": pick(cve_pool, n_cve),
            "sensitivity": "medium",
        }

    # ── Core/Database tier: H31-H50 (high sensitivity) ─────────────────────
    core_configs = [
        ("linux",   ["postgresql", "ssh"],             CVE_DB,   4),
        ("windows", ["mssql", "smb"],                  CVE_DB,   4),
        ("linux",   ["mongodb", "ssh"],                CVE_DB,   4),
        ("windows", ["mssql", "rdp", "smb"],           CVE_DB + CVE_WINDOWS_SMB, 4),
        ("linux",   ["mysql", "ssh"],                  CVE_DB,   4),
        ("windows", ["ldap", "smb", "rdp", "dns"],     CVE_DC,   4),   # Domain Controller 1
        ("windows", ["ldap", "smb", "rdp", "kerberos"], CVE_DC,  4),   # Domain Controller 2
        ("linux",   ["ssh", "nfs", "rsync"],           CVE_LINUX_SSH, 4),  # backup
        ("windows", ["smb", "rdp", "winrm"],           CVE_DC + CVE_WINDOWS_SMB, 4),  # admin
        ("linux",   ["ssh", "elasticsearch", "http"],  CVE_LINUX_SSH + CVE_LINUX_WEB, 4),  # SIEM
        ("linux",   ["postgresql", "ssh"],             CVE_DB,   4),
        ("windows", ["mssql", "smb", "rdp"],           CVE_DB + CVE_WINDOWS_SMB, 4),
        ("linux",   ["mongodb", "ssh"],                CVE_DB,   4),
        ("windows", ["smb", "ldap", "rdp"],            CVE_DC,   4),
        ("linux",   ["redis", "ssh"],                  CVE_DB + CVE_LINUX_SSH, 4),
        ("windows", ["mssql", "smb"],                  CVE_DB + CVE_WINDOWS_SMB, 4),
        ("linux",   ["ssh", "cassandra"],              CVE_DB,   4),
        ("windows", ["smb", "rdp", "mssql"],           CVE_WINDOWS_SMB + CVE_DB, 4),
        ("linux",   ["ssh", "postgresql", "nfs"],      CVE_DB,   4),
        ("windows", ["ldap", "smb", "kerberos", "dns"], CVE_DC,  4),   # DC 3 (root)
    ]

    for i, (os_, svcs, cve_pool, n_cve) in enumerate(core_configs, start=31):
        hosts[f"H{i}"] = {
            "os": os_,
            "services": svcs,
            "vulnerabilities": pick(cve_pool, n_cve),
            "sensitivity": "high",
        }

    # ── Edges ───────────────────────────────────────────────────────────────
    edges = []

    # DMZ → Application (each DMZ host connects to 2 app hosts)
    dmz_to_app = [
        ("H1",  "H11"), ("H1",  "H12"),
        ("H2",  "H11"), ("H2",  "H15"),
        ("H3",  "H13"), ("H3",  "H17"),
        ("H4",  "H12"), ("H4",  "H14"),
        ("H5",  "H15"), ("H5",  "H19"),
        ("H6",  "H11"), ("H6",  "H16"),
        ("H7",  "H13"), ("H7",  "H18"),
        ("H8",  "H14"), ("H8",  "H20"),
        ("H9",  "H21"), ("H9",  "H23"),
        ("H10", "H22"), ("H10", "H24"),
    ]
    edges.extend(dmz_to_app)

    # Application internal mesh (groups of 4, cross-linked)
    app_groups = [
        ["H11", "H12", "H13", "H14"],
        ["H15", "H16", "H17", "H18"],
        ["H19", "H20", "H21", "H22"],
        ["H23", "H24", "H25", "H26"],
        ["H27", "H28", "H29", "H30"],
    ]
    for grp in app_groups:
        for j in range(len(grp)):
            for k in range(j + 1, len(grp)):
                edges.append((grp[j], grp[k]))

    # Cross-group app links (bridges between groups)
    cross = [
        ("H14", "H15"), ("H18", "H19"),
        ("H22", "H23"), ("H26", "H27"),
    ]
    edges.extend(cross)

    # Application → Core
    app_to_core = [
        ("H11", "H31"), ("H12", "H32"),
        ("H13", "H33"), ("H14", "H34"),
        ("H15", "H35"), ("H16", "H31"),
        ("H17", "H32"), ("H18", "H33"),
        ("H19", "H41"), ("H20", "H42"),
        ("H21", "H43"), ("H22", "H44"),
        ("H23", "H45"), ("H24", "H46"),
        ("H25", "H37"), ("H26", "H38"),
        ("H27", "H39"), ("H28", "H40"),
        ("H29", "H47"), ("H30", "H48"),
    ]
    edges.extend(app_to_core)

    # Core internal (DCs connect to all core hosts)
    dc_hosts = ["H36", "H37", "H50"]  # domain controllers
    core_all = [f"H{i}" for i in range(31, 51)]
    for dc in dc_hosts:
        for ch in core_all:
            if dc != ch:
                edges.append((dc, ch))

    # Core DB cross-links
    db_links = [
        ("H31", "H32"), ("H33", "H34"), ("H35", "H41"),
        ("H42", "H43"), ("H44", "H45"), ("H46", "H47"),
        ("H48", "H49"),
    ]
    edges.extend(db_links)

    # Deduplicate edges
    seen = set()
    clean_edges = []
    for a, b in edges:
        key = tuple(sorted([a, b]))
        if key not in seen:
            seen.add(key)
            clean_edges.append([a, b])

    return {
        "network": {
            "hosts": hosts,
            "edges": clean_edges,
        }
    }


def main():
    topo = build_topology()
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join("orchestrator", "baselines", "topology_50host.yaml")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        yaml.dump(topo, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

    host_count = len(topo["network"]["hosts"])
    edge_count = len(topo["network"]["edges"])
    print(f"[GEN] {os.path.basename(out_path)} — {host_count} hosts, {edge_count} edges")
    print(f"[GEN] Saved to {out_path}")


if __name__ == "__main__":
    main()
