import os

import pytest

from orchestrator.adversarial import RANDOM
from orchestrator.assessment import (AI_DEFENCE, CURRENT_SECURITY, run_assessment, run_drill,
                                     summarise_mode, wilson_interval)
from orchestrator.tests.conftest import TOPOLOGY_4HOST
from orchestrator.verdict import NIST_CITATION

MODELS_DIR = os.path.join("results", "models")
RED_4HOST = os.path.join(MODELS_DIR, "maskable_ppo_red_topology_4host.zip")
BLUE_4HOST = os.path.join(MODELS_DIR, "maskable_ppo_blue_topology_4host.zip")


def _run(trace, final_hosts, ever=()):
    return {"trace": trace, "final_hosts": final_hosts, "ever_compromised": list(ever)}


def _step(n, action="idle", target=None, success=False, cve=None):
    red = {"action": action, "target": target, "success": success}
    if cve:
        red["cve"] = cve
    return {"step": n, "red": red, "blue": {"action": "idle", "target": None}}


CLEAN = {"A": {"is_compromised": False, "data_exfiltrated": False},
         "B": {"is_compromised": False, "data_exfiltrated": False}}
STOLEN = {"A": {"is_compromised": True, "data_exfiltrated": True},
          "B": {"is_compromised": False, "data_exfiltrated": False}}


def test_wilson_interval_known_values():
    assert wilson_interval(0, 30) == (0.0, 11.4)
    assert wilson_interval(30, 30) == (88.6, 100.0)
    low, high = wilson_interval(15, 30)
    assert low < 50 < high and round(50 - low, 1) == round(high - 50, 1)


def test_wilson_interval_no_drills():
    assert wilson_interval(0, 0) == (0.0, 0.0)


def test_summary_counts_rate_nist_and_hot_spots():
    drills = [
        _run([_step(1, "exploit", "A", True, "CVE-1"), _step(2, "exfiltrate", "A", True)], STOLEN, ever=["A"]),
        _run([_step(1, "exploit", "A", True, "CVE-1")], CLEAN, ever=["A"]),   # restored in time
        _run([_step(1, "exploit", "B", False)], CLEAN),
        _run([_step(1, "exploit", "B", True, "CVE-2")], CLEAN, ever=["B"]),
    ]
    s = summarise_mode(CURRENT_SECURITY, drills)
    assert (s["drills"], s["breaches"], s["defended"], s["breach_rate"]) == (4, 1, 3, 25.0)
    assert s["nist"]["level"] == "Moderate" and s["nist"]["citation"] == NIST_CITATION
    assert s["ci95"]["low"] < 25.0 < s["ci95"]["high"]
    assert s["hosts_total"] == 2
    assert s["mean_hosts_compromised"] == 0.25 and s["mean_hosts_exfiltrated"] == 0.25
    assert s["top_hosts"][0] == {"host": "A", "compromised_drills": 2, "exfiltrated_drills": 1}
    assert s["top_hosts"][1]["host"] == "B"
    assert s["top_cves"][0] == {"cve": "CVE-1", "drills": 2, "exploits": 2, "hosts": ["A"]}
    assert [c["cve"] for c in s["top_cves"]] == ["CVE-1", "CVE-2"]


def test_idle_blue_never_acts():
    d = run_drill(TOPOLOGY_4HOST, RANDOM, None, steps=10)
    assert len(d["trace"]) == 10
    assert all(s["blue"]["action"] == "idle" for s in d["trace"])
    assert len(d["final_hosts"]) == 4


def test_successful_exploit_records_the_cve():
    found = False
    for _ in range(20):
        d = run_drill(TOPOLOGY_4HOST, RANDOM, None, steps=15)
        for s in d["trace"]:
            if s["red"]["action"] == "exploit" and s["red"]["success"]:
                assert s["red"]["cve"].startswith("CVE-")
                assert s["red"]["target"] in d["ever_compromised"]
                found = True
        if found:
            break
    assert found


def test_assessment_with_random_agents_has_both_modes():
    calls = []
    r = run_assessment(TOPOLOGY_4HOST, RANDOM, RANDOM, drills=4, steps=8, seed=1,
                       progress=lambda done, total: calls.append((done, total)))
    assert calls == [(i, 8) for i in range(1, 9)]
    assert set(r["modes"]) == {CURRENT_SECURITY, AI_DEFENCE}
    assert r["drills_per_mode"] == 4 and r["steps"] == 8 and r["citation"] == NIST_CITATION
    for mode in r["modes"].values():
        assert mode["drills"] == 4 and len(mode["runs"]) == 4
        assert mode["breaches"] + mode["defended"] == 4
        assert 0 <= mode["breach_rate"] <= 100 and mode["nist"]["level"]
    cur, ai = r["modes"][CURRENT_SECURITY], r["modes"][AI_DEFENCE]
    assert r["breach_rate_reduction"] == round(cur["breach_rate"] - ai["breach_rate"], 1)
    assert all(s["blue"]["action"] == "idle" for d in cur["runs"] for s in d["trace"])


def test_same_seed_gives_same_assessment():
    a = run_assessment(TOPOLOGY_4HOST, RANDOM, RANDOM, drills=3, steps=8, seed=7)
    b = run_assessment(TOPOLOGY_4HOST, RANDOM, RANDOM, drills=3, steps=8, seed=7)
    strip = lambda r: {m: [d["trace"] for d in v["runs"]] for m, v in r["modes"].items()}
    assert strip(a) == strip(b)


def test_current_security_only_needs_no_blue():
    r = run_assessment(TOPOLOGY_4HOST, RANDOM, None, drills=2, steps=5, modes=(CURRENT_SECURITY,))
    assert list(r["modes"]) == [CURRENT_SECURITY] and "breach_rate_reduction" not in r


@pytest.mark.parametrize("kwargs", [
    {"red": None, "blue": RANDOM},
    {"red": RANDOM, "blue": None},
    {"red": RANDOM, "blue": RANDOM, "modes": ("winner",)},
])
def test_invalid_assessment_arguments(kwargs):
    with pytest.raises(ValueError):
        run_assessment(TOPOLOGY_4HOST, drills=1, steps=1, **kwargs)


@pytest.mark.skipif(not (os.path.exists(RED_4HOST) and os.path.exists(BLUE_4HOST)),
                    reason="trained 4-host models not present")
def test_assessment_with_trained_4host_models():
    r = run_assessment(TOPOLOGY_4HOST, RED_4HOST, BLUE_4HOST, drills=3, steps=15, seed=0)
    for mode in r["modes"].values():
        assert mode["drills"] == 3 and mode["hosts_total"] == 4
        assert {s["red"]["action"] for d in mode["runs"] for s in d["trace"]} <= {
            "scan", "exploit", "escalate", "lateral_move", "exfiltrate", "idle"}


@pytest.mark.skipif(not os.path.exists(RED_4HOST), reason="trained 4-host models not present")
def test_loading_models_does_not_freeze_the_random_numbers():
    traces = lambda r: [d["trace"] for d in r["modes"][CURRENT_SECURITY]["runs"]]
    run = lambda seed: run_assessment(TOPOLOGY_4HOST, RED_4HOST, None, drills=4, steps=15,
                                      modes=(CURRENT_SECURITY,), seed=seed)
    assert traces(run(11)) == traces(run(11))
    assert traces(run(None)) != traces(run(None))
