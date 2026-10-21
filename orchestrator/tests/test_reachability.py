import random

from orchestrator.env_builder import Environment


def _topo(hosts, edges=()):
    return {"network": {"hosts": hosts, "edges": [list(e) for e in edges]}}


def test_low_sensitivity_hosts_are_exposed_by_default(environment):
    # sample topology: H1 low (DMZ), H2 high (internal)
    assert environment.hosts["H1"].exposed is True
    assert environment.hosts["H2"].exposed is False


def test_explicit_exposed_field_overrides_default():
    env = Environment(_topo({
        "WEB": {"sensitivity": "high", "exposed": True},
        "WS": {"sensitivity": "low"},
    }))
    assert env.hosts["WEB"].exposed is True
    assert env.hosts["WS"].exposed is False


def test_topology_without_low_hosts_is_fully_exposed():
    env = Environment(_topo({"A": {"sensitivity": "high"}, "B": {"sensitivity": "medium"}}))
    assert all(h.exposed for h in env.hosts.values())


def test_internal_host_reachable_only_through_foothold(environment):
    assert environment.is_reachable("H1")
    assert not environment.is_reachable("H2")
    environment.hosts["H1"].is_compromised = True
    assert environment.is_reachable("H2")


def test_isolated_host_is_unreachable(environment):
    environment.step(None, {"action": "isolate", "target": "H1"})
    assert not environment.is_reachable("H1")


def test_exploit_requires_scan(red_agent):
    assert red_agent.exploit("H1")["reason"] == "not_scanned"


def test_exploit_requires_reachability(red_agent):
    red_agent.scan("H2")
    assert red_agent.exploit("H2")["reason"] == "not_reachable"


def test_exploit_internal_host_after_foothold(red_agent, environment):
    red_agent.scan("H2")
    environment.hosts["H1"].is_compromised = True
    random.seed(0)
    results = [red_agent.exploit("H2") for _ in range(10)]
    assert all(r.get("reason") is None for r in results)
    assert any(r["success"] for r in results)

