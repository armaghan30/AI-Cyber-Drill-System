
import random
import sys
import time
from pathlib import Path

# Realistic host profiles weighted by typical enterprise frequency
PROFILES = [
    # (name_prefix, os_match, services_pool, weight)
    ('web',     'Linux 5.4 (Ubuntu 20.04)',     [('ssh', 22), ('http', 80), ('https', 443)], 4),
    ('db',      'Linux 4.15 (CentOS 7)',        [('ssh', 22), ('mysql', 3306)], 2),
    ('dbpg',    'Linux 5.10 (Debian 11)',       [('ssh', 22), ('postgresql', 5432)], 1),
    ('mail',    'Linux 5.10 (Debian 11)',       [('ssh', 22), ('smtp', 25), ('imap', 143)], 1),
    ('file',    'Microsoft Windows Server 2019',[('netbios-ssn', 139), ('microsoft-ds', 445), ('rdp', 3389)], 2),
    ('ad',      'Microsoft Windows Server 2019',[('ldap', 389), ('microsoft-ds', 445), ('rdp', 3389)], 1),
    ('ws',      'Microsoft Windows 10',          [('rdp', 3389), ('microsoft-ds', 445)], 8),
    ('printer', 'Linux 3.10 (embedded)',        [('snmp', 161)], 1),
    ('dev',     'Linux 5.4 (Ubuntu 22.04)',     [('ssh', 22), ('http', 8080)], 2),
]


def _pick_profile():
    weights = [p[3] for p in PROFILES]
    return random.choices(PROFILES, weights=weights, k=1)[0]


def generate(num_hosts: int) -> str:
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<!DOCTYPE nmaprun>',
             f'<nmaprun scanner="nmap" args="nmap -sV -O -oX scan.xml 192.168.1.0/24" '
             f'start="{int(time.time())}" version="7.94">']

    counts = {}
    for i in range(num_hosts):
        prefix, osmatch, services, _ = _pick_profile()
        counts[prefix] = counts.get(prefix, 0) + 1
        idx = counts[prefix]
        ip = f'192.168.1.{i + 10}'
        hostname = f'{prefix}-{idx:02d}.corp.local'
        osfam = 'Windows' if 'Microsoft' in osmatch else 'Linux'

        port_xml = ''.join(
            f'<port protocol="tcp" portid="{port}"><state state="open" reason="syn-ack"/>'
            f'<service name="{name}"/></port>'
            for name, port in services
        )

        parts.append(
            f'<host starttime="{int(time.time())}" endtime="{int(time.time()) + 1}">'
            f'<status state="up" reason="echo-reply"/>'
            f'<address addr="{ip}" addrtype="ipv4"/>'
            f'<hostnames><hostname name="{hostname}" type="PTR"/></hostnames>'
            f'<ports>{port_xml}</ports>'
            f'<os><osmatch name="{osmatch}" accuracy="95">'
            f'<osclass type="general purpose" vendor="{osfam}" osfamily="{osfam}"/>'
            f'</osmatch></os>'
            f'</host>'
        )

    parts.append('</nmaprun>')
    return '\n'.join(parts)


if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    out = sys.argv[2] if len(sys.argv) > 2 else f'sample_{n}host_nmap.xml'
    xml = generate(n)
    Path(out).write_text(xml, encoding='utf-8')
    print(f'Wrote {n} hosts -> {out} ({len(xml)} bytes)')
