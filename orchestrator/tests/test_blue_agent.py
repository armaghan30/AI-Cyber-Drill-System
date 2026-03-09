

def test_detect_exploit_success(blue_agent):
    red_action = {"action": "exploit", "success": True, "target": "H1"}
    assert blue_agent.detect(red_action) is True


def test_detect_exploit_failure(blue_agent):
    red_action = {"action": "exploit", "success": False, "target": "H1"}
    assert blue_agent.detect(red_action) is False


def test_detect_scan_returns_false(blue_agent):
    red_action = {"action": "scan", "target": "H1"}
    assert blue_agent.detect(red_action) is False


def test_detect_none_returns_false(blue_agent):
    assert blue_agent.detect(None) is False


def test_choose_action_isolates_on_exploit(blue_agent):
    red_action = {"action": "exploit", "success": True, "target": "H1"}
    result = blue_agent.choose_action(red_action)
    assert result["action"] == "isolate"
    assert result["target"] == "H1"


def test_choose_action_on_scan(blue_agent):
    red_action = {"action": "scan", "target": "H1"}
    result = blue_agent.choose_action(red_action)
    
    assert result["action"] in ("patch", "idle", "harden", "detect")


def test_patch_cooldown(blue_agent):
    # Forcing the patch to trigger cooldown
    
    blue_agent.make_patch_action("H1")
    assert blue_agent.patch_cooldown == blue_agent.patch_cooldown_steps
    assert blue_agent._can_patch() is False
