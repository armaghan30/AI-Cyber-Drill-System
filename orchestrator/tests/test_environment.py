
def test_hosts_created(environment):
    assert "H1" in environment.hosts
    assert "H2" in environment.hosts


def test_host_initial_state(environment):
    h1 = environment.hosts["H1"]
    assert h1.is_compromised is False
    assert h1.access_level == "none"
    assert h1.is_isolated is False


def test_host_has_vulnerabilities(environment):
    h1 = environment.hosts["H1"]
    assert len(h1.vulnerabilities) > 0


def test_edges_created(environment):
    assert len(environment.edges) >= 1


def test_reset_clears_state(environment):
    # Manually compromise a host
    environment.hosts["H1"].is_compromised = True
    environment.hosts["H1"].access_level = "root"

    # Reset should restore initial state
    environment.reset()
    assert environment.hosts["H1"].is_compromised is False
    assert environment.hosts["H1"].access_level == "none"


def test_step_exploit_compromises_host(environment):
    red_action = {"action": "exploit", "success": True, "target": "H1"}
    blue_action = {"action": "idle", "target": None}

    environment.step(red_action, blue_action)

    assert environment.hosts["H1"].is_compromised is True
    assert environment.hosts["H1"].access_level == "root"


def test_step_patch_removes_vulnerability(environment):
    h1 = environment.hosts["H1"]
    initial_vuln_count = len(h1.vulnerabilities)

    red_action = {"action": "scan", "target": "H1"}
    blue_action = {"action": "patch", "target": "H1"}

    environment.step(red_action, blue_action)

    assert len(h1.vulnerabilities) == initial_vuln_count - 1


def test_step_isolate_removes_edges(environment):
    initial_edge_count = len(environment.edges)

    red_action = {"action": "scan", "target": "H1"}
    blue_action = {"action": "isolate", "target": "H1"}

    environment.step(red_action, blue_action)

    assert environment.hosts["H1"].is_isolated is True
    assert len(environment.edges) < initial_edge_count


def test_snapshot_structure(environment):
    snapshot = environment._snapshot()
    assert "step" in snapshot
    assert "timestamp" in snapshot
    assert "hosts" in snapshot
    assert "edges" in snapshot
    assert "H1" in snapshot["hosts"]
