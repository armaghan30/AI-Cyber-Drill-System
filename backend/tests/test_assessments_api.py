import pytest

from backend.models.assessment import Assessment, AssessmentStatus
from backend.models.scenario import Scenario
from backend.services import assessment_service
from backend.tests.conftest import FIXTURE_TOPO, TestSession
from orchestrator.adversarial import RANDOM


def _make_scenario(client):
    with open(FIXTURE_TOPO, "rb") as f:
        r = client.post("/api/scenarios/upload", files={"file": ("test_topology.yaml", f, "application/octet-stream")})
    return r.json()["id"]


@pytest.fixture
def inline_jobs(monkeypatch):
    """Run the worker straight away with random agents instead of in a thread with real models."""
    monkeypatch.setattr(assessment_service, "SessionLocal", TestSession)
    monkeypatch.setattr(assessment_service, "_model_paths", lambda topo: (RANDOM, RANDOM))
    monkeypatch.setattr(assessment_service, "_start_thread",
                        lambda *args: assessment_service._worker(*args))


def test_assessment_runs_and_is_saved(client, db_session, inline_jobs):
    sid = _make_scenario(client)
    r = client.post("/api/assessments/", json={"scenario_id": sid, "drills": 5, "steps": 6})
    assert r.status_code == 202
    aid = r.json()["id"]

    db_session.expire_all()
    a = client.get(f"/api/assessments/{aid}").json()
    assert a["status"] == "completed"
    assert a["progress_done"] == a["progress_total"] == 15
    modes = a["result"]["modes"]
    assert set(modes) == {"current_security", "ai_defence"}
    for m in modes.values():
        assert m["drills"] == 5 and m["nist"]["level"] and "runs" not in m
    assert "Table G-4" in a["result"]["citation"]
    pb = a["result"]["playbook"]
    assert pb["drills"] == 5 and {"immediate", "hardening", "incident_response", "gaps"} <= set(pb)
    wi = a["result"]["what_if"]
    assert wi["before"]["breach_rate"] == modes["current_security"]["breach_rate"]
    assert wi["caveat"] and len(wi["fixes"]) <= 10
    if wi["fixes"]:
        assert wi["after"]["drills"] == 5

    row = db_session.get(Assessment, aid)
    assert len(row.result["modes"]["ai_defence"]["runs"]) == 5

    latest = client.get(f"/api/assessments/latest?scenario_id={sid}").json()
    assert latest["id"] == aid
    listed = client.get(f"/api/assessments/?scenario_id={sid}").json()
    assert [x["id"] for x in listed] == [aid]


def test_latest_404_before_any_assessment(client):
    sid = _make_scenario(client)
    assert client.get(f"/api/assessments/latest?scenario_id={sid}").status_code == 404


def test_running_assessment_is_reused(client, db_session, monkeypatch):
    sid = _make_scenario(client)
    running = Assessment(scenario_id=sid, user_id=1, status=AssessmentStatus.RUNNING,
                         drills_per_mode=30, steps=15, progress_total=60)
    db_session.add(running)
    db_session.commit()
    monkeypatch.setattr(assessment_service, "_start_thread", lambda *a: pytest.fail("started a second job"))
    r = client.post("/api/assessments/", json={"scenario_id": sid})
    assert r.status_code == 202 and r.json()["id"] == running.id


def test_no_trained_models_gives_400(client):
    sid = _make_scenario(client)
    r = client.post("/api/assessments/", json={"scenario_id": sid})
    assert r.status_code == 400 and "Train" in r.json()["detail"]


def test_other_users_scenario_is_hidden(client, db_session, inline_jobs):
    other = Scenario(name="someone else", filename="x.yaml", num_hosts=2, user_id=2)
    db_session.add(other)
    db_session.commit()
    assert client.post("/api/assessments/", json={"scenario_id": other.id}).status_code == 404

    theirs = Assessment(scenario_id=other.id, user_id=2, status=AssessmentStatus.COMPLETED,
                        drills_per_mode=5, steps=5)
    db_session.add(theirs)
    db_session.commit()
    assert client.get(f"/api/assessments/{theirs.id}").status_code == 404


@pytest.mark.parametrize("body", [{"drills": 2}, {"drills": 500}, {"steps": 1}])
def test_invalid_settings_rejected(client, body):
    sid = _make_scenario(client)
    assert client.post("/api/assessments/", json={"scenario_id": sid, **body}).status_code == 422


def test_failed_run_keeps_the_error(client, db_session, inline_jobs, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("model file is broken")
    monkeypatch.setattr(assessment_service, "run_assessment", boom)
    sid = _make_scenario(client)
    aid = client.post("/api/assessments/", json={"scenario_id": sid, "drills": 5}).json()["id"]
    db_session.expire_all()
    a = client.get(f"/api/assessments/{aid}").json()
    assert a["status"] == "failed" and "broken" in a["error_message"]


def test_unfinished_assessments_marked_failed_on_restart(db_session):
    for status in (AssessmentStatus.QUEUED, AssessmentStatus.RUNNING, AssessmentStatus.COMPLETED):
        db_session.add(Assessment(scenario_id=1, status=status, drills_per_mode=5, steps=5))
    db_session.commit()
    assert assessment_service.mark_interrupted(db_session) == 2
    statuses = sorted(a.status.value for a in db_session.query(Assessment).all())
    assert statuses == ["completed", "failed", "failed"]


def _story_text(result):
    from backend.services.pdf_service import _assessment_sections
    from reportlab.lib.styles import ParagraphStyle
    st = {k: ParagraphStyle(k) for k in ("h2", "h3", "body", "small")}
    story = []
    _assessment_sections(story, result, st)
    return " ".join(getattr(f, "text", "") for f in story)


def test_pdf_has_assessment_sections(client, db_session, inline_jobs):
    sid = _make_scenario(client)
    aid = client.post("/api/assessments/", json={"scenario_id": sid, "drills": 5}).json()["id"]
    r = client.get(f"/api/reports/scenarios/{sid}/pdf")
    assert r.status_code == 200 and r.content[:4] == b"%PDF"

    result = assessment_service.public_result(db_session.get(Assessment, aid).result)
    text = _story_text(result)
    for heading in ("2. Security Assessment", "3. AI Defence Playbook", "4. What-if Hardening", "Table G-4"):
        assert heading in text


def test_pdf_without_assessment_says_so(client):
    sid = _make_scenario(client)
    assert client.get(f"/api/reports/scenarios/{sid}/pdf").status_code == 200
    assert "No security assessment has been run" in _story_text(None)
