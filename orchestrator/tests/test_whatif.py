import copy

from orchestrator.adversarial import RANDOM
from orchestrator.assessment import run_assessment
from orchestrator.env_builder import Environment
from orchestrator.playbook import build_playbook
from orchestrator.tests.conftest import TOPOLOGY_4HOST
from orchestrator.whatif import CAVEAT, apply_fixes, run_what_if, select_fixes
from orchestrator.yaml_loader import YAMLLoader


def _topology():
    return YAMLLoader(TOPOLOGY_4HOST).parse()


def _exploit(n, host, cve):
    return {"step": n, "red": {"action": "exploit", "target": host, "success": True, "cve": cve},
            "blue": {"action": "idle", "target": None}}


def _drill(trace, ever=(), stolen=()):
    hosts = {h: {"is_compromised": h in ever, "data_exfiltrated": h in stolen} for h in ("H1", "H2", "H3", "H4")}
    return {"trace": trace, "final_hosts": hosts, "ever_compromised": list(ever)}


def test_firewall_active_field_switches_firewall_on():
    topo = _topology()
    topo["network"]["hosts"]["H2"]["firewall_active"] = True
    env = Environment(topo)
    assert env.hosts["H2"].firewall_active and env.firewall_engine.is_active("H2")
    assert not env.firewall_engine.is_active("H1")
    env.reset()
    assert env.firewall_engine.is_active("H2")


def test_topologies_without_the_field_are_unchanged():
    env = Environment(_topology())
    assert not any(h.firewall_active for h in env.hosts.values())


def test_apply_fixes_only_changes_the_copy():
    topo = _topology()
    original = copy.deepcopy(topo)
    hardened = apply_fixes(topo, [{"kind": "patch", "host": "H1"}, {"kind": "firewall", "host": "H4"}])
    assert topo == original
    assert hardened["network"]["hosts"]["H1"]["vulnerabilities"] == []
    assert hardened["network"]["hosts"]["H4"]["firewall_active"] is True
    assert hardened["network"]["hosts"]["H2"] == original["network"]["hosts"]["H2"]


def test_fixes_ranked_by_damage_and_limited():
    current = [
        _drill([_exploit(1, "H1", "CVE-2021-34527")], ever=["H1", "H2"], stolen=["H1"]),
        _drill([_exploit(1, "H1", "CVE-2021-34527")], ever=["H1"]),
    ]
    result = {"modes": {"current_security": {"runs": current}}}
    playbook = {"immediate": [{"action": "deploy_firewall", "host": "H4"}],
                "hardening": [{"host": "H2", "actions": {"deploy_firewall": 2}},
                              {"host": "H3", "actions": {"harden": 1}}]}
    fixes = select_fixes(result, playbook, _topology(), k=10)
    keys = [(f["kind"], f["host"]) for f in fixes]
    # H1 was exploited (3 damage), H2 reached sideways (1), the rest only chosen by Blue
    assert keys == [("patch", "H1"), ("firewall", "H2"), ("firewall", "H4"), ("patch", "H3")]
    assert fixes[0]["cves"] == ["CVE-2021-34527", "CVE-2020-0796", "CVE-2017-0144"]
    assert fixes[0]["reason"].startswith("compromised in 2/2 drills, data stolen in 1/2")
    assert fixes[2]["reason"] == "chosen early by the AI defender"
    assert len(set(keys)) == len(keys)
    assert len(select_fixes(result, playbook, _topology(), k=2)) == 2


def test_no_patch_for_host_without_cves_or_firewall_already_on():
    topo = _topology()
    topo["network"]["hosts"]["H1"]["vulnerabilities"] = []
    topo["network"]["hosts"]["H2"]["firewall_active"] = True
    result = {"modes": {"current_security": {"runs": [_drill([_exploit(1, "H1", "CVE-X")], ever=["H1"])]}}}
    playbook = {"hardening": [{"host": "H2", "actions": {"deploy_firewall": 1}}]}
    assert select_fixes(result, playbook, topo) == []


def test_what_if_before_and_after():
    result = run_assessment(TOPOLOGY_4HOST, RANDOM, RANDOM, drills=4, steps=10, seed=3)
    playbook = build_playbook(result)
    calls = []
    wi = run_what_if(TOPOLOGY_4HOST, RANDOM, result, playbook, k=10, drills=4, steps=10,
                     progress=lambda d, t: calls.append(d))
    assert wi["caveat"] == CAVEAT
    assert wi["before"]["breach_rate"] == result["modes"]["current_security"]["breach_rate"]
    if wi["fixes"]:
        assert wi["after"]["drills"] == 4 and calls == [1, 2, 3, 4]
        assert wi["breach_rate_change"] == round(wi["after"]["breach_rate"] - wi["before"]["breach_rate"], 1)
        assert "runs" not in wi["after"]


def test_patching_every_host_stops_exploits():
    result = run_assessment(TOPOLOGY_4HOST, RANDOM, None, drills=3, steps=10, modes=("current_security",))
    topo = _topology()
    fixes = [{"kind": "patch", "host": h} for h in topo["network"]["hosts"]]
    env = Environment(apply_fixes(topo, fixes))
    assert all(not h.vulnerabilities for h in env.hosts.values())
    assert result["modes"]["current_security"]["drills"] == 3


def test_one_fix_per_host_patch_wins_where_red_used_a_cve():
    result = {"modes": {"current_security": {"runs": [_drill([_exploit(1, "H1", "CVE-2021-34527")], ever=["H1"])]}}}
    playbook = {"hardening": [{"host": "H1", "actions": {"deploy_firewall": 1}}]}
    assert [(f["kind"], f["host"]) for f in select_fixes(result, playbook, _topology())] == [("patch", "H1")]


def test_remaining_entry_points_after_fixes():
    from orchestrator.whatif import remaining_entry_points
    topo = _topology()  # no exposed field: low-sensitivity H1 is the internet-facing host
    assert [e["host"] for e in remaining_entry_points(topo)] == ["H1"]
    hardened = apply_fixes(topo, [{"kind": "patch", "host": "H1"}])
    assert remaining_entry_points(hardened) == []
    fw = apply_fixes(topo, [{"kind": "firewall", "host": "H1"}])
    assert remaining_entry_points(fw)[0]["firewall"] is True


def test_what_if_reports_entry_points():
    result = run_assessment(TOPOLOGY_4HOST, RANDOM, RANDOM, drills=3, steps=8, seed=5)
    wi = run_what_if(TOPOLOGY_4HOST, RANDOM, result, build_playbook(result), drills=3, steps=8)
    assert "remaining_entry_points" in wi and wi["entry_points_note"]
