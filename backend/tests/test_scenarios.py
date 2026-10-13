import io
from backend.tests.conftest import FIXTURE_TOPO


def _upload(client):
    with open(FIXTURE_TOPO, "rb") as f:
        r = client.post("/api/scenarios/upload", files={"file": ("test_topology.yaml", f, "application/octet-stream")})
    return r


def test_upload_and_get(client):
    r = _upload(client)
    assert r.status_code == 201
    d = r.json()
    assert d["num_hosts"] == 2
    assert d["is_demo"] is False

    r = client.get(f"/api/scenarios/{d['id']}")
    assert r.status_code == 200
    detail = r.json()
    assert set(detail["host_names"]) == {"H1", "H2"}


def test_list(client):
    _upload(client)
    r = client.get("/api/scenarios/")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_update(client):
    sid = _upload(client).json()["id"]
    r = client.patch(f"/api/scenarios/{sid}", json={"name": "Updated"})
    assert r.status_code == 200
    assert r.json()["name"] == "Updated"


def test_delete(client):
    sid = _upload(client).json()["id"]
    assert client.delete(f"/api/scenarios/{sid}").status_code == 204
    assert client.get(f"/api/scenarios/{sid}").status_code == 404


def test_bad_file(client):
    data = io.BytesIO(b"not: valid: yaml: [[[")
    r = client.post("/api/scenarios/upload", files={"file": ("bad.yaml", data, "application/octet-stream")})
    assert r.status_code == 400


def test_not_found(client):
    assert client.get("/api/scenarios/999").status_code == 404
