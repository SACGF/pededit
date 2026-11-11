import json
import os
import secrets
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
SECRET_FILE = THIS_DIR / Path("secret_key.txt")

CONFIG_FILE = Path("/etc/pededit/pededit.json")


def _load_or_create_secret(path):
    if path.exists():
        return path.read_text().strip()
    path.parent.mkdir(parents=True, exist_ok=True)
    v = secrets.token_urlsafe(50)
    path.write_text(v)
    path.chmod(0o600)
    return v


def load_config():
    if not CONFIG_FILE.exists():
        raise RuntimeError(
            f"Missing config file: {CONFIG_FILE}\n"
            "Create it with at minimum: {\"database_url\": \"postgres://...\"}"
        )
    with CONFIG_FILE.open() as f:
        return json.load(f)


_cfg = load_config()

SECRET_KEY = (
    os.getenv("DJANGO_SECRET_KEY")
    or _cfg.get("secret_key")
    or _load_or_create_secret(SECRET_FILE)
)

DATABASE_URL     = _cfg["database_url"]
CORS_ALLOWED_ORIGINS = _cfg.get("cors_allowed_origins", [])
DEBUG            = _cfg.get("debug", False)
ALLOWED_HOSTS    = _cfg.get("allowed_hosts", ["localhost", "127.0.0.1"])

# ── Social auth ──────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID     = _cfg.get("google_client_id", "")
GITHUB_CLIENT_ID     = _cfg.get("github_client_id", "")
GITHUB_CLIENT_SECRET = _cfg.get("github_client_secret", "")

# ── Health check (api/health.py) ─────────────────────────────────────────────
# GET /api/health/ answers 503 when any of these filesystems has less free
# space than the floor. /var/lib/postgresql is where Ubuntu keeps the database;
# it is skipped where it does not exist. Add the data directory here if
# Postgres lives on another volume.
HEALTH_DISK_PATHS       = _cfg.get("health_disk_paths", ["/", "/var/lib/postgresql"])
HEALTH_DISK_MIN_FREE_MB = _cfg.get("health_disk_min_free_mb", 1024)
