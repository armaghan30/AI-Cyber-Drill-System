
from __future__ import annotations

from typing import Dict, List, Any, Optional


class FirewallRule:

    def __init__(
        self,
        block_services: List[str] = None,
        block_inbound_from: List[str] = None,
    ):
        self.block_services: List[str] = block_services or []
        self.block_inbound_from: List[str] = block_inbound_from or []
        self.active: bool = False
        self.deployed_at_step: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "active": self.active,
            "block_services": list(self.block_services),
            "block_inbound_from": list(self.block_inbound_from),
            "deployed_at_step": self.deployed_at_step,
        }


class FirewallEngine:
   

    def __init__(self) -> None:
        self.rules: Dict[str, FirewallRule] = {}

    # ------------------------------------------------------------------
    # Topology-driven setup

    def load_topology_rules(self, firewall_rules: Dict[str, Any]) -> None:
        """Load pre-defined rule configs from the topology YAML."""
        for host_name, cfg in firewall_rules.items():
            self.rules[host_name] = FirewallRule(
                block_services=cfg.get("block_services", []),
                block_inbound_from=cfg.get("block_inbound_from", []),
            )

    def auto_generate_rules(self, hosts: Dict[str, Any]) -> None:
        
        for host_name, host in hosts.items():
            if host_name in self.rules:
                continue  # explicit topology rule takes precedence

            services = list(getattr(host, "services", []))
            sensitivity = getattr(host, "sensitivity", "low")

            # For high/medium hosts: empty block_inbound_from means "block ALL
            # lateral movement" when the firewall is active (see is_lateral_blocked).
            # For low hosts: use a non-empty sentinel so lateral movement is
            # only blocked from explicitly listed sources (none by default).
            if sensitivity in ("high", "medium"):
                block_inbound: List[str] = []       # blocks all lateral movement
            else:
                block_inbound = ["__none__"]        # sentinel: no sources blocked

            # internet-facing hosts must keep their public services open
            block_services = [] if getattr(host, "exposed", False) else services

            self.rules[host_name] = FirewallRule(
                block_services=block_services,
                block_inbound_from=block_inbound,
            )

    # ------------------------------------------------------------------
    # Blue team actions

    def deploy(self, host_name: str, current_step: int = 0) -> bool:
        """
        Activate the firewall on *host_name*.

        Returns True if this is a *new* activation, False if it was
        already active .
        """
        if host_name not in self.rules:
            # No topology-defined rule — create a default one
            self.rules[host_name] = FirewallRule()
        rule = self.rules[host_name]
        if rule.active:
            return False
        rule.active = True
        rule.deployed_at_step = current_step
        return True

    def remove(self, host_name: str) -> None:
        """Deactivate the firewall on *host_name*."""
        if host_name in self.rules:
            self.rules[host_name].active = False

    # ------------------------------------------------------------------
    # Query helpers used by RedAgent

    def is_active(self, host_name: str) -> bool:
        """Return True if the firewall on *host_name* is active."""
        rule = self.rules.get(host_name)
        return rule.active if rule else False

    def is_exploit_blocked(
        self, host_name: str, host_services: List[str] = None
    ) -> bool:
        
        rule = self.rules.get(host_name)
        if not rule or not rule.active:
            return False
        if not rule.block_services:
            return False  # active but no service-level rules → prob reduction only
        if not host_services:
            return False
        return set(host_services).issubset(set(rule.block_services))

    def is_lateral_blocked(
        self, target_host: str, source_host: str = None
    ) -> bool:
        """
        Return True if lateral movement from *source_host* to *target_host* is blocked.

        An active firewall always blocks lateral movement unless
        ``block_inbound_from`` is set and *source_host* is not in it.
        """
        rule = self.rules.get(target_host)
        if not rule or not rule.active:
            return False
        if rule.block_inbound_from:
            # Only block if the specific source is listed (the "__none__" sentinel lists nobody)
            return source_host in rule.block_inbound_from
        # Active firewall with no source restrictions blocks all lateral movement
        return True

    # ------------------------------------------------------------------
    # State / reset

    def get_status(self) -> Dict[str, Any]:
        """Return a serialisable snapshot of all firewall rules."""
        return {host: rule.to_dict() for host, rule in self.rules.items()}

    def reset(self) -> None:
        """Deactivate all rules (called on environment reset)."""
        for rule in self.rules.values():
            rule.active = False
            rule.deployed_at_step = None
