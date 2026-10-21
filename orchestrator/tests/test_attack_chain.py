import random

import numpy as np

from orchestrator.action_masks import red_action_mask, blue_action_mask

IDLE = {"action": "idle", "target": None}


def _exploit(environment, host):
    environment.step({"action": "exploit", "target": host, "success": True}, IDLE)


def test_escalate_works_after_exploit(red_agent, environment):
    _exploit(environment, "H1")
    assert environment.hosts["H1"].access_level == "user"

    random.seed(0)
    for _ in range(30):
        if red_agent.escalate_privileges("H1")["success"]:
            break
    assert environment.hosts["H1"].access_level == "root"


def test_exfiltrate_needs_escalate_after_exploit(red_agent, environment):
    _exploit(environment, "H1")
    assert red_agent.exfiltrate("H1")["reason"] == "no_root_access"


def _red_slots(environment, red_agent, host):
    hosts = list(environment.hosts)
    n, i = len(hosts), hosts.index(host)
    m = red_action_mask(environment, hosts, red_agent)
    return {"exploit": m[n + i], "escalate": m[2 * n + i],
            "lateral_move": m[3 * n + i], "exfiltrate": m[4 * n + i]}


def test_red_mask_follows_attack_chain(environment, red_agent):
    # H1 is low sensitivity -> internet-facing
    h = environment.hosts["H1"]
    s = _red_slots(environment, red_agent, "H1")
    assert not s["exploit"] and not s["escalate"] and not s["exfiltrate"]  # must scan first

    red_agent.scan("H1")
    assert _red_slots(environment, red_agent, "H1")["exploit"]

    _exploit(environment, "H1")
    s = _red_slots(environment, red_agent, "H1")
    assert not s["exploit"] and s["escalate"] and not s["exfiltrate"]

    h.access_level = "root"
    s = _red_slots(environment, red_agent, "H1")
    assert not s["escalate"] and s["exfiltrate"]

    h.data_exfiltrated = True
    assert not _red_slots(environment, red_agent, "H1")["exfiltrate"]


def test_red_mask_idle_always_valid(environment, red_agent):
    hosts = list(environment.hosts)
    for h in environment.hosts.values():
        h.is_compromised, h.access_level, h.data_exfiltrated = True, "root", True
    assert red_action_mask(environment, hosts, red_agent)[-1]


def test_envs_and_drill_use_same_masks(orchestrator):
    from backend.services.simulation_service import _get_action_masks
    env = orchestrator.environment
    hosts = list(env.hosts)
    orchestrator.red_agent.scan("H2")
    _exploit(env, "H1")
    env.step(None, {"action": "isolate", "target": "H2"})
    red = orchestrator.red_agent
    assert np.array_equal(_get_action_masks(orchestrator, hosts, "red"), red_action_mask(env, hosts, red))
    assert np.array_equal(_get_action_masks(orchestrator, hosts, "blue"), blue_action_mask(env, hosts))
