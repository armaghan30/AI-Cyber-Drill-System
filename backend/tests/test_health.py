def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "ok"
    assert d["database"] == "connected"
    assert d["version"] == "4.0.0"
