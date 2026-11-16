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

# ── HTTPS (peded/security.py, #47) ───────────────────────────────────────────
# "https": true turns on the HTTPS redirect, secure cookies and HSTS. Set it
# only once the site answers on https, and never on a development machine.
# HSTS starts at one hour: a browser that saw the header refuses plain HTTP
# for that long, so a mistake costs an hour. Raise "hsts_seconds" in steps
# (86400, then 31536000) once it has run clean; see INSTALL.md.
HTTPS                   = _cfg.get("https", False)
HSTS_SECONDS            = _cfg.get("hsts_seconds", 3600)
HSTS_INCLUDE_SUBDOMAINS = _cfg.get("hsts_include_subdomains", True)

# ── Rate limits (api/throttling.py, #47) ─────────────────────────────────────
# Per client address. "throttle_rates" in the config overrides single scopes;
# null turns one off. Sized for a clinic or a class behind one address: sign-in
# happens once a week per person, a refresh every 15 minutes per open tab, and
# nobody draws 20 new pedigrees a minute.
DEFAULT_THROTTLE_RATES = {
    "auth_login": "20/min",
    "auth_refresh": "60/min",
    "anon_create_burst": "20/min",
    "anon_create_sustained": "500/day",
}
THROTTLE_RATES = {**DEFAULT_THROTTLE_RATES, **_cfg.get("throttle_rates", {})}
# How many proxies sit between the internet and Gunicorn, each appending to
# X-Forwarded-For. Nginx alone is 1. Nginx behind Cloudflare or another CDN
# is 2. Too low and everyone behind the CDN shares one bucket; too high and a
# client can pick its own bucket by sending the header itself.
NUM_PROXIES = _cfg.get("num_proxies", 1)

# ── Error reporting (peded/error_reporting.py, #49) ──────────────────────────
# Off without a token, and whenever debug is on. rollbar_access_token is the
# project's post_server_item token. rollbar_client_access_token
# (post_client_item) is not read here: deploy.sh passes it to the frontend build.
ROLLBAR_ACCESS_TOKEN = _cfg.get("rollbar_access_token", "")
ROLLBAR_ENVIRONMENT  = _cfg.get("rollbar_environment", "production")
