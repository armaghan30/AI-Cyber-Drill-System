
def test_simulation_runs(orchestrator):
    logs = orchestrator.run_simulation(max_steps=5)
    assert logs is not None
    assert len(logs) == 5


def test_simulation_log_structure(orchestrator):
    logs = orchestrator.run_simulation(max_steps=3)
    entry = logs[0]

    assert "step" in entry
    assert "red_action" in entry
    assert "blue_action" in entry
    assert "red_reward" in entry
    assert "blue_reward" in entry


def test_simulation_rewards_are_numeric(orchestrator):
    logs = orchestrator.run_simulation(max_steps=3)
    for entry in logs:
        assert isinstance(entry["red_reward"], (int, float))
        assert isinstance(entry["blue_reward"], (int, float))
