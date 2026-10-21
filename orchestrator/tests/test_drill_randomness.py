import os
import random

import pytest

from backend.services.simulation_service import _load_sb3_models
from orchestrator.tests.conftest import TOPOLOGY_4HOST


@pytest.mark.skipif(not os.path.exists("results/models/maskable_ppo_red_topology_4host.zip"),
                    reason="trained 4-host models not present")
def test_each_drill_gets_fresh_random_numbers():
    _load_sb3_models(TOPOLOGY_4HOST)
    first = random.random()
    _load_sb3_models(TOPOLOGY_4HOST)
    assert random.random() != first
