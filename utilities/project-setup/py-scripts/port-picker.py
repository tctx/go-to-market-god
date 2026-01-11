"""
pick-a-free-port → write settings/config.yaml
                → update mcp/mcp-logs/logs.descriptor.json
"""
import socket, secrets, contextlib, yaml, json
from pathlib import Path

# ---------- paths ----------
CFG_YAML   = Path("settings/config.yaml")
MCP_JSON   = Path("mcp/mcp-logs/config.json")

# ---------- constants ----------
LOW, HIGH  = 1024, 65535

# ---------- helpers ----------
def random_free_port() -> int:
    while True:
        port = secrets.randbelow(HIGH - LOW + 1) + LOW
        with contextlib.closing(socket.socket()) as s:
            try:
                s.bind(("", port))
                return port
            except OSError:
                continue

def write_config_yaml(port: int) -> None:
    cfg = yaml.safe_load(CFG_YAML.read_text())
    cfg["app"]["port"] = port
    CFG_YAML.write_text(yaml.dump(cfg, sort_keys=False))

def update_mcp_descriptor(port: int) -> None:
    if not MCP_JSON.exists():
        print(f"⚠️  {MCP_JSON} not found; skipped MCP update")
        return

    data = json.loads(MCP_JSON.read_text())

    # normalise → keep other URLs that user may have added
    new_root = f"http://localhost:{port}"
    urls     = data.get("dev_urls", [])
    # replace any *old* localhost entry, else append
    urls = [u for u in urls if not u.startswith("http://localhost:")]
    urls.insert(0, new_root)
    data["dev_urls"] = urls

    MCP_JSON.write_text(json.dumps(data, indent=2))
    print(f"MCP dev_urls now → {data['dev_urls']}")

def main() -> None:
    cfg = yaml.safe_load(CFG_YAML.read_text())
    port = random_free_port() if cfg["app"]["port"] == 0 else cfg["app"]["port"]

    write_config_yaml(port)
    update_mcp_descriptor(port)

    print(f"✅  Port {port}  (saved in {CFG_YAML})")

if __name__ == "__main__":
    main()
