"""Action masks used by both training and the app's drills."""
import numpy as np


def red_action_mask(environment, host_order, red_agent):
    # 5 actions per host (scan, exploit, escalate, lateral_move, exfiltrate) + idle
    n = len(host_order)
    mask = np.ones(5 * n + 1, dtype=bool)
    known = getattr(red_agent, "known_vulns", {})

    for i, hname in enumerate(host_order):
        host = environment.hosts[hname]
        comp = host.is_compromised
        root = host.access_level == "root"

        # exploit: only uncompromised hosts Red has scanned (and found vulns on) and can reach
        scanned_with_vulns = bool(known.get(hname, {}).get("vulnerabilities"))
        if comp or not scanned_with_vulns or not environment.is_reachable(hname):
            mask[n + i] = False
        # escalate: only if compromised and not yet root
        if not comp or root:
            mask[2 * n + i] = False
        # lateral_move: only toward hosts not yet compromised
        if comp:
            mask[3 * n + i] = False
        # exfiltrate: only from root-level hosts still on the network whose data has not been taken yet
        if not (comp and root) or host.data_exfiltrated or host.is_isolated:
            mask[4 * n + i] = False

    # idle is always valid (last slot)
    return mask


def blue_action_mask(environment, host_order):
    # 6 actions per host (patch, isolate, restore, detect, harden, deploy_firewall) + idle
    n = len(host_order)
    mask = np.ones(6 * n + 1, dtype=bool)

    for i, hname in enumerate(host_order):
        host = environment.hosts[hname]
        iso = host.is_isolated

        # isolate: skip if already isolated
        if iso:
            mask[n + i] = False
        # restore: only if isolated
        if not iso:
            mask[2 * n + i] = False
        # deploy_firewall: skip if already active
        if getattr(host, "firewall_active", False):
            mask[5 * n + i] = False

    # idle is always valid (last slot)
    return mask
