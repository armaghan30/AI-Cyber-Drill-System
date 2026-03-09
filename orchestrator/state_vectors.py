
from __future__ import annotations

from typing import Dict, List
import numpy as np


def flatten_red_state(red_state: Dict, host_order: List[str]) -> np.ndarray:
   
    hosts = red_state.get("hosts", {})
    timestep = float(red_state.get("timestep", 0))
    num_hosts = float(red_state.get("num_hosts", len(host_order)))
    num_compromised = float(red_state.get("num_compromised", 0))

    vec = [timestep, num_hosts, num_compromised]

    for name in host_order:
        h = hosts.get(name, {})
        vec.extend(
            [
                float(h.get("scanned", 0)),
                float(h.get("vuln_count", 0)),
                float(h.get("service_count", 0)),
                float(h.get("is_compromised", 0)),
                float(h.get("access_level", 0)),
                float(h.get("is_isolated", 0)),
                float(h.get("hardened_level", 0)),
                float(h.get("data_exfiltrated", 0)),
                float(h.get("detected", 0)),
            ]
        )

    return np.array(vec, dtype=np.float32)


def flatten_blue_state(blue_state: Dict, host_order: List[str]) -> np.ndarray:

    hosts = blue_state.get("hosts", {})
    timestep = float(blue_state.get("timestep", 0))
    num_compromised = float(blue_state.get("num_compromised", 0))

    vec = [timestep, num_compromised]

    for name in host_order:
        h = hosts.get(name, {})
        vec.extend(
            [
                float(h.get("is_compromised", 0)),
                float(h.get("vulnerability_count", 0)),
                float(h.get("access_level", 0)),
                float(h.get("sensitivity", 0)),
                float(h.get("is_isolated", 0)),
                float(h.get("detected", 0)),
                float(h.get("hardened_level", 0)),
                float(h.get("data_exfiltrated", 0)),
            ]
        )

    return np.array(vec, dtype=np.float32)
