
from __future__ import annotations
from typing import Dict, Any, Tuple


# stealing data has to pay more than taking another host
EXFIL_REWARD = {"low": 40.0, "medium": 80.0, "high": 120.0}
EXFIL_PENALTY = {"low": -5.0, "medium": -10.0, "high": -15.0}

# end-of-episode reward for Blue: did the network get breached?
BLUE_OUTCOME_REWARD = 50.0


def blue_outcome_reward(final_hosts) -> float:
    from orchestrator.verdict import is_breach
    return -BLUE_OUTCOME_REWARD if is_breach(final_hosts) else BLUE_OUTCOME_REWARD


class RewardEngine:

    def compute_rewards(
        self,
        prev_state: Dict[str, Any] | None,
        new_state: Dict[str, Any],
        red_action: Dict[str, Any] | None,
        blue_action: Dict[str, Any] | None,
    ) -> Tuple[float, float]:

        red_r = 0.0
        blue_r = 0.0

        prev_hosts = prev_state.get("hosts", {}) if prev_state else {}
        new_hosts = new_state.get("hosts", {})

        # ---------------------- RED ACTION REWARDS ----------------------
        if red_action:
            a_type = red_action.get("action")
            target = red_action.get("target")
            reason = red_action.get("reason", "")

            # Bonus when firewall blocks Red attack
            if reason == "firewall_blocked" and a_type in ("exploit", "lateral_move"):
                blue_r += 10.0
                red_r -= 3.0

            if a_type == "scan" and target in new_hosts:
                if not red_action.get("new_info", True):
                    # re-scan that learned nothing new: wasted step (stops scan farming)
                    red_r -= 1.0
                else:
                    red_r += 1.0
                    vulns = new_hosts[target].get("vulnerabilities", [])
                    if len(vulns) > 0:
                        red_r += 2.0
                    else:
                        red_r -= 1.0

            elif a_type == "exploit" and target in new_hosts:
                new_comp = bool(new_hosts[target].get("is_compromised", False))
                prev_comp = bool(prev_hosts.get(target, {}).get("is_compromised", False))
                if new_comp and not prev_comp:
                    # intentional: +20 here and +25 below = +45 per new host (strong attacker)
                    red_r += 20.0
                else:
                    red_r -= 5.0

            elif a_type == "escalate" and target in new_hosts:
                success = red_action.get("success", False)
                if success:
                    red_r += 15.0
                    blue_r -= 5.0
                else:
                    reason = red_action.get("reason", "")
                    if reason.startswith("access_is_") or reason == "not_compromised":
                        red_r -= 2.0
                    else:
                        red_r -= 3.0

            elif a_type == "lateral_move" and target in new_hosts:
                success = red_action.get("success", False)
                if success:
                    # INTENTIONAL: +18 plus the +25 global bonus = +43 per host reached laterally
                    red_r += 18.0
                    blue_r -= 8.0
                else:
                    reason = red_action.get("reason", "")
                    if reason in ("no_adjacent_compromised", "target_isolated"):
                        red_r -= 2.0
                    else:
                        red_r -= 4.0

            elif a_type == "exfiltrate" and target in new_hosts:
                success = red_action.get("success", False)
                if success:
                    sensitivity = red_action.get("sensitivity", "low")
                    red_r += EXFIL_REWARD.get(sensitivity, EXFIL_REWARD["low"])
                    blue_r += EXFIL_PENALTY.get(sensitivity, EXFIL_PENALTY["low"])
                else:
                    reason = red_action.get("reason", "")
                    if reason in ("no_root_access", "already_exfiltrated", "host_isolated"):
                        red_r -= 2.0
                    else:
                        red_r -= 3.0

        # ---------------------- GLOBAL: NEW COMPROMISED HOSTS ----------------------
        for host_name, new_h in new_hosts.items():
            new_comp = bool(new_h.get("is_compromised", False))
            prev_comp = bool(prev_hosts.get(host_name, {}).get("is_compromised", False))
            if new_comp and not prev_comp:
                red_r += 25.0  # INTENTIONAL (see exploit / lateral_move above)
                blue_r -= 6.0

        # ---------------------- BLUE ACTION REWARDS ----------------------
        if blue_action:
            b_type = blue_action.get("action")
            target = blue_action.get("target")

            if b_type == "patch" and target in new_hosts:
                prev_vulns = prev_hosts.get(target, {}).get("vulnerabilities", [])
                new_vulns = new_hosts.get(target, {}).get("vulnerabilities", [])
                if len(new_vulns) < len(prev_vulns):
                    blue_r += 8.0
                else:
                    blue_r -= 1.0

            elif b_type == "isolate" and target in new_hosts:
                blue_r += 4.0
                red_r -= 3.0

            elif b_type == "restore" and target in new_hosts:
                prev_comp = bool(prev_hosts.get(target, {}).get("is_compromised", False))
                new_comp = bool(new_hosts[target].get("is_compromised", False))
                if prev_comp and not new_comp:
                    blue_r += 18.0
                    red_r -= 8.0
                else:
                    blue_r -= 3.0

            elif b_type == "detect" and target in new_hosts:
                detected = blue_action.get("detected", False)
                prev_comp = bool(prev_hosts.get(target, {}).get("is_compromised", False))
                if detected and not blue_action.get("new_detection", True):
                    # already-known compromise, nothing new
                    blue_r -= 1.0
                elif detected:
                    blue_r += 12.0
                    red_r -= 2.0
                elif prev_comp:
                    blue_r -= 1.0
                else:
                    blue_r += 1.0

            elif b_type == "harden" and target in new_hosts:
                prev_vulns = prev_hosts.get(target, {}).get("vulnerabilities", [])
                new_vulns = new_hosts.get(target, {}).get("vulnerabilities", [])
                if len(new_vulns) < len(prev_vulns):
                    blue_r += 8.0
                    red_r -= 2.0
                else:
                    blue_r -= 1.0

            elif b_type == "deploy_firewall" and target in new_hosts:
                newly_deployed = blue_action.get("newly_deployed", True)
                if newly_deployed:
                    blue_r += 10.0
                    red_r -= 2.0
                else:
                    blue_r -= 1.0  # wasted action: firewall already active

            elif b_type == "idle":
                pass

        return red_r, blue_r
