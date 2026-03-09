import random


def test_escalate_fails_when_not_compromised(red_agent):
    result = red_agent.escalate_privileges("H1")
    assert result["success"] is False
    assert result["reason"] == "not_compromised"


def test_escalate_fails_when_already_root(red_agent, environment):
    host = environment.hosts["H1"]
    host.is_compromised = True
    host.access_level = "root"

    result = red_agent.escalate_privileges("H1")
    assert result["success"] is False
    assert result["reason"] == "access_is_root"


def test_escalate_succeeds_from_user(red_agent, environment):
    host = environment.hosts["H1"]
    host.is_compromised = True
    host.access_level = "user"

    random.seed(1)
    success_found = False
    for _ in range(50):
        host.access_level = "user"
        result = red_agent.escalate_privileges("H1")
        if result["success"]:
            assert host.access_level == "root"
            success_found = True
            break
    assert success_found


def test_escalate_hardening_reduces_probability(red_agent, environment):
    host = environment.hosts["H1"]
    host.is_compromised = True
    host.access_level = "user"
    host.hardened_level = 3

    failures = 0
    for _ in range(100):
        host.access_level = "user"
        result = red_agent.escalate_privileges("H1")
        if not result["success"]:
            failures += 1

    assert failures > 70  # should fail most of the time


def test_lateral_move_no_adjacent_compromised(red_agent):
    result = red_agent.lateral_move("H2")
    assert result["success"] is False
    assert result["reason"] == "no_adjacent_compromised"


def test_lateral_move_target_isolated(red_agent, environment):
    environment.hosts["H1"].is_compromised = True
    environment.hosts["H2"].is_isolated = True

    result = red_agent.lateral_move("H2")
    assert result["success"] is False
    assert result["reason"] == "target_isolated"


def test_lateral_move_succeeds(red_agent, environment):
    environment.hosts["H1"].is_compromised = True
    red_agent.compromised_hosts.append("H1")

    random.seed(0)
    success_found = False
    for _ in range(50):
        environment.hosts["H2"].is_compromised = False
        environment.hosts["H2"].access_level = "none"
        result = red_agent.lateral_move("H2")
        if result["success"]:
            assert environment.hosts["H2"].is_compromised is True
            assert environment.hosts["H2"].access_level == "user"
            success_found = True
            break
    assert success_found


def test_exfiltrate_needs_root(red_agent, environment):
    host = environment.hosts["H1"]
    host.is_compromised = True
    host.access_level = "user"

    result = red_agent.exfiltrate("H1")
    assert result["success"] is False
    assert result["reason"] == "no_root_access"


def test_exfiltrate_succeeds(red_agent, environment):
    host = environment.hosts["H1"]
    host.is_compromised = True
    host.access_level = "root"

    random.seed(1)
    success_found = False
    for _ in range(20):
        host.data_exfiltrated = False
        result = red_agent.exfiltrate("H1")
        if result["success"]:
            assert host.data_exfiltrated is True
            success_found = True
            break
    assert success_found


def test_exfiltrate_already_done(red_agent, environment):
    host = environment.hosts["H1"]
    host.is_compromised = True
    host.access_level = "root"
    host.data_exfiltrated = True

    result = red_agent.exfiltrate("H1")
    assert result["success"] is False
    assert result["reason"] == "already_exfiltrated"
