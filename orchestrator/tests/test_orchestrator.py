from orchestrator.orchestrator_core import Orchestrator


def test_orchestrator_loads_topology():
    orch = Orchestrator("orchestrator/sample_topology.yaml")
    topo = orch.load_topology()
    assert topo is not None
    assert "network" in topo


def test_orchestrator_builds_environment():
    orch = Orchestrator("orchestrator/sample_topology.yaml")
    orch.load_topology()
    env = orch.build_environment()
    assert env is not None
    assert len(env.hosts) >= 2


def test_orchestrator_init_agents(orchestrator):
    assert orchestrator.red_agent is not None
    assert orchestrator.blue_agent is not None


def test_orchestrator_get_red_state(orchestrator):
    state = orchestrator.get_red_state()
    assert "hosts" in state
    assert "timestep" in state


def test_orchestrator_get_blue_state(orchestrator):
    state = orchestrator.get_blue_state()
    assert "hosts" in state
    assert "timestep" in state


def test_orchestrator_snapshot(orchestrator):
    snap = orchestrator._snapshot_environment()
    assert "hosts" in snap
    assert "edges" in snap
