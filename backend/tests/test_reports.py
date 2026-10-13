from backend.tests.conftest import FIXTURE_TOPO


def _make_scenario(client):
    with open(FIXTURE_TOPO, "rb") as f:
        r = client.post("/api/scenarios/upload", files={"file": ("test_topology.yaml", f, "application/octet-stream")})
    return r.json()["id"]


def test_dashboard(client):
    r = client.get("/api/reports/dashboard")
    assert r.status_code == 200
    d = r.json()
    assert "total_simulations" in d
    assert "completed_simulations" in d


def test_sim_summary(client):
    sid = _make_scenario(client)
    r = client.post("/api/simulations/run", json={"scenario_id": sid, "max_steps": 5})
    sim_id = r.json()["id"]

    r = client.get(f"/api/reports/simulations/{sim_id}/summary")
    assert r.status_code == 200
    d = r.json()
    assert d["total_steps"] == 5
    assert "winner" in d
    assert d["winner"] in ("red", "blue")


def test_summary_404(client):
    assert client.get("/api/reports/simulations/999/summary").status_code == 404


def test_pdf_download(client):
    sid = _make_scenario(client)
    client.post("/api/simulations/run", json={"scenario_id": sid, "max_steps": 5})
    r = client.get(f"/api/reports/scenarios/{sid}/pdf")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
