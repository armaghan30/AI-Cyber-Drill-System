from orchestrator.reward_engine import RewardEngine

engine = RewardEngine()
IDLE = {"action": "idle", "target": None}


def _scan_reward(environment, red_agent, host="H1"):
    prev = environment._snapshot()
    action = red_agent.scan(host)
    new = environment.step(action, IDLE)
    return engine.compute_rewards(prev, new, action, None)[0], action


def test_first_scan_is_new_info(red_agent):
    assert red_agent.scan("H1")["new_info"] is True


def test_rescan_without_change_is_not_new_info(red_agent):
    red_agent.scan("H1")
    assert red_agent.scan("H1")["new_info"] is False


def test_rescan_after_patch_is_new_info(red_agent, environment):
    red_agent.scan("H1")
    environment.step(None, {"action": "patch", "target": "H1"})
    assert red_agent.scan("H1")["new_info"] is True


def test_first_scan_pays_3(red_agent, environment):
    r, _ = _scan_reward(environment, red_agent)
    assert r == 3.0


def test_rescan_with_nothing_new_costs_1(red_agent, environment):
    _scan_reward(environment, red_agent)
    r, _ = _scan_reward(environment, red_agent)
    assert r == -1.0


def test_rescan_that_sees_patch_pays_again(red_agent, environment):
    _scan_reward(environment, red_agent)
    environment.step(None, {"action": "patch", "target": "H1"})
    r, _ = _scan_reward(environment, red_agent)
    assert r == 3.0  # H1 still has vulns left after one patch


def test_scan_without_flag_keeps_old_reward():
    # logs / callers that predate the new_info flag are treated as new information
    hosts = {"H1": {"vulnerabilities": ["CVE-1"], "is_compromised": False}}
    r, _ = engine.compute_rewards({"hosts": hosts}, {"hosts": hosts}, {"action": "scan", "target": "H1"}, None)
    assert r == 3.0


def test_scan_farming_is_not_profitable(orchestrator):
    # 1 first scan + 19 re-scans of the same host must lose reward overall
    red, env = orchestrator.red_agent, orchestrator.environment
    total = 0.0
    for _ in range(20):
        r, _ = _scan_reward(env, red)
        total += r
    assert total < 0
