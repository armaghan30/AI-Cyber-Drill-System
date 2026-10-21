import pytest

from orchestrator.verdict import (
    NIST_CITATION,
    drill_outcome,
    is_breach,
    nist_likelihood,
    simulation_outcome,
)


def _hosts(n, compromised=0, exfiltrated=0):
    return {
        f"H{i}": {"is_compromised": i < compromised, "data_exfiltrated": i < exfiltrated}
        for i in range(n)
    }


def test_clean_network_is_defended():
    v = drill_outcome(_hosts(10))
    assert v["outcome"] == "defended" and "winner" not in v
    assert v["reason"] == "no data stolen · 0/10 hosts compromised (limit 20%)"


def test_exactly_20_percent_compromised_is_defended():
    assert not is_breach(_hosts(10, compromised=2))


def test_over_20_percent_compromised_is_breached():
    v = drill_outcome(_hosts(10, compromised=3))
    assert v["outcome"] == "breached"
    assert v["reason"] == "no data stolen · 3/10 hosts compromised (over 20%)"
    assert v["hosts_compromised"] == 3 and v["hosts_total"] == 10


def test_any_exfiltration_is_breached():
    # data was stolen even though the host is no longer compromised (e.g. Blue restored it)
    hosts = _hosts(50)
    hosts["H7"]["data_exfiltrated"] = True
    v = drill_outcome(hosts)
    assert v["outcome"] == "breached" and v["hosts_exfiltrated"] == 1
    assert v["exfiltrated_hosts"] == ["H7"] and v["reason"] == "data stolen from H7 · 0/50 hosts compromised"


def test_empty_network_is_defended():
    assert not is_breach({})


def test_simulation_without_final_state_has_no_verdict():
    assert simulation_outcome(None) is None
    assert simulation_outcome({"hosts": {}}) is None


def test_simulation_outcome_reads_final_state():
    v = simulation_outcome({"step": 5, "hosts": _hosts(4, compromised=1)})
    assert v["outcome"] == "breached"  # 1/4 = 25%


def test_restore_keeps_breach_on_record(orchestrator):
    env = orchestrator.environment
    h1 = env.hosts["H1"]
    h1.is_compromised, h1.access_level, h1.data_exfiltrated = True, "root", True
    env.step(None, {"action": "restore", "target": "H1"})
    assert is_breach(env._snapshot()["hosts"])


@pytest.mark.parametrize("rate, level", [
    (0, "Very Low"), (4, "Very Low"),
    (5, "Low"), (20, "Low"),
    (21, "Moderate"), (79, "Moderate"),
    (80, "High"), (95, "High"),
    (96, "Very High"), (100, "Very High"),
])
def test_nist_table_g4_boundaries(rate, level):
    assert nist_likelihood(rate)["level"] == level


@pytest.mark.parametrize("rate, level", [
    (100 / 30, "Very Low"),     # 1/30 drills = 3.33% -> 3
    (4.5, "Low"),               # half rounds up -> 5
    (20.4, "Low"),              # -> 20
    (20.5, "Moderate"),         # -> 21
    (7 / 30 * 100, "Moderate"), # 23.3% -> 23
    (95.4, "High"),
    (29 / 30 * 100, "Very High"),  # 96.7% -> 97
])
def test_nist_fractional_rates_round_half_up(rate, level):
    assert nist_likelihood(rate)["level"] == level


def test_nist_result_carries_citation_and_description():
    r = nist_likelihood(50)
    assert r["range"] == "21-79" and r["description"].startswith("somewhat likely")
    assert r["citation"] == NIST_CITATION and "Table G-4" in r["citation"]
    assert r["breach_rate"] == 50.0


@pytest.mark.parametrize("rate", [-1, 100.1, 150])
def test_nist_rejects_out_of_range(rate):
    with pytest.raises(ValueError):
        nist_likelihood(rate)


def test_reason_lists_at_most_five_hosts():
    v = drill_outcome(_hosts(10, compromised=7, exfiltrated=7))
    assert v["reason"] == "data stolen from H0, H1, H2, H3, H4 +2 more · 7/10 hosts compromised (over 20%)"
