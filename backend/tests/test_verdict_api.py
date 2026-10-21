from datetime import datetime, timezone

from backend.models.scenario import Scenario
from backend.models.simulation import Simulation, SimulationStatus
from backend.tests.conftest import FIXTURE_TOPO
from orchestrator.verdict import drill_outcome


def _make_scenario(client):
    with open(FIXTURE_TOPO, "rb") as f:
        r = client.post("/api/scenarios/upload", files={"file": ("test_topology.yaml", f, "application/octet-stream")})
    return r.json()["id"]


def _hosts(compromised, exfiltrated=False):
    # 2-host fixture network
    return {
        "H1": {"is_compromised": compromised, "data_exfiltrated": exfiltrated},
        "H2": {"is_compromised": False, "data_exfiltrated": False},
    }


def _stored_sim(db, scenario_id, red, blue, hosts, session):
    sim = Simulation(
        scenario_id=scenario_id, user_id=1, session_id=session,
        status=SimulationStatus.COMPLETED, max_steps=5, total_steps=5,
        total_red_reward=red, total_blue_reward=blue,
        final_state={"hosts": hosts}, completed_at=datetime.now(timezone.utc),
    )
    db.add(sim)
    db.commit()
    db.refresh(sim)
    return sim


def test_drill_result_has_breach_verdict(client):
    sid = _make_scenario(client)
    d = client.post("/api/simulations/run", json={"scenario_id": sid, "max_steps": 5}).json()
    expected = drill_outcome(d["final_state"]["hosts"])
    assert d["outcome"] == expected["outcome"]
    assert d["reason"] == expected["reason"] and "winner" not in d
    assert d["verdict"]["hosts_total"] == 2

    listed = client.get("/api/simulations/").json()[0]
    assert listed["outcome"] == d["outcome"] and listed["reason"] == d["reason"]


def test_verdict_ignores_reward_totals(client, db_session):
    sid = _make_scenario(client)
    # Red has the far bigger score, but nothing was compromised -> DEFENDED
    sim = _stored_sim(db_session, sid, red=500.0, blue=10.0, hosts=_hosts(False), session="a" * 36)

    for path in (f"/api/reports/simulations/{sim.id}/summary", f"/api/reports/simulations/{sim.id}/report"):
        d = client.get(path).json()
        assert d["outcome"] == "defended" and d["reason"] == "no data stolen · 0/2 hosts compromised (limit 20%)"
        assert d["total_red_reward"] == 500.0  # training rewards are still reported
        assert "winner" not in d

    assert client.get(f"/api/simulations/{sim.id}").json()["outcome"] == "defended"


def test_breach_despite_low_red_reward(client, db_session):
    sid = _make_scenario(client)
    sim = _stored_sim(db_session, sid, red=-20.0, blue=300.0, hosts=_hosts(True, exfiltrated=True), session="b" * 36)
    d = client.get(f"/api/reports/simulations/{sim.id}/summary").json()
    assert d["outcome"] == "breached" and d["reason"].startswith("data stolen from H1")


def test_defense_analysis_counts_outcomes(client, db_session):
    sid = _make_scenario(client)
    _stored_sim(db_session, sid, red=500.0, blue=10.0, hosts=_hosts(False), session="c" * 36)
    _stored_sim(db_session, sid, red=5.0, blue=90.0, hosts=_hosts(True), session="d" * 36)
    _stored_sim(db_session, sid, red=50.0, blue=40.0, hosts=_hosts(False), session="e" * 36)

    d = client.get("/api/reports/defense-analysis").json()
    assert d["drills_defended"] == 2 and d["drills_breached"] == 1
    assert d["defended_rate"] == 66.7 and d["breach_rate"] == 33.3
    assert {s["outcome"] for s in d["recent_simulations"]} == {"breached", "defended"}
    assert all(s["reason"] for s in d["recent_simulations"])


def test_pdf_uses_verdict(client, db_session):
    sid = _make_scenario(client)
    _stored_sim(db_session, sid, red=500.0, blue=10.0, hosts=_hosts(False), session="f" * 36)
    r = client.get(f"/api/reports/scenarios/{sid}/pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
