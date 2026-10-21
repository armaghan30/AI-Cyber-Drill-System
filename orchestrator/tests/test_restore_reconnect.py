import numpy as np

from orchestrator.action_masks import blue_action_mask


def _isolate(env, host):
    env.step(None, {"action": "isolate", "target": host})


def _restore(env, host):
    env.step(None, {"action": "restore", "target": host})


def _linked(env, a, b):
    return any(set(e) == {a, b} for e in env.edges)


def test_restore_reconnects_isolated_host(environment):
    environment.hosts["H1"].is_compromised = True
    _isolate(environment, "H1")
    assert not _linked(environment, "H1", "H2")

    _restore(environment, "H1")
    h1 = environment.hosts["H1"]
    assert h1.is_isolated is False and h1.is_compromised is False
    assert _linked(environment, "H1", "H2")


def test_restore_waits_for_isolated_neighbour(environment):
    _isolate(environment, "H1")
    _isolate(environment, "H2")

    _restore(environment, "H1")
    assert not _linked(environment, "H1", "H2")  # H2 is still quarantined

    _restore(environment, "H2")
    assert _linked(environment, "H1", "H2")
    assert len(environment.edges) == len(environment.base_edges)


def test_restore_does_not_duplicate_edges(environment):
    n_edges = len(environment.edges)
    _restore(environment, "H1")  # not isolated: links untouched
    _isolate(environment, "H1")
    _restore(environment, "H1")
    _restore(environment, "H1")
    assert len(environment.edges) == n_edges


def test_reconnected_host_is_reachable_by_lateral_move(red_agent, environment):
    _isolate(environment, "H2")
    _restore(environment, "H2")
    environment.hosts["H1"].is_compromised = True
    result = red_agent.lateral_move("H2")
    assert result["source"] == "H1"
    assert result.get("reason") not in ("target_isolated", "no_adjacent_compromised")


def test_blue_mask_restore_then_isolate_again(environment):
    hosts = list(environment.hosts)
    n, i = len(hosts), hosts.index("H1")
    _isolate(environment, "H1")
    m = blue_action_mask(environment, hosts)
    assert m[2 * n + i] and not m[n + i]       # restore allowed, isolate not
    _restore(environment, "H1")
    m = blue_action_mask(environment, hosts)
    assert not m[2 * n + i] and m[n + i]       # back to normal: can be isolated again


def test_reset_restores_original_links(environment):
    base = [list(e) for e in environment.base_edges]
    _isolate(environment, "H1")
    environment.reset()
    assert [list(e) for e in environment.edges] == base
    assert np.all([not h.is_isolated for h in environment.hosts.values()])
