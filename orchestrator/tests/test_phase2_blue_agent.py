import random


def test_restore_cooldown(blue_agent):
    blue_agent.make_restore_action("H1")
    assert blue_agent.restore_cooldown == blue_agent.restore_cooldown_steps
    assert blue_agent._can_restore() is False


def test_restore_action_dict(blue_agent):
    result = blue_agent.make_restore_action("H1")
    assert result["action"] == "restore"
    assert result["target"] == "H1"


def test_detect_finds_compromised(blue_agent, environment):
    environment.hosts["H1"].is_compromised = True

    random.seed(0)
    detected = False
    for _ in range(20):
        environment.hosts["H1"].detected = False
        result = blue_agent.make_detect_action("H1")
        if result["detected"]:
            assert environment.hosts["H1"].detected is True
            assert "H1" in blue_agent.detected_hosts
            detected = True
            break
    assert detected


def test_detect_clean_host(blue_agent):
    result = blue_agent.make_detect_action("H1")
    assert result["detected"] is False


def test_harden_action_dict(blue_agent):
    result = blue_agent.make_harden_action("H1")
    assert result["action"] == "harden"
    assert result["target"] == "H1"


def test_harden_shares_patch_cooldown(blue_agent):
    blue_agent.make_harden_action("H1")
    assert blue_agent._can_patch() is False


def test_choose_action_uses_all_types(blue_agent):
    actions_seen = set()
    for _ in range(200):
        red_action = {"action": "scan", "target": "H1"}
        result = blue_agent.choose_action(red_action)
        actions_seen.add(result["action"])
        blue_agent.patch_cooldown = 0
        blue_agent.restore_cooldown = 0

    assert "patch" in actions_seen or "harden" in actions_seen
    assert "detect" in actions_seen
