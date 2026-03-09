from orchestrator.reward_engine import RewardEngine


def make_hosts(compromised=False, access="none", vulns=None, sensitivity="low",
               detected=False, hardened=0, exfil=False):
    return {
        "H1": {
            "is_compromised": compromised,
            "access_level": access,
            "vulnerabilities": vulns or [],
            "is_isolated": False,
            "detected": detected,
            "hardened_level": hardened,
            "data_exfiltrated": exfil,
        }
    }


engine = RewardEngine()


def test_escalate_success_reward():
    prev = {"hosts": make_hosts(compromised=True, access="user")}
    new = {"hosts": make_hosts(compromised=True, access="root")}
    red_action = {"action": "escalate", "target": "H1", "success": True}

    red_r, blue_r = engine.compute_rewards(prev, new, red_action, None)
    assert red_r >= 15.0
    assert blue_r <= -5.0


def test_escalate_fail_reward():
    prev = {"hosts": make_hosts(compromised=True, access="user")}
    new = {"hosts": make_hosts(compromised=True, access="user")}
    red_action = {"action": "escalate", "target": "H1", "success": False}

    red_r, _ = engine.compute_rewards(prev, new, red_action, None)
    assert red_r < 0


def test_lateral_move_success_reward():
    prev = {"hosts": make_hosts(compromised=False)}
    new = {"hosts": make_hosts(compromised=True, access="user")}
    red_action = {"action": "lateral_move", "target": "H1", "success": True, "source": "H2"}

    red_r, blue_r = engine.compute_rewards(prev, new, red_action, None)
    assert red_r >= 18.0
    assert blue_r <= -8.0


def test_exfiltrate_high_sensitivity_reward():
    prev = {"hosts": make_hosts(compromised=True, access="root")}
    new = {"hosts": make_hosts(compromised=True, access="root", exfil=True)}
    red_action = {"action": "exfiltrate", "target": "H1", "success": True, "sensitivity": "high"}

    red_r, blue_r = engine.compute_rewards(prev, new, red_action, None)
    assert red_r >= 30.0
    assert blue_r <= -15.0


def test_restore_compromised_reward():
    prev = {"hosts": make_hosts(compromised=True, access="root")}
    new = {"hosts": make_hosts(compromised=False)}
    blue_action = {"action": "restore", "target": "H1"}

    red_r, blue_r = engine.compute_rewards(prev, new, None, blue_action)
    assert blue_r >= 12.0
    assert red_r <= -8.0


def test_restore_clean_host_penalty():
    prev = {"hosts": make_hosts(compromised=False)}
    new = {"hosts": make_hosts(compromised=False)}
    blue_action = {"action": "restore", "target": "H1"}

    _, blue_r = engine.compute_rewards(prev, new, None, blue_action)
    assert blue_r < 0


def test_detect_found_reward():
    prev = {"hosts": make_hosts(compromised=True)}
    new = {"hosts": make_hosts(compromised=True, detected=True)}
    blue_action = {"action": "detect", "target": "H1", "detected": True}

    red_r, blue_r = engine.compute_rewards(prev, new, None, blue_action)
    assert blue_r >= 8.0
    assert red_r <= -2.0


def test_harden_success_reward():
    prev = {"hosts": make_hosts(vulns=["CVE-1", "CVE-2"])}
    new = {"hosts": make_hosts(vulns=[])}
    blue_action = {"action": "harden", "target": "H1"}

    red_r, blue_r = engine.compute_rewards(prev, new, None, blue_action)
    assert blue_r >= 8.0
    assert red_r <= -2.0
