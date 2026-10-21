"""Drill verdict (breached or defended) and the NIST SP 800-30 likelihood scale."""

import math

BREACH_COMPROMISE_THRESHOLD = 0.2
BREACH_CRITERION = "exfiltration occurred OR >20% hosts compromised"


def drill_outcome(final_hosts):
    """Verdict from the final host states ({name: {"is_compromised", "data_exfiltrated", ...}})."""
    hosts = final_hosts or {}
    n = len(hosts)
    compromised = sum(1 for h in hosts.values() if h.get("is_compromised"))
    stolen_from = [name for name, h in hosts.items() if h.get("data_exfiltrated")]
    breached = bool(stolen_from) or (n > 0 and compromised / n > BREACH_COMPROMISE_THRESHOLD)
    return {
        "outcome": "breached" if breached else "defended",
        "reason": _reason(stolen_from, compromised, n),
        "hosts_total": n,
        "hosts_compromised": compromised,
        "hosts_exfiltrated": len(stolen_from),
        "exfiltrated_hosts": stolen_from,
        "criterion": BREACH_CRITERION,
    }


def _reason(stolen_from, compromised, n):
    hosts = f"{compromised}/{n} hosts compromised"
    if n and compromised / n > BREACH_COMPROMISE_THRESHOLD:
        hosts += " (over 20%)"
    elif not stolen_from:
        hosts += " (limit 20%)"
    if stolen_from:
        shown = ", ".join(stolen_from[:5]) + (f" +{len(stolen_from) - 5} more" if len(stolen_from) > 5 else "")
        return f"data stolen from {shown} · {hosts}"
    return f"no data stolen · {hosts}"


def is_breach(final_hosts):
    return drill_outcome(final_hosts)["outcome"] == "breached"


def simulation_outcome(final_state):
    """Verdict for a stored simulation's final_state, or None if the drill has no final state yet."""
    hosts = (final_state or {}).get("hosts")
    if not hosts:
        return None
    return drill_outcome(hosts)


NIST_CITATION = "NIST SP 800-30 Rev. 1, Table G-4 (likelihood of threat event resulting in adverse impacts)"

NIST_LIKELIHOOD_SCALE = [
    (96, 100, "Very High", "almost certain to have adverse impacts"),
    (80, 95, "High", "highly likely to have adverse impacts"),
    (21, 79, "Moderate", "somewhat likely to have adverse impacts"),
    (5, 20, "Low", "unlikely to have adverse impacts"),
    (0, 4, "Very Low", "highly unlikely to have adverse impacts"),
]


def nist_likelihood(breach_rate):
    rate = float(breach_rate)
    if not 0 <= rate <= 100:
        raise ValueError(f"breach rate must be between 0 and 100, got {breach_rate}")
    # the table uses whole numbers, so round half up first (20.5 -> 21)
    pct = math.floor(rate + 0.5)
    for low, high, level, description in NIST_LIKELIHOOD_SCALE:
        if low <= pct <= high:
            return {
                "level": level,
                "range": f"{low}-{high}",
                "description": description,
                "breach_rate": rate,
                "citation": NIST_CITATION,
            }
