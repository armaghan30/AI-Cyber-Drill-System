
import copy
import datetime


class Host:
    def __init__(self, name, os, services, vulnerabilities, sensitivity):
        self.name = name
        self.os = os
        self.services = list(services)
        self.vulnerabilities = list(vulnerabilities)  # list of CVE strings
        self.sensitivity = sensitivity

        self.is_compromised = False
        self.access_level = "none"
        self.is_isolated = False

        self.detected = False
        self.hardened_level = 0
        self.data_exfiltrated = False

    def __repr__(self):
        return (
            f"<Host {self.name}, compromised={self.is_compromised}, "
            f"access={self.access_level}, vulns={len(self.vulnerabilities)}, "
            f"isolated={self.is_isolated}, detected={self.detected}, "
            f"hardened={self.hardened_level}, exfil={self.data_exfiltrated}>"
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
        }


class Environment:
   

    def __init__(self, topology_data):
        self.topology_data = topology_data
        self.hosts = {}
        self.edges = []
        self.step_count = 0

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

        self.edges = list(network.get("edges", []))

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
                host.access_level = "root"
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
                host.data_exfiltrated = False
                host.detected = False

            elif b_type == "detect" and target in self.hosts:
                pass

            elif b_type == "harden" and target in self.hosts:
                host = self.hosts[target]
                remove_count = min(2, len(host.vulnerabilities))
                host.vulnerabilities = host.vulnerabilities[remove_count:]
                host.hardened_level += 1


        # 3. Increase step counter
        self.step_count += 1

        # 4. Return environment snapshot
        return self._snapshot()

    # ---------------------Snapshot (used by Orchestrator, RL, RewardEngine)-------
    
    def _snapshot(self):
        return {
            "step": self.step_count,
            "timestamp": datetime.datetime.now().isoformat(),
            "hosts": {
                name: host.to_state_dict()
                for name, host in self.hosts.items()
            },
            "edges": copy.deepcopy(self.edges),
        }
