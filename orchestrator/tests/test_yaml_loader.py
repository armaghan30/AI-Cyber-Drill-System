from orchestrator.yaml_loader import YAMLLoader


def test_yaml_loads_successfully():
    loader = YAMLLoader("orchestrator/sample_topology.yaml")
    data = loader.parse()
    assert data is not None


def test_yaml_has_network_key():
    loader = YAMLLoader("orchestrator/sample_topology.yaml")
    data = loader.parse()
    assert "network" in data


def test_yaml_has_hosts():
    loader = YAMLLoader("orchestrator/sample_topology.yaml")
    data = loader.parse()
    hosts = data["network"]["hosts"]
    assert len(hosts) >= 2
    assert "H1" in hosts
    assert "H2" in hosts


def test_yaml_has_edges():
    loader = YAMLLoader("orchestrator/sample_topology.yaml")
    data = loader.parse()
    edges = data["network"]["edges"]
    assert len(edges) >= 1


def test_host_has_required_fields():
    loader = YAMLLoader("orchestrator/sample_topology.yaml")
    data = loader.parse()
    h1 = data["network"]["hosts"]["H1"]
    assert "os" in h1
    assert "services" in h1
    assert "vulnerabilities" in h1
    assert "sensitivity" in h1
