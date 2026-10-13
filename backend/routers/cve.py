"""CVE lookup router — local fast-path for 30 common CVEs, NVD API fallback for anything else."""
import logging
import httpx
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List

log = logging.getLogger(__name__)
router = APIRouter(prefix="/cve", tags=["CVE"])

NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"

# Persistent in-memory cache for NVD results (lasts for the life of the process)
_nvd_cache: dict = {}

# Local fast-path — no network call needed for these 30 well-known CVEs
_LOCAL: dict = {
    # Windows / Microsoft
    "CVE-2021-34527": {"name": "PrintNightmare",           "severity": "CRITICAL", "cvss_score": 8.8,  "description": "Windows Print Spooler Remote Code Execution vulnerability allows attackers to execute code with SYSTEM privileges.",                               "fix": "Disable Print Spooler on non-print servers or apply KB5004945."},
    "CVE-2021-1675":  {"name": "PrintNightmare v2",        "severity": "HIGH",     "cvss_score": 7.8,  "description": "Windows Print Spooler local privilege escalation (LPE) variant discovered alongside CVE-2021-34527.",                                          "fix": "Disable Print Spooler on non-print servers."},
    "CVE-2020-0796":  {"name": "SMBGhost",                 "severity": "CRITICAL", "cvss_score": 10.0, "description": "SMBv3 compression buffer overflow allowing remote code execution without authentication (wormable).",                                           "fix": "Apply KB4551762 or disable SMBv3 compression via registry."},
    "CVE-2017-0144":  {"name": "EternalBlue",              "severity": "CRITICAL", "cvss_score": 9.3,  "description": "SMBv1 remote code execution vulnerability exploited by WannaCry and NotPetya ransomware.",                                                      "fix": "Apply MS17-010 and disable SMBv1 immediately."},
    "CVE-2020-1472":  {"name": "Zerologon",                "severity": "CRITICAL", "cvss_score": 10.0, "description": "Netlogon privilege escalation allows attackers to impersonate any domain computer and take over the domain.",                                    "fix": "Apply August 2020 Windows security update immediately."},
    "CVE-2019-0708":  {"name": "BlueKeep",                 "severity": "CRITICAL", "cvss_score": 9.8,  "description": "RDP pre-authentication remote code execution vulnerability (wormable) affecting Windows 7 / Server 2008.",                                      "fix": "Apply KB4499175 and enable Network Level Authentication (NLA)."},
    "CVE-2021-26855": {"name": "ProxyLogon",               "severity": "CRITICAL", "cvss_score": 9.8,  "description": "Microsoft Exchange Server SSRF allowing unauthenticated remote code execution; widely exploited in early 2021.",                                "fix": "Apply Exchange cumulative updates immediately; check for webshells."},
    "CVE-2021-26857": {"name": "Exchange Deserialization",  "severity": "HIGH",     "cvss_score": 7.8,  "description": "Insecure deserialization in Exchange Unified Messaging service enables SYSTEM code execution.",                                                  "fix": "Apply Microsoft Exchange security updates (March 2021)."},
    "CVE-2021-34535": {"name": "RDP Client RCE",           "severity": "CRITICAL", "cvss_score": 8.8,  "description": "Remote Desktop client remote code execution when connecting to a malicious RDP server.",                                                        "fix": "Apply KB5004237 and restrict RDP client exposure."},
    "CVE-2022-21990": {"name": "RDP Client RCE v2",        "severity": "HIGH",     "cvss_score": 8.8,  "description": "Remote Desktop client RCE via malicious server; similar attack vector to CVE-2021-34535.",                                                     "fix": "Apply February 2022 Patch Tuesday updates."},
    "CVE-2022-26923": {"name": "AD CS Privilege Esc",      "severity": "CRITICAL", "cvss_score": 8.8,  "description": "Active Directory Certificate Services misconfiguration allows low-privileged users to obtain domain administrator certificates.",                 "fix": "Apply KB5014754 and audit AD CS certificate templates."},
    "CVE-2023-23397": {"name": "Outlook Elevation",        "severity": "CRITICAL", "cvss_score": 9.8,  "description": "Microsoft Outlook zero-click privilege escalation via specially crafted email; attacker retrieves NTLM hash without user interaction.",          "fix": "Apply Microsoft security update; block TCP 445 outbound at perimeter."},
    "CVE-2022-30190":  {"name": "Follina",                 "severity": "HIGH",     "cvss_score": 7.8,  "description": "Windows MSDT remote code execution via malicious Office documents; exploits the ms-msdt URI handler.",                                          "fix": "Disable MSDT URL protocol and apply Microsoft security update."},
    # Linux
    "CVE-2022-0847":  {"name": "DirtyPipe",                "severity": "HIGH",     "cvss_score": 7.8,  "description": "Linux kernel pipe buffer privilege escalation vulnerability; allows local users to overwrite read-only files.",                                  "fix": "Update Linux kernel to 5.16.11+, 5.15.25+, or 5.10.102+."},
    "CVE-2021-3156":  {"name": "Baron Samedit",            "severity": "HIGH",     "cvss_score": 7.8,  "description": "Heap-based buffer overflow in sudo allows any local user to gain root privilege without a password.",                                            "fix": "Update sudo to version 1.9.5p2 or later."},
    "CVE-2016-5195":  {"name": "DirtyCow",                 "severity": "HIGH",     "cvss_score": 7.8,  "description": "Linux kernel race condition in copy-on-write mechanism allowing local privilege escalation.",                                                    "fix": "Update Linux kernel to version 4.8.3+."},
    "CVE-2021-4034":  {"name": "PwnKit",                   "severity": "HIGH",     "cvss_score": 7.8,  "description": "Local privilege escalation in polkit pkexec; allows any local user to obtain root on default Linux installations.",                               "fix": "Update polkit to version 0.120 or apply vendor patch."},
    "CVE-2022-2588":  {"name": "DirtyCred",                "severity": "HIGH",     "cvss_score": 7.8,  "description": "Linux kernel use-after-free vulnerability enabling privilege escalation by swapping unprivileged kernel credentials.",                          "fix": "Update Linux kernel to latest stable release."},
    "CVE-2023-0386":  {"name": "OverlayFS Priv Esc",       "severity": "HIGH",     "cvss_score": 7.8,  "description": "Linux OverlayFS filesystem allows unprivileged users to copy files with capabilities into a nosuid mount, enabling privilege escalation.",       "fix": "Update Linux kernel to 6.2+ or apply distribution patch."},
    "CVE-2021-3493":  {"name": "OverlayFS Ubuntu",         "severity": "HIGH",     "cvss_score": 7.8,  "description": "Ubuntu-specific OverlayFS vulnerability allowing local users to escalate to root; affects default Ubuntu kernel builds.",                        "fix": "Update Ubuntu kernel packages via apt."},
    # Web / App Servers
    "CVE-2021-44228": {"name": "Log4Shell",                "severity": "CRITICAL", "cvss_score": 10.0, "description": "Apache Log4j2 JNDI injection vulnerability; remote code execution via a single crafted log message. One of the most critical CVEs ever.",      "fix": "Upgrade Log4j to 2.17.1+. Remove JndiLookup class as interim mitigation."},
    "CVE-2022-22965": {"name": "Spring4Shell",             "severity": "CRITICAL", "cvss_score": 9.8,  "description": "Spring Framework RCE via data binding on JDK 9+; exploitable through ClassLoader access.",                                                     "fix": "Upgrade Spring Framework to 5.3.18+ or 5.2.20+."},
    "CVE-2023-44487": {"name": "HTTP/2 Rapid Reset",       "severity": "CRITICAL", "cvss_score": 7.5,  "description": "HTTP/2 protocol DDoS amplification via rapid RST_STREAM frames; used in record-breaking DDoS attacks (>398 million rps).",                     "fix": "Update web server (nginx, Apache, IIS) to patched version."},
    "CVE-2021-41773": {"name": "Apache Path Traversal",    "severity": "CRITICAL", "cvss_score": 9.8,  "description": "Path traversal and RCE in Apache HTTP Server 2.4.49; allows unauthenticated access to files outside web root.",                                 "fix": "Update Apache HTTPD to 2.4.51+."},
    "CVE-2019-0211":  {"name": "Apache Privilege Esc",     "severity": "HIGH",     "cvss_score": 7.8,  "description": "Apache HTTP Server local privilege escalation; lower-privileged child processes can execute code as root via scoreboard.",                      "fix": "Update Apache HTTPD to 2.4.39+."},
    "CVE-2023-0286":  {"name": "OpenSSL X.509 Confusion",  "severity": "HIGH",     "cvss_score": 7.4,  "description": "OpenSSL type confusion vulnerability in X.509 GeneralName processing; can cause denial of service or memory read in TLS clients/servers.",       "fix": "Upgrade OpenSSL to 3.0.8+, 1.1.1t+."},
    # Database
    "CVE-2023-21912": {"name": "MySQL Server DoS",         "severity": "HIGH",     "cvss_score": 7.5,  "description": "Oracle MySQL Server vulnerability in the Server: Security component; unauthenticated network access via multiple protocols can cause hang or crash.", "fix": "Apply Oracle Critical Patch Update (April 2023)."},
    "CVE-2022-21270": {"name": "MySQL Server Exploit",     "severity": "MEDIUM",   "cvss_score": 4.9,  "description": "Oracle MySQL Server vulnerability allowing privileged attacker to cause partial denial of service via federated storage engine.",                  "fix": "Apply Oracle January 2022 Critical Patch Update."},
    "CVE-2020-14812": {"name": "MySQL Server DoS v2",      "severity": "MEDIUM",   "cvss_score": 4.9,  "description": "Oracle MySQL Server vulnerability in Server: Locking component; easily exploitable by privileged attacker to cause server hang.",                "fix": "Update MySQL to 8.0.22+, 5.7.32+, or 5.6.50+."},
    "CVE-2019-2737":  {"name": "MySQL XML Vulnerability",  "severity": "MEDIUM",   "cvss_score": 4.9,  "description": "Oracle MySQL Server vulnerability in Server: Pluggable Auth component allowing partial DoS via privileged network access.",                       "fix": "Update MySQL to 8.0.17+, 5.7.27+, or 5.6.45+."},
    # SSH / Other
    "CVE-2023-51764": {"name": "Postfix SMTP Smuggling",   "severity": "MEDIUM",   "cvss_score": 5.3,  "description": "SMTP smuggling in Postfix allows spoofed e-mail from authenticated domains.",                                                                    "fix": "Apply Postfix update or set smtpd_forbid_bare_newline = yes."},
    "CVE-2022-31214": {"name": "Firejail Priv Esc",        "severity": "HIGH",     "cvss_score": 7.8,  "description": "Firejail sandbox local privilege escalation via TIOCSTI ioctl abuse allowing root access.",                                                     "fix": "Update Firejail to 0.9.70 or later."},
    "CVE-2022-29154": {"name": "rsync Heap Overflow",      "severity": "HIGH",     "cvss_score": 7.4,  "description": "rsync heap buffer overflow in sender mode when connecting to a malicious server.",                                                              "fix": "Update rsync to 3.2.5 or later."},
    "CVE-2023-38408": {"name": "OpenSSH Agent RCE",        "severity": "CRITICAL", "cvss_score": 9.8,  "description": "Remote code execution via ssh-agent forwarding when connecting to a malicious SSH server; exploits dlopen() calls.",                            "fix": "Update OpenSSH to 9.3p2 or later. Disable ssh-agent forwarding where unused."},
    "CVE-2023-21912": {"name": "MySQL Server DoS",         "severity": "HIGH",     "cvss_score": 7.5,  "description": "Oracle MySQL unauthenticated DoS via network protocols.",                                                                                       "fix": "Apply Oracle Critical Patch Update (April 2023)."},
    "CVE-2022-21270": {"name": "MySQL Federated DoS",      "severity": "MEDIUM",   "cvss_score": 4.9,  "description": "MySQL privileged attacker can crash server via federated engine.",                                                                               "fix": "Apply Oracle January 2022 Critical Patch Update."},
    "CVE-2020-14812": {"name": "MySQL Locking DoS",        "severity": "MEDIUM",   "cvss_score": 4.9,  "description": "MySQL locking component vulnerability enabling server hang by privileged user.",                                                                  "fix": "Update MySQL to 8.0.22+."},
    "CVE-2019-2737":  {"name": "MySQL Pluggable Auth DoS", "severity": "MEDIUM",   "cvss_score": 4.9,  "description": "MySQL pluggable auth component partial DoS via privileged network access.",                                                                       "fix": "Update MySQL to 5.7.27+."},
}


async def _fetch_nvd(cve_id: str) -> dict | None:
    """Fetch one CVE from the NIST NVD API and return a normalised dict."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(NVD_URL, params={"cveId": cve_id},
                                 headers={"User-Agent": "CyberDrillFYP/1.0"})
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        log.warning("NVD fetch failed for %s: %s", cve_id, exc)
        return None

    vulns = data.get("vulnerabilities", [])
    if not vulns:
        return None

    cve_obj = vulns[0].get("cve", {})

    # English description
    desc = next(
        (d["value"] for d in cve_obj.get("descriptions", []) if d.get("lang") == "en"),
        "No description available."
    )
    # Truncate to 350 chars for UI readability
    if len(desc) > 350:
        desc = desc[:347] + "..."

    # CVSS score + severity — prefer v3.1 > v3.0 > v2
    cvss_score, severity = None, "MEDIUM"
    for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        entries = cve_obj.get("metrics", {}).get(key, [])
        if entries:
            cd = entries[0].get("cvssData", {})
            cvss_score = cd.get("baseScore")
            raw = cd.get("baseSeverity", "MEDIUM")
            severity = raw.upper()
            break

    return {
        "id": cve_id,
        "name": cve_id,          # NVD has no short name; use the ID itself
        "severity": severity,
        "cvss_score": cvss_score,
        "description": desc,
        "fix": "Apply the vendor's latest security patch. See NVD for full advisory details.",
        "source": "nvd",
    }


def _local_entry(cve_id: str) -> dict:
    """Return a normalised dict from the local fast-path dict."""
    e = _LOCAL[cve_id]
    return {
        "id": cve_id,
        "name": e["name"],
        "severity": e["severity"],
        "cvss_score": e.get("cvss_score"),
        "description": e["description"],
        "fix": e["fix"],
        "source": "local",
    }


async def _lookup(cve_id: str) -> dict:
    """Priority: local dict → in-memory NVD cache → live NVD fetch → fallback."""
    cve_id = cve_id.upper().strip()

    if cve_id in _LOCAL:
        return _local_entry(cve_id)

    if cve_id in _nvd_cache:
        return _nvd_cache[cve_id]

    result = await _fetch_nvd(cve_id)
    if result:
        _nvd_cache[cve_id] = result
        return result

    # Unknown CVE and NVD unreachable — return minimal placeholder
    fallback = {
        "id": cve_id,
        "name": cve_id,
        "severity": "MEDIUM",
        "cvss_score": None,
        "description": "CVE details unavailable. Check https://nvd.nist.gov for the latest information.",
        "fix": "Apply the vendor's latest security patch.",
        "source": "unknown",
    }
    _nvd_cache[cve_id] = fallback  # cache so we don't hammer NVD for missing IDs
    return fallback


# ── Routes ──────────────────────────────────────────────────────────────────

@router.get("/{cve_id}")
async def get_cve(cve_id: str):
    """Look up a single CVE. Returns local data instantly; unknown CVEs are
    fetched from the NIST National Vulnerability Database API and cached."""
    return await _lookup(cve_id)


class BatchRequest(BaseModel):
    ids: List[str]


@router.post("/batch")
async def get_cve_batch(payload: BatchRequest):
    """Look up multiple CVEs at once. Returns a dict keyed by CVE ID.
    Useful for pre-loading all CVEs in a topology in one round-trip."""
    import asyncio
    unique = list(dict.fromkeys(i.upper().strip() for i in payload.ids))
    results = await asyncio.gather(*[_lookup(cve_id) for cve_id in unique])
    return {r["id"]: r for r in results}
