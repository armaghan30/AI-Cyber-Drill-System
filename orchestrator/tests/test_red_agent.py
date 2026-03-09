
def test_scan_returns_action_dict(red_agent):
    result = red_agent.scan("H1")
    assert result["action"] == "scan"
    assert result["target"] == "H1"
    assert "vulnerabilities" in result
    assert "services" in result


def test_scan_updates_known_vulns(red_agent):
    red_agent.scan("H1")
    assert "H1" in red_agent.known_vulns
    assert "vulnerabilities" in red_agent.known_vulns["H1"]


def test_exploit_returns_action_dict(red_agent):
    result = red_agent.exploit("H1")
    assert result["action"] == "exploit"
    assert result["target"] == "H1"
    assert "success" in result


def test_exploit_no_vulns_fails(environment, red_agent):
    # Remove all vulnerabilities from H1
    environment.hosts["H1"].vulnerabilities = []
    result = red_agent.exploit("H1")
    assert result["success"] is False


def test_choose_action_returns_valid_action(red_agent):
    result = red_agent.choose_action()
    assert result["action"] in ("scan", "exploit", "escalate", "lateral_move", "exfiltrate", "idle")
