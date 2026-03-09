import random


class BlueAgent:
    

    def __init__(self, environment, patch_cooldown_steps: int = 5, restore_cooldown_steps: int = 8):
        self.env = environment
        self.patch_cooldown_steps = patch_cooldown_steps
        self.patch_cooldown = 0

        self.restore_cooldown_steps = restore_cooldown_steps
        self.restore_cooldown = 0
        self.detected_hosts = set()  

    # -----------------Cooldown helpers--------------------------
    def _tick_cooldown(self):
        if self.patch_cooldown > 0:
            self.patch_cooldown -= 1
        if self.restore_cooldown > 0:
            self.restore_cooldown -= 1

    def _can_patch(self) -> bool:
        return self.patch_cooldown == 0

    def _trigger_patch_cooldown(self):
        self.patch_cooldown = self.patch_cooldown_steps

    def _can_restore(self) -> bool:
        return self.restore_cooldown == 0

    def _trigger_restore_cooldown(self):
        self.restore_cooldown = self.restore_cooldown_steps

    
    # -----------------Detection rule------------------------------
    def detect(self, last_red_action):
        #Detect if an exploit attempt succeeded.
        
        if not last_red_action:
            return False
        if last_red_action.get("action") == "exploit" and last_red_action.get("success", False):
            return True
        return False

    # ---------------Patch logic --------------------
   
    def make_patch_action(self, host_name):
        print(f"BLUE: Decided to patch {host_name}")
        # Start cooldown
        self._trigger_patch_cooldown()
        return {"action": "patch", "target": host_name}

    # --------------------Isolation logic---------------------------

    def make_isolate_action(self, host_name):
        print(f"  BLUE: Decided to isolate {host_name}")
        return {"action": "isolate", "target": host_name}

    def make_restore_action(self, host_name: str):
        print(f"  BLUE: Restoring {host_name} to clean state.")
        self._trigger_restore_cooldown()
        return {"action": "restore", "target": host_name}

    def make_detect_action(self, host_name: str):
        host = self.env.hosts[host_name]
        detected = False

        if host.is_compromised:
            if random.random() < 0.85:
                detected = True
                host.detected = True
                self.detected_hosts.add(host_name)
                print(f"  BLUE: Detected compromise on {host_name}!")
            else:
                print(f"  BLUE: Detection scan on {host_name} - missed the compromise.")
        else:
            print(f"  BLUE: Detection scan on {host_name} - host is clean.")

        return {
            "action": "detect",
            "target": host_name,
            "detected": detected,
        }

    def make_harden_action(self, host_name: str):
        print(f"  BLUE: Hardening {host_name} (removes 2 vulns, increases hardened_level).")
        self._trigger_patch_cooldown()
        return {"action": "harden", "target": host_name}

    def choose_action(self, last_red_action):
        self._tick_cooldown()

        # 1) IF successful exploit detected THEN isolate that host
        if self.detect(last_red_action):
            target = last_red_action.get("target")
            if target:
                return self.make_isolate_action(target)

        # 2) IF we know of compromised hosts THEN try to restore
        compromised_detected = [
            name for name in self.detected_hosts
            if self.env.hosts[name].is_compromised
        ]
        if compromised_detected and self._can_restore():
            target = random.choice(compromised_detected)
            return self.make_restore_action(target)

        # 3) Randomly detect a host (20% chance)
        host_names = list(self.env.hosts.keys())
        if random.random() < 0.2 and host_names:
            target = random.choice(host_names)
            return self.make_detect_action(target)

        # 4) If patch/harden is available, pick one
        if self._can_patch():
            vulnerable_hosts = [
                name for name, host in self.env.hosts.items()
                if host.vulnerabilities
            ]
            if vulnerable_hosts:
                target = random.choice(vulnerable_hosts)
                # 50% chance harden vs patch
                if random.random() < 0.5:
                    return self.make_harden_action(target)
                else:
                    return self.make_patch_action(target)

        # 5)  idle
        return {"action": "idle", "target": None}
