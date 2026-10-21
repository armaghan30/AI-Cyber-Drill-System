import yaml

from orchestrator.env_builder import Environment
from orchestrator.nmap_parser import NmapParser, _suggest_exposed

SAMPLE = "examples/corporate_office_nmap.xml"


def _topology(sensitivities=None):
    parser = NmapParser(open(SAMPLE, "rb").read())
    parser.parse()
    return parser.to_topology_yaml(sensitivities or {})


def test_public_services_are_exposed_unless_high():
    assert _suggest_exposed(["ssh", "http"], "medium") is True
    assert _suggest_exposed(["smtp", "imap"], "low") is True
    assert _suggest_exposed(["dns"], "medium") is True
    assert _suggest_exposed(["ftp"], "low") is True
    assert _suggest_exposed(["mysql", "http"], "high") is False   # data store stays internal
    assert _suggest_exposed(["microsoft-ds", "ms-wbt-server"], "medium") is False
    assert _suggest_exposed([], "low") is False


def test_sample_scan_has_dmz_and_internal_hosts():
    hosts = _topology()["network"]["hosts"]
    exposed = sorted(k for k, h in hosts.items() if h["exposed"])
    assert exposed == ["app_srv_01", "app_win_01", "fw_edge_01", "mail_01", "web_app_01"]
    for internal in ("dc_01", "db_primary_01", "db_backup_01", "file_srv_01", "ws_hr_01"):
        assert hosts[internal]["exposed"] is False


def test_raising_sensitivity_makes_host_internal():
    hosts = _topology({"web_app_01": "high"})["network"]["hosts"]
    assert hosts["web_app_01"]["exposed"] is False


def test_environment_uses_parser_exposure():
    env = Environment(yaml.safe_load(yaml.dump(_topology())))
    assert env.hosts["web_app_01"].exposed and not env.hosts["db_primary_01"].exposed
    assert env.is_reachable("web_app_01") and not env.is_reachable("db_primary_01")


def test_no_public_hosts_leaves_field_out():
    parser = NmapParser(b"")
    parser.hosts = [
        {"key": "a", "os": "linux", "services": ["ssh"], "suggested_cves": [], "suggested_sensitivity": "medium"},
        {"key": "b", "os": "linux", "services": ["mysql"], "suggested_cves": [], "suggested_sensitivity": "high"},
    ]
    hosts = parser.to_topology_yaml({})["network"]["hosts"]
    assert all("exposed" not in h for h in hosts.values())


def test_example_topology_matches_parser_output():
    # examples/corporate_office_nmap_nmap.yaml is what the app saves for this scan with default review settings
    with open("examples/corporate_office_nmap_nmap.yaml") as f:
        assert yaml.safe_load(f) == yaml.safe_load(yaml.dump(_topology()))
