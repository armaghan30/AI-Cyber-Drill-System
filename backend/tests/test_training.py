def _make_scenario(client):
    r = client.post("/api/scenarios/", json={"name": "Train Test", "filename": "sample_topology.yaml"})
    return r.json()["id"]


def test_start_training(client):
    sid = _make_scenario(client)
    r = client.post("/api/training/", json={
        "scenario_id": sid, "agent_role": "red",
        "algorithm": "dqn", "total_timesteps": 1000,
    })
    assert r.status_code == 202
    d = r.json()
    assert d["status"] in ("queued", "running")
    assert d["agent_role"] == "red"


def test_list_runs(client):
    sid = _make_scenario(client)
    client.post("/api/training/", json={
        "scenario_id": sid, "agent_role": "blue",
        "algorithm": "dqn", "total_timesteps": 1000,
    })
    r = client.get("/api/training/")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_get_run(client):
    sid = _make_scenario(client)
    r = client.post("/api/training/", json={
        "scenario_id": sid, "agent_role": "red",
        "algorithm": "dqn", "total_timesteps": 1000,
    })
    run_id = r.json()["id"]
    r = client.get(f"/api/training/{run_id}")
    assert r.status_code == 200
    assert r.json()["id"] == run_id


def test_bad_role(client):
    sid = _make_scenario(client)
    r = client.post("/api/training/", json={
        "scenario_id": sid, "agent_role": "green",
        "algorithm": "dqn", "total_timesteps": 1000,
    })
    assert r.status_code == 422


def test_bad_algo(client):
    sid = _make_scenario(client)
    r = client.post("/api/training/", json={
        "scenario_id": sid, "agent_role": "red",
        "algorithm": "invalid", "total_timesteps": 1000,
    })
    assert r.status_code == 422


def test_not_found(client):
    assert client.get("/api/training/999").status_code == 404
