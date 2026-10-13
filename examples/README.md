# Example Topologies

Ready-made networks you can upload through **AI Orchestrator** in the web UI.

| File | Hosts | Format | Trained models included? |
|---|---:|---|---|
| `topology_50host.yaml` | 50 | YAML | **Yes**: `results/models/maskable_ppo_{red,blue}_topology_50host.zip`. The drill starts immediately. |
| `topology_10host.yaml` | 10 | YAML | No. Train first from the UI. |
| `training_demo_topology.yaml` | 10 | YAML (with explicit firewall rules) | No. Small enough to demonstrate the training pipeline. |
| `corporate_office_nmap.xml` | 12 | Nmap XML | Demonstrates Nmap import. |

`topology_50host.yaml` models a segmented enterprise network: an internet-facing DMZ, internal application subnets, workstations, domain controllers and database servers, with CVEs assigned per host.

## Notes

- A drill needs a trained **Red and Blue** model pair whose filename matches the topology name. If none exists, the API returns `409` and you train the agents from the UI first. There is no rule-based fallback.
- `corporate_office_nmap.xml` is a **synthetic** Nmap scan generated with `scripts/generate_sample_nmap.py`, not a scan of a real network. When importing Nmap XML, CVEs are suggested from detected services, and network links are inferred because Nmap output contains no topology. Both can be reviewed and edited in the UI before saving.
