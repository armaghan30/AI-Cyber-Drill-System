def _make_scenario(client):
    r = client.post("/api/scenarios/", json={"name": "Sim Test", "filename": "sample_topology.yaml"})
    return r.json()["id"]


def test_full_run(client):
    sid = _make_scenario(client)
    r = client.post("/api/simulations/run", json={"scenario_id": sid, "max_steps": 5})
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "completed"
    assert d["total_steps"] == 5
    assert len(d["steps"]) == 5
    assert "red_action" in d["steps"][0]


def test_step_by_step(client):
    sid = _make_scenario(client)
    r = client.post("/api/simulations/", json={"scenario_id": sid, "max_steps": 3})
    assert r.status_code == 201
    sess = r.json()["session_id"]
    assert r.json()["status"] == "running"

    for i in range(3):
        r = client.post(f"/api/simulations/{sess}/step")
        assert r.status_code == 200
        assert r.json()["step"]["step_number"] == i + 1

    assert r.json()["simulation_status"] == "completed"
    assert r.json()["steps_remaining"] == 0


def test_step_after_done(client):
    sid = _make_scenario(client)
    r = client.post("/api/simulations/", json={"scenario_id": sid, "max_steps": 1})
    sess = r.json()["session_id"]
    client.post(f"/api/simulations/{sess}/step")
    r = client.post(f"/api/simulations/{sess}/step")
    assert r.status_code == 400


def test_list(client):
    sid = _make_scenario(client)
    client.post("/api/simulations/run", json={"scenario_id": sid, "max_steps": 3})
    r = client.get("/api/simulations/")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_get_detail(client):
    sid = _make_scenario(client)
    r = client.post("/api/simulations/run", json={"scenario_id": sid, "max_steps": 3})
    sim_id = r.json()["id"]
    r = client.get(f"/api/simulations/{sim_id}")
    assert r.status_code == 200
    assert len(r.json()["steps"]) == 3


def test_bad_scenario(client):
    r = client.post("/api/simulations/run", json={"scenario_id": 999, "max_steps": 5})
    assert r.status_code == 400
