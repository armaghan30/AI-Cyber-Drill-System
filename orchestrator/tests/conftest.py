import pytest
from orchestrator.orchestrator_core import Orchestrator

TOPOLOGY_PATH = "orchestrator/sample_topology.yaml"
TOPOLOGY_4HOST = "orchestrator/topology_4host.yaml"
TOPOLOGY_8HOST = "orchestrator/topology_8host.yaml"


@pytest.fixture
def orchestrator():
    orch = Orchestrator(TOPOLOGY_PATH)
    orch.load_topology()
    orch.build_environment()
    orch.init_red_agent()
    orch.init_blue_agent()
    return orch


@pytest.fixture
def orchestrator_4host():
    orch = Orchestrator(TOPOLOGY_4HOST)
    orch.load_topology()
    orch.build_environment()
    orch.init_red_agent()
    orch.init_blue_agent()
    return orch


@pytest.fixture
def orchestrator_8host():
    orch = Orchestrator(TOPOLOGY_8HOST)
    orch.load_topology()
    orch.build_environment()
    orch.init_red_agent()
    orch.init_blue_agent()
    return orch


@pytest.fixture
def environment(orchestrator):
    return orchestrator.environment


@pytest.fixture
def red_agent(orchestrator):
    return orchestrator.red_agent


@pytest.fixture
def blue_agent(orchestrator):
    return orchestrator.blue_agent
