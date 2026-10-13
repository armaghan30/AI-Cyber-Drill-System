import xml.etree.ElementTree as ET
from typing import Optional

# Service → CVE mapping (curated for common enterprise services)
SERVICE_CVE_MAP = {
    'http':          ['CVE-2023-44487', 'CVE-2021-41773', 'CVE-2019-0211'],
    'https':         ['CVE-2023-44487', 'CVE-2021-41773'],
    'ssh':           ['CVE-2023-38408', 'CVE-2021-28041'],
    'ftp':           ['CVE-2021-40812', 'CVE-2019-9848'],
    'smb':           ['CVE-2020-0796', 'CVE-2017-0144'],
    'microsoft-ds':  ['CVE-2017-0144', 'CVE-2020-0796'],
    'netbios-ssn':   ['CVE-2017-0144'],
    'rdp':           ['CVE-2021-34527', 'CVE-2019-0708'],
    'mysql':         ['CVE-2023-21912', 'CVE-2022-21270', 'CVE-2020-14812'],
    'ms-sql-s':      ['CVE-2022-41076', 'CVE-2020-0618'],
    'postgresql':    ['CVE-2022-1552', 'CVE-2021-20229'],
    'oracle':        ['CVE-2022-21500', 'CVE-2021-2351'],
    'telnet':        ['CVE-2020-10188'],
    'snmp':          ['CVE-2017-6736', 'CVE-2017-6738'],
    'smtp':          ['CVE-2020-28188', 'CVE-2021-44228'],
    'dns':           ['CVE-2020-1350', 'CVE-2021-25215'],
    'ldap':          ['CVE-2021-44228', 'CVE-2020-1472'],
    'nfs':           ['CVE-2021-4006', 'CVE-2019-3010'],
    'vnc':           ['CVE-2022-47952', 'CVE-2020-14397'],
    'pop3':          ['CVE-2020-7247'],
    'imap':          ['CVE-2021-38371'],
    'http-proxy':    ['CVE-2021-40438'],
}

_HIGH_SERVICES  = {'mysql', 'ms-sql-s', 'postgresql', 'oracle', 'ldap'}
_MED_SERVICES   = {'http', 'https', 'smtp', 'ftp', 'nfs', 'smb', 'microsoft-ds', 'imap', 'pop3'}


def _detect_os(host_elem: ET.Element) -> str:
    os_elem = host_elem.find('os')
    if os_elem is not None:
        for osmatch in os_elem.findall('osmatch'):
            name = osmatch.get('name', '').lower()
            if 'windows' in name:
                return 'windows'
            if any(k in name for k in ('linux', 'unix', 'ubuntu', 'debian', 'centos', 'fedora', 'rhel')):
                return 'linux'
    return 'linux'


def _get_hostname(host_elem: ET.Element) -> Optional[str]:
    hostnames = host_elem.find('hostnames')
    if hostnames is not None:
        # Prefer user-defined name, then any PTR record
        for hn in hostnames.findall('hostname'):
            if hn.get('type') == 'user':
                return hn.get('name')
        for hn in hostnames.findall('hostname'):
            name = hn.get('name', '')
            if name:
                return name
    return None


def _get_ip(host_elem: ET.Element) -> str:
    for addr in host_elem.findall('address'):
        if addr.get('addrtype') == 'ipv4':
            return addr.get('addr', '')
    return ''


def _get_services(host_elem: ET.Element) -> list:
    services = []
    ports_elem = host_elem.find('ports')
    if ports_elem is not None:
        for port in ports_elem.findall('port'):
            state = port.find('state')
            if state is not None and state.get('state') == 'open':
                svc = port.find('service')
                if svc is not None:
                    name = svc.get('name', '').lower()
                    if name and name not in services:
                        services.append(name)
    return services


def _suggest_sensitivity(services: list) -> str:
    svc_set = set(services)
    if svc_set & _HIGH_SERVICES:
        return 'high'
    if svc_set & _MED_SERVICES:
        return 'medium'
    return 'low'


def _map_cves(services: list) -> list:
    cves = []
    seen = set()
    for svc in services:
        for cve in SERVICE_CVE_MAP.get(svc, []):
            if cve not in seen:
                seen.add(cve)
                cves.append(cve)
    return cves[:5]  # cap at 5 CVEs per host to keep topology clean


def _make_key(hostname: Optional[str], ip: str, index: int) -> str:
    if hostname:
        # Use first label of FQDN, replace special chars
        label = hostname.split('.')[0]
        return label.replace('-', '_').replace(' ', '_')
    if ip:
        return f'Host_{ip.replace(".", "_")}'
    return f'Host_{index + 1}'


def _generate_edges(host_keys: list, sensitivities: dict) -> list:
    """Connect hosts in chains within sensitivity groups, then bridge group gateways."""
    if len(host_keys) <= 1:
        return []

    groups = {'high': [], 'medium': [], 'low': []}
    for key in host_keys:
        groups[sensitivities.get(key, 'low')].append(key)

    edges = []
    seen = set()

    def add_edge(a, b):
        if a == b:
            return
        pair = tuple(sorted([a, b]))
        if pair not in seen:
            seen.add(pair)
            edges.append([a, b])

    # Chain within each sensitivity group; add ring wrap for groups with 3+ hosts
    for group_hosts in groups.values():
        n = len(group_hosts)
        if n <= 1:
            continue
        for i in range(n - 1):
            add_edge(group_hosts[i], group_hosts[i + 1])
        if n >= 3:
            add_edge(group_hosts[-1], group_hosts[0])

    # Bridge first host of each non-empty group to the next group
    non_empty = [g for g in ('high', 'medium', 'low') if groups[g]]
    for i in range(len(non_empty) - 1):
        add_edge(groups[non_empty[i]][0], groups[non_empty[i + 1]][0])

    # Fallback: if no edges at all (e.g. all singletons per group), chain everything
    if not edges and len(host_keys) >= 2:
        for i in range(len(host_keys) - 1):
            add_edge(host_keys[i], host_keys[i + 1])

    return edges


class NmapParser:
    """Parse nmap XML (-oX) output into our topology YAML format."""

    def __init__(self, content: bytes):
        self.content = content
        self.hosts: list = []

    def parse(self) -> list:
        """Parse nmap XML bytes. Returns list of host dicts."""
        if not self.content.strip():
            return []

        try:
            root = ET.fromstring(self.content)
        except ET.ParseError as e:
            raise ValueError(f"Invalid XML: {e}")

        if root.tag != 'nmaprun':
            raise ValueError(
                "Not a valid nmap XML file — expected <nmaprun> root element. "
                "Generate with: nmap -sV -O -oX scan.xml <target>"
            )

        hosts = []
        used_keys: set = set()
        for idx, host_elem in enumerate(root.findall('host')):
            status = host_elem.find('status')
            if status is not None and status.get('state') != 'up':
                continue

            ip = _get_ip(host_elem)
            hostname = _get_hostname(host_elem)
            os_type = _detect_os(host_elem)
            services = _get_services(host_elem)
            sensitivity = _suggest_sensitivity(services)
            cves = _map_cves(services)

            # Deduplicate keys — if hostname/IP collides with a prior host,
            # append a numeric suffix so each host stays uniquely addressable.
            base_key = _make_key(hostname, ip, idx)
            key = base_key
            suffix = 2
            while key in used_keys:
                key = f"{base_key}_{suffix}"
                suffix += 1
            used_keys.add(key)

            hosts.append({
                'key': key,
                'ip': ip,
                'hostname': hostname or ip or f'host-{idx + 1}',
                'os': os_type,
                # Keep the real picture: no services detected means no services.
                # Downstream code (CVE mapping, sensitivity, RL env) already
                # handles an empty list — we don't fabricate ssh.
                'services': services,
                'suggested_cves': cves,
                'suggested_sensitivity': sensitivity,
                'no_services_detected': len(services) == 0,
            })

        self.hosts = hosts
        return hosts

    def to_topology_yaml(self, sensitivities: Optional[dict] = None) -> dict:
        """Build topology dict ready for yaml.dump(). sensitivities overrides per-host defaults."""
        if not self.hosts:
            self.parse()

        sensitivities = sensitivities or {}
        host_keys = [h['key'] for h in self.hosts]

        hosts_dict = {}
        final_sens = {}
        for h in self.hosts:
            key = h['key']
            sens = sensitivities.get(key, h['suggested_sensitivity'])
            final_sens[key] = sens
            hosts_dict[key] = {
                'os': h['os'],
                'services': h['services'],
                'vulnerabilities': h['suggested_cves'],
                'sensitivity': sens,
            }

        edges = _generate_edges(host_keys, final_sens)

        return {
            'network': {
                'hosts': hosts_dict,
                'edges': edges,
            }
        }
