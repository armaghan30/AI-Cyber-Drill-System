import random

class RedAgent:
    
    def __init__(self, environment):
       
        self.env = environment
       
        self.known_vulns = {}
        self.compromised_hosts = []

    # -----------------------SCAN------------------------------------
    
    def scan(self, host_name: str):
        
        host = self.env.hosts[host_name]

        found_vulns = list(getattr(host, "vulnerabilities", []))
        found_services = list(getattr(host, "services", []))

        # Update local knowledge
        self.known_vulns[host_name] = {
            "vulnerabilities": found_vulns,
            "services": found_services,
        }

        print(f" RED: Scanned {host_name} -> vulns={found_vulns}")

        return {
            "action": "scan",
            "target": host_name,
            "vulnerabilities": found_vulns,
            "services": found_services,
        }

    # ----------------------------EXPLOIT-----------------------------
    
    def exploit(self, host_name: str):
        
        host = self.env.hosts[host_name]
        vulns = list(getattr(host, "vulnerabilities", []))

        if not vulns:
            print(f" RED: Exploit failed on {host_name}. No vulnerabilities.")
            return {
                "action": "exploit",
                "success": False,
                "target": host_name,
                "vulnerabilities": vulns,
            }

        # simple success probability
        success = random.random() < 0.7

        if success:
            print(f"RED: Successfully exploited {host_name}!")
            if host_name not in self.compromised_hosts:
                self.compromised_hosts.append(host_name)
        else:
            print(f"RED: Exploit failed on {host_name}.")

        return {
            "action": "exploit",
            "success": success,
            "target": host_name,
            "vulnerabilities": vulns,
        }


    def escalate_privileges(self, host_name: str):
        host = self.env.hosts[host_name]

        if not host.is_compromised:
            print(f"  RED: Cannot escalate on {host_name} - not compromised.")
            return {
                "action": "escalate",
                "target": host_name,
                "success": False,
                "reason": "not_compromised",
            }

        if host.access_level != "user":
            print(f"  RED: Cannot escalate on {host_name} - access is '{host.access_level}', need 'user'.")
            return {
                "action": "escalate",
                "target": host_name,
                "success": False,
                "reason": f"access_is_{host.access_level}",
            }

        base_prob = 0.6
        reduction = 0.15 * host.hardened_level
        prob = max(base_prob - reduction, 0.05)

        success = random.random() < prob

        if success:
            host.access_level = "root"
            print(f"  RED: Escalated to root on {host_name}! (prob was {prob:.2f})")
        else:
            print(f"  RED: Escalation failed on {host_name}. (prob was {prob:.2f})")

        return {
            "action": "escalate",
            "target": host_name,
            "success": success,
            "previous_access": "user",
            "new_access": host.access_level,
        }

    def lateral_move(self, target_host_name: str):
        target_host = self.env.hosts[target_host_name]

        if target_host.is_isolated:
            print(f"  RED: Cannot lateral_move to {target_host_name} - host is isolated.")
            return {
                "action": "lateral_move",
                "target": target_host_name,
                "source": None,
                "success": False,
                "reason": "target_isolated",
            }

        # Finding a compromised host that is adjacent to the target
        adjacent_compromised = []
        for edge in self.env.edges:
            if target_host_name in edge:
                other = edge[0] if edge[1] == target_host_name else edge[1]
                other_host = self.env.hosts.get(other)
                if other_host and other_host.is_compromised:
                    adjacent_compromised.append(other)

        if not adjacent_compromised:
            print(f"  RED: No compromised host adjacent to {target_host_name}.")
            return {
                "action": "lateral_move",
                "target": target_host_name,
                "source": None,
                "success": False,
                "reason": "no_adjacent_compromised",
            }

        source = random.choice(adjacent_compromised)
        success = random.random() < 0.5

        if success:
            target_host.is_compromised = True
            target_host.access_level = "user"
            if target_host_name not in self.compromised_hosts:
                self.compromised_hosts.append(target_host_name)
            print(f"  RED: Lateral move {source} -> {target_host_name} SUCCESS!")
        else:
            print(f"  RED: Lateral move {source} -> {target_host_name} FAILED.")

        return {
            "action": "lateral_move",
            "target": target_host_name,
            "source": source,
            "success": success,
        }

    def exfiltrate(self, host_name: str):
        host = self.env.hosts[host_name]

        if not host.is_compromised or host.access_level != "root":
            print(f"  RED: Cannot exfiltrate {host_name} - need root access. "
                  f"(compromised={host.is_compromised}, access={host.access_level})")
            return {
                "action": "exfiltrate",
                "target": host_name,
                "success": False,
                "reason": "no_root_access",
            }

        if host.data_exfiltrated:
            print(f"  RED: Data already exfiltrated from {host_name}.")
            return {
                "action": "exfiltrate",
                "target": host_name,
                "success": False,
                "reason": "already_exfiltrated",
            }

        success = random.random() < 0.8

        if success:
            host.data_exfiltrated = True
            print(f"  RED: Exfiltrated data from {host_name}! (sensitivity={host.sensitivity})")
        else:
            print(f"  RED: Exfiltration failed on {host_name}.")

        return {
            "action": "exfiltrate",
            "target": host_name,
            "success": success,
            "sensitivity": host.sensitivity,
        }

    def choose_action(self):
        host_names = list(self.env.hosts.keys())
        if not host_names:
            return {"action": "idle", "target": None}

        target = random.choice(host_names)

        roll = random.random()

        if roll < 0.25:
            return self.scan(target)
        elif roll < 0.50:
            return self.exploit(target)
        elif roll < 0.65:
            return self.escalate_privileges(target)
        elif roll < 0.80:
            return self.lateral_move(target)
        elif roll < 0.95:
            return self.exfiltrate(target)
        else:
            return {"action": "idle", "target": None}
