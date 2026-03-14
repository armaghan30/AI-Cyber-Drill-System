def test_discover(client):
    r = client.get("/api/scenarios/discover")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert any(t["filename"] == "sample_topology.yaml" for t in r.json())


def test_create_and_get(client):
    r = client.post("/api/scenarios/", json={
        "name": "Test 2-Host", "filename": "sample_topology.yaml",
        "description": "Basic two-host topology",
    })
    assert r.status_code == 201
    d = r.json()
    assert d["name"] == "Test 2-Host"
    assert d["num_hosts"] == 2

    r = client.get(f"/api/scenarios/{d['id']}")
    assert r.status_code == 200
    detail = r.json()
    assert "H1" in detail["host_names"]
    assert "H2" in detail["host_names"]


def test_list(client):
    client.post("/api/scenarios/", json={"name": "Scenario A", "filename": "sample_topology.yaml"})
    r = client.get("/api/scenarios/")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_update(client):
    r = client.post("/api/scenarios/", json={"name": "Original", "filename": "sample_topology.yaml"})
    sid = r.json()["id"]
    r = client.patch(f"/api/scenarios/{sid}", json={"name": "Updated"})
    assert r.status_code == 200
    assert r.json()["name"] == "Updated"


def test_delete(client):
    r = client.post("/api/scenarios/", json={"name": "ToDelete", "filename": "sample_topology.yaml"})
    sid = r.json()["id"]
    assert client.delete(f"/api/scenarios/{sid}").status_code == 204
    assert client.get(f"/api/scenarios/{sid}").status_code == 404


def test_bad_file(client):
    r = client.post("/api/scenarios/", json={"name": "Bad", "filename": "nonexistent.yaml"})
    assert r.status_code == 404


def test_not_found(client):
    assert client.get("/api/scenarios/999").status_code == 404
