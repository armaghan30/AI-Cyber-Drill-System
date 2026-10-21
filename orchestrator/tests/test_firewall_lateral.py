import random

from orchestrator.firewall_engine import FirewallEngine, FirewallRule


def _deploy(environment, host):
    environment.firewall_engine.deploy(host)
    environment.hosts[host].firewall_active = True


def test_low_sensitivity_firewall_allows_lateral_move(red_agent, environment):
    # H1 is low sensitivity: its auto rule blocks no sources ("__none__" sentinel)
    environment.hosts["H2"].is_compromised = True
    _deploy(environment, "H1")

    random.seed(0)
    results = [red_agent.lateral_move("H1") for _ in range(20)]
    assert all(r.get("reason") != "firewall_blocked" for r in results)
    assert any(r["success"] for r in results)
    assert all(r["source"] == "H2" for r in results)


def test_high_sensitivity_firewall_blocks_lateral_move(red_agent, environment):
    # H2 is high sensitivity: an active firewall blocks lateral movement from any source
    environment.hosts["H1"].is_compromised = True
    _deploy(environment, "H2")

    result = red_agent.lateral_move("H2")
    assert result["success"] is False
    assert result["reason"] == "firewall_blocked"
    assert result["source"] == "H1"
    assert environment.hosts["H2"].is_compromised is False


def test_lateral_move_without_source_is_not_a_firewall_block(red_agent, environment):
    # no compromised neighbour: report that, not a firewall block (which would pay Blue +10)
    _deploy(environment, "H2")
    result = red_agent.lateral_move("H2")
    assert result["reason"] == "no_adjacent_compromised"


def test_explicit_source_rule_only_blocks_listed_sources():
    fw = FirewallEngine()
    fw.rules["DB"] = FirewallRule(block_inbound_from=["WEB"])
    fw.deploy("DB")
    assert fw.is_lateral_blocked("DB", "WEB") is True
    assert fw.is_lateral_blocked("DB", "APP") is False


def test_sentinel_rule_never_blocks_lateral_move():
    fw = FirewallEngine()
    fw.rules["H"] = FirewallRule(block_inbound_from=["__none__"])
    fw.deploy("H")
    assert fw.is_lateral_blocked("H", "X") is False
    assert fw.is_lateral_blocked("H", None) is False


def test_exposed_host_firewall_filters_but_does_not_block_exploits(red_agent, environment):
    # H1 is internet-facing: its firewall must keep public services open
    h1 = environment.hosts["H1"]
    assert h1.exposed
    _deploy(environment, "H1")
    assert environment.firewall_engine.is_exploit_blocked("H1", h1.services) is False

    red_agent.scan("H1")
    random.seed(0)
    results = []
    for _ in range(300):
        h1.is_compromised = False
        results.append(red_agent.exploit("H1"))
    assert all(r.get("reason") != "firewall_blocked" for r in results)
    rate = sum(r["success"] for r in results) / len(results)
    assert 0.12 < rate < 0.28  # reduced from 0.7 to 0.2


def test_internal_host_firewall_still_blocks_exploits(red_agent, environment):
    h2 = environment.hosts["H2"]
    assert not h2.exposed
    _deploy(environment, "H2")
    environment.hosts["H1"].is_compromised = True  # foothold so H2 is reachable
    red_agent.scan("H2")
    assert red_agent.exploit("H2")["reason"] == "firewall_blocked"


def test_inactive_firewall_never_blocks():
    fw = FirewallEngine()
    fw.rules["H"] = FirewallRule()
    assert fw.is_lateral_blocked("H", "X") is False
