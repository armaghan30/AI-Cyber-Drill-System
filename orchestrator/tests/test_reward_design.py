import pytest

from orchestrator.reward_engine import RewardEngine, EXFIL_REWARD
from orchestrator.tests.test_phase2_reward_engine import make_hosts

engine = RewardEngine()


def _exfil_reward(sensitivity):
    prev = {"hosts": make_hosts(compromised=True, access="root")}
    new = {"hosts": make_hosts(compromised=True, access="root", exfil=True)}
    action = {"action": "exfiltrate", "target": "H1", "success": True, "sensitivity": sensitivity}
    return engine.compute_rewards(prev, new, action, None)[0]


def test_new_compromise_is_worth_45():
    # deliberate design: +20 exploit + 25 global new-compromise bonus
    prev = {"hosts": make_hosts(compromised=False)}
    new = {"hosts": make_hosts(compromised=True, access="user")}
    red_r, _ = engine.compute_rewards(prev, new, {"action": "exploit", "target": "H1", "success": True}, None)
    assert red_r == 45.0


def test_lateral_compromise_is_worth_43():
    prev = {"hosts": make_hosts(compromised=False)}
    new = {"hosts": make_hosts(compromised=True, access="user")}
    action = {"action": "lateral_move", "target": "H1", "success": True, "source": "H2"}
    assert engine.compute_rewards(prev, new, action, None)[0] == 43.0


@pytest.mark.parametrize("sens", ["low", "medium", "high"])
def test_exfil_reward_matches_table(sens):
    assert _exfil_reward(sens) == EXFIL_REWARD[sens]


def test_exfil_reward_weighted_by_sensitivity():
    assert _exfil_reward("low") < _exfil_reward("medium") < _exfil_reward("high")


def test_finishing_chain_beats_spreading_on_valuable_hosts():
    # expected reward per step: fresh exploit vs escalate (p=0.6) + exfiltrate (p=0.8)
    exploit_per_step = 0.7 * 45 - 0.3 * 5
    chain_steps = 1 / 0.6 + 1 / 0.8
    for sens in ("medium", "high"):
        assert (15 + EXFIL_REWARD[sens]) / chain_steps > exploit_per_step
