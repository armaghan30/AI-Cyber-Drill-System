
from __future__ import annotations
from typing import Dict, Any, Tuple


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

            if a_type == "scan" and target in new_hosts:
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
                    sens_reward = {"low": 10.0, "medium": 20.0, "high": 30.0}
                    sens_penalty = {"low": -5.0, "medium": -10.0, "high": -15.0}
                    red_r += sens_reward.get(sensitivity, 10.0)
                    blue_r += sens_penalty.get(sensitivity, -5.0)
                else:
                    reason = red_action.get("reason", "")
                    if reason in ("no_root_access", "already_exfiltrated"):
                        red_r -= 2.0
                    else:
                        red_r -= 3.0

        # ---------------------- GLOBAL: NEW COMPROMISED HOSTS ----------------------
        for host_name, new_h in new_hosts.items():
            new_comp = bool(new_h.get("is_compromised", False))
            prev_comp = bool(prev_hosts.get(host_name, {}).get("is_compromised", False))
            if new_comp and not prev_comp:
                red_r += 25.0
                blue_r -= 10.0

        # ---------------------- BLUE ACTION REWARDS ----------------------
        if blue_action:
            b_type = blue_action.get("action")
            target = blue_action.get("target")

            if b_type == "patch" and target in new_hosts:
                prev_vulns = prev_hosts.get(target, {}).get("vulnerabilities", [])
                new_vulns = new_hosts.get(target, {}).get("vulnerabilities", [])
                if len(new_vulns) < len(prev_vulns):
                    blue_r += 6.0
                else:
                    blue_r -= 1.0

            elif b_type == "isolate" and target in new_hosts:
                blue_r += 4.0
                red_r -= 3.0

            elif b_type == "restore" and target in new_hosts:
                prev_comp = bool(prev_hosts.get(target, {}).get("is_compromised", False))
                new_comp = bool(new_hosts[target].get("is_compromised", False))
                if prev_comp and not new_comp:
                    blue_r += 12.0
                    red_r -= 8.0
                else:
                    blue_r -= 3.0

            elif b_type == "detect" and target in new_hosts:
                detected = blue_action.get("detected", False)
                prev_comp = bool(prev_hosts.get(target, {}).get("is_compromised", False))
                if detected:
                    blue_r += 8.0
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

            elif b_type == "idle":
                pass

        return red_r, blue_r
