
import datetime

from orchestrator.firewall_engine import FirewallEngine


class Host:
    def __init__(self, name, os, services, vulnerabilities, sensitivity, exposed=False):
        self.name = name
        self.os = os
        self.services = list(services)
        self.vulnerabilities = list(vulnerabilities)  # list of CVE strings
        self.sensitivity = sensitivity
        self.exposed = exposed  # internet-facing: Red can attack it without a foothold

        self.is_compromised = False
        self.access_level = "none"
        self.is_isolated = False

        self.detected = False
        self.hardened_level = 0
        self.data_exfiltrated = False
        self.firewall_active = False

    def __repr__(self):
        return (
            f"<Host {self.name}, compromised={self.is_compromised}, "
            f"access={self.access_level}, vulns={len(self.vulnerabilities)}, "
            f"isolated={self.is_isolated}, detected={self.detected}, "
            f"hardened={self.hardened_level}, exfil={self.data_exfiltrated}, "
            f"firewall={self.firewall_active}>"
        )

    def to_state_dict(self):
        return {
            "is_compromised": self.is_compromised,
            "access_level": self.access_level,
            "vulnerabilities": list(self.vulnerabilities),
            "is_isolated": self.is_isolated,
            "detected": self.detected,
            "hardened_level": self.hardened_level,
            "data_exfiltrated": self.data_exfiltrated,
            "firewall_active": self.firewall_active,
        }


class Environment:

    def __init__(self, topology_data):
        self.topology_data = topology_data
        self.hosts = {}
        self.edges = []
        self.step_count = 0
        self.firewall_engine: FirewallEngine | None = None

        self._build()

    # -------------------Build environment from YAML----------------------------

    def _build(self):
        network = self.topology_data["network"]

        for host_name, details in network["hosts"].items():
            host_obj = Host(
                name=host_name,
                os=details.get("os", "unknown"),
                services=details.get("services", []),
                vulnerabilities=details.get("vulnerabilities", []),
                sensitivity=details.get("sensitivity", "low"),
            )
            self.hosts[host_name] = host_obj

        self._set_exposure(network["hosts"])

        self.edges = list(network.get("edges", []))
        # original links, so restore can reconnect a host that was isolated
        self.base_edges = list(self.edges)

        # Build firewall engine — works for any topology size (2–50+ hosts)
        self.firewall_engine = FirewallEngine()
        fw_rules = network.get("firewall_rules", {})
        if fw_rules:
            # Explicit per-host rules defined in the YAML take priority
            self.firewall_engine.load_topology_rules(fw_rules)
        # Auto-fill rules for every host not covered by the YAML section.
        # For user-uploaded topologies with no firewall_rules section this
        # generates sensible defaults for all hosts automatically.
        self.firewall_engine.auto_generate_rules(self.hosts)

        for host_name, details in network["hosts"].items():
            if details.get("firewall_active"):
                self.firewall_engine.deploy(host_name, 0)
                self.hosts[host_name].firewall_active = True

    def _set_exposure(self, host_cfgs):
        """Mark internet-facing hosts (YAML `exposed`, else the low-sensitivity tier)."""
        if any("exposed" in cfg for cfg in host_cfgs.values()):
            for name, cfg in host_cfgs.items():
                self.hosts[name].exposed = bool(cfg.get("exposed", False))
            return
        low = [h for h in self.hosts.values() if h.sensitivity == "low"]
        for h in (low or self.hosts.values()):
            h.exposed = True

    def is_reachable(self, host_name):
        """Exposed, or linked to a host Red already controls; never when isolated."""
        host = self.hosts[host_name]
        if host.is_isolated:
            return False
        if host.exposed:
            return True
        for e in self.edges:
            if host_name in e:
                other = e[0] if e[1] == host_name else e[1]
                if other in self.hosts and self.hosts[other].is_compromised:
                    return True
        return False

    # ------------------Reset--------------------------------

    def reset(self):
        
        self.hosts = {}
        self.edges = []
        self.step_count = 0
        self._build()
        return self._snapshot()

    # ---------------------Apply Red + Blue actions-----------------------
    
    def step(self, red_action, blue_action):
        

        # 1. Apply Red Action Effects
        if red_action is not None:
            r_type = red_action.get("action")
            target = red_action.get("target")
            success = red_action.get("success", False)

            if r_type == "exploit" and target in self.hosts and success:
                host = self.hosts[target]
                host.is_compromised = True
                # initial foothold is user-level; Red must escalate to root before exfiltrating
                host.access_level = "user"
                if host.vulnerabilities:
                    host.vulnerabilities = host.vulnerabilities[1:]

            elif r_type == "escalate" and target in self.hosts and success:
                pass

            elif r_type == "lateral_move" and target in self.hosts and success:
                pass

            elif r_type == "exfiltrate" and target in self.hosts and success:
                pass

        # 2. Apply Blue Action Effects
        if blue_action is not None:
            b_type = blue_action.get("action")
            target = blue_action.get("target")

            if b_type == "patch" and target in self.hosts:
                host = self.hosts[target]
                if host.vulnerabilities:
                    host.vulnerabilities = host.vulnerabilities[1:]

            elif b_type == "isolate" and target in self.hosts:
                host = self.hosts[target]
                host.is_isolated = True
                new_edges = []
                for e in self.edges:
                    if target not in e:
                        new_edges.append(e)
                self.edges = new_edges

            elif b_type == "restore" and target in self.hosts:
                host = self.hosts[target]
                host.is_compromised = False
                host.access_level = "none"
                host.detected = False
                # data_exfiltrated stays True: restoring a host cannot un-steal its data
                if host.is_isolated:
                    host.is_isolated = False
                    self._reconnect(target)

            elif b_type == "detect" and target in self.hosts:
                pass

            elif b_type == "harden" and target in self.hosts:
                host = self.hosts[target]
                remove_count = min(2, len(host.vulnerabilities))
                host.vulnerabilities = host.vulnerabilities[remove_count:]
                host.hardened_level += 1

            elif b_type == "deploy_firewall" and target in self.hosts:
                host = self.hosts[target]
                if self.firewall_engine:
                    newly_deployed = self.firewall_engine.deploy(target, self.step_count)
                    host.firewall_active = self.firewall_engine.is_active(target)
                    # Store result so reward engine can detect duplicate deployments
                    blue_action["newly_deployed"] = newly_deployed

        # 3. Increase step counter
        self.step_count += 1

        # 4. Return environment snapshot
        return self._snapshot()

    def _reconnect(self, host_name):
        """Bring back the original links of a restored host, except to hosts still isolated."""
        current = {frozenset(e) for e in self.edges}
        for e in self.base_edges:
            if host_name not in e or frozenset(e) in current:
                continue
            other = e[0] if e[1] == host_name else e[1]
            if other in self.hosts and not self.hosts[other].is_isolated:
                self.edges.append(e)
                current.add(frozenset(e))

    # ---------------------Snapshot (used by Orchestrator, RL, RewardEngine)-------

    def _snapshot(self):
        return {
            "step": self.step_count,
            "timestamp": datetime.datetime.now().isoformat(),
            "hosts": {
                name: host.to_state_dict()
                for name, host in self.hosts.items()
            },
            "edges": list(self.edges),
            "firewall_status": (
                self.firewall_engine.get_status()
                if self.firewall_engine else {}
            ),
        }
