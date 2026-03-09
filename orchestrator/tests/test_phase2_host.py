from orchestrator.env_builder import Host, Environment
from orchestrator.yaml_loader import YAMLLoader


def test_host_new_fields_defaults():
    host = Host("test", "linux", ["ssh"], ["CVE-001"], "high")
    assert host.detected is False
    assert host.hardened_level == 0
    assert host.data_exfiltrated is False


def test_host_to_state_dict_includes_new_fields():
    host = Host("test", "linux", ["ssh"], ["CVE-001"], "high")
    state = host.to_state_dict()
    assert "detected" in state
    assert "hardened_level" in state
    assert "data_exfiltrated" in state


def test_host_repr_includes_new_fields():
    host = Host("test", "linux", ["ssh"], ["CVE-001"], "high")
    r = repr(host)
    assert "detected" in r
    assert "hardened" in r
    assert "exfil" in r


def test_environment_reset_clears_new_fields():
    loader = YAMLLoader("orchestrator/sample_topology.yaml")
    topo = loader.parse()
    env = Environment(topo)

    host = env.hosts["H1"]
    host.detected = True
    host.hardened_level = 3
    host.data_exfiltrated = True

    env.reset()
    host = env.hosts["H1"]
    assert host.detected is False
    assert host.hardened_level == 0
    assert host.data_exfiltrated is False


def test_step_restore_resets_host(orchestrator):
    env = orchestrator.environment
    host = env.hosts["H1"]

    host.is_compromised = True
    host.access_level = "root"
    host.data_exfiltrated = True
    host.detected = True
    host.hardened_level = 2

    env.step(None, {"action": "restore", "target": "H1"})
    assert host.is_compromised is False
    assert host.access_level == "none"
    assert host.data_exfiltrated is False
    assert host.detected is False
    assert host.hardened_level == 2  # hardening is permanent


def test_step_harden_removes_two_vulns(orchestrator):
    env = orchestrator.environment
    host = env.hosts["H1"]
    initial_vulns = len(host.vulnerabilities)

    env.step(None, {"action": "harden", "target": "H1"})
    assert len(host.vulnerabilities) == initial_vulns - 2
    assert host.hardened_level == 1


def test_step_harden_increments_level(orchestrator):
    env = orchestrator.environment
    env.step(None, {"action": "harden", "target": "H1"})
    env.step(None, {"action": "harden", "target": "H1"})
    assert orchestrator.environment.hosts["H1"].hardened_level == 2
