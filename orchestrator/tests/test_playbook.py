from orchestrator.playbook import build_playbook, load_host_info
from orchestrator.tests.conftest import TOPOLOGY_4HOST


def _s(n, blue="idle", blue_target=None, red="idle", red_target=None, success=False, cve=None, detected=None):
    r = {"action": red, "target": red_target, "success": success}
    if cve:
        r["cve"] = cve
    b = {"action": blue, "target": blue_target}
    if detected is not None:
        b["detected"] = detected
    return {"step": n, "red": r, "blue": b}


def _host(compromised=False, stolen=False):
    return {"is_compromised": compromised, "data_exfiltrated": stolen}


def _drill(trace, ever=(), stolen=()):
    hosts = {h: _host(h in ever, h in stolen) for h in ("A", "B", "C")}
    return {"trace": trace, "final_hosts": hosts, "ever_compromised": list(ever)}


def _result(ai_runs, cur_runs=None):
    modes = {"ai_defence": {"runs": ai_runs}}
    if cur_runs is not None:
        modes["current_security"] = {"runs": cur_runs}
    return {"modes": modes}


AI = [
    _drill([_s(1, "deploy_firewall", "A"), _s(2, "harden", "B"),
            _s(3, red="exploit", red_target="C", success=True, cve="CVE-9")], ever=["C"], stolen=["C"]),
    _drill([_s(1, "deploy_firewall", "A"), _s(2, "deploy_firewall", "A"), _s(3, "patch", "B")], ever=["A"]),
    _drill([_s(1, "harden", "B"), _s(2, "deploy_firewall", "A")]),
]
CURRENT = [_drill([], ever=["A", "C"], stolen=["A"]) for _ in range(3)]


def test_immediate_priorities_ranked_by_drills():
    pb = build_playbook(_result(AI, CURRENT))
    first = pb["immediate"][0]
    assert (first["action"], first["host"], first["drills"], first["typical_step"]) == ("deploy_firewall", "A", 3, 1)
    assert first["advice"] == "Deploy a firewall on A"
    assert ("harden", "B") in [(i["action"], i["host"]) for i in pb["immediate"]]


def test_hardening_shows_before_and_after():
    pb = build_playbook(_result(AI, CURRENT), host_info={"A": {"sensitivity": "high"}})
    a = next(i for i in pb["hardening"] if i["host"] == "A")
    assert a["drills"] == 3 and a["actions"] == {"deploy_firewall": 3}
    assert (a["compromised_before"], a["compromised_after"]) == (3, 1)
    assert (a["stolen_before"], a["stolen_after"]) == (3, 0)
    assert a["sensitivity"] == "high"
    b = next(i for i in pb["hardening"] if i["host"] == "B")
    assert b["actions"] == {"patch": 1, "harden": 2} and b["advice"] == "Harden B"


def test_hardening_without_current_security_mode():
    pb = build_playbook(_result(AI))
    assert "compromised_before" not in pb["hardening"][0]


def test_gaps_list_hosts_still_breached_with_their_cves():
    pb = build_playbook(_result(AI, CURRENT))
    gap = pb["gaps"][0]
    assert (gap["host"], gap["stolen"], gap["protected_drills"], gap["cves_used"]) == ("C", 1, 0, ["CVE-9"])
    assert gap["advice"] == "Patch CVE-9 on C"
    assert [g["host"] for g in pb["gaps"]] == ["C", "A"]


def test_incident_response_counts_follow_ups():
    runs = [
        _drill([_s(1, "detect", "A", detected=True), _s(2, "isolate", "A")], ever=["A"]),
        _drill([_s(1, "detect", "A", detected=True), _s(2), _s(3), _s(4), _s(5, "restore", "A")],
               ever=["A"], stolen=["A"]),
        _drill([_s(1, "detect", "B", detected=False)]),
    ]
    ir = build_playbook(_result(runs))["incident_response"]
    assert ir["counts"] == {"detect": 3, "isolate": 1, "restore": 1}
    assert ir["detections"] == 2 and ir["detections_followed_up"] == 1
    assert ir["isolate_or_restore"] == 2 and ir["data_stolen_anyway"] == 1


def test_incident_response_note_when_never_used():
    ir = build_playbook(_result(AI, CURRENT))["incident_response"]
    assert ir["counts"] == {"detect": 0, "isolate": 0, "restore": 0}
    assert "never used" in ir["note"] and "prevention" in ir["note"]


def test_no_ai_runs_means_no_playbook():
    assert build_playbook({"modes": {"current_security": {"runs": CURRENT}}}) is None
    assert build_playbook(None) is None


def test_host_info_from_topology():
    info = load_host_info(TOPOLOGY_4HOST)
    assert len(info) == 4
    h = next(iter(info.values()))
    assert set(h) == {"os", "services", "sensitivity", "exposed"}
