#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Error: run as root: sudo $0" >&2
    exit 1
fi

CONFIG="/etc/pededit/pededit.json"

if [[ ! -f "$CONFIG" ]]; then
    echo "Error: $CONFIG not found" >&2
    exit 1
fi

# Pull client IDs from the JSON config
GOOGLE_CID=$(python3 -c "import json; print(json.load(open('$CONFIG')).get('google_client_id', ''))")
GITHUB_CID=$(python3 -c "import json; print(json.load(open('$CONFIG')).get('github_client_id', ''))")
# Error reporting (#49): empty means the frontend is built without it.
ROLLBAR_CLIENT_TOKEN=$(python3 -c "import json; print(json.load(open('$CONFIG')).get('rollbar_client_access_token', ''))")
ROLLBAR_ENV=$(python3 -c "import json; print(json.load(open('$CONFIG')).get('rollbar_environment', 'production'))")

echo "==> Pulling latest code"
cd /opt/pededit
BEFORE=$(sudo -u pededit git rev-parse HEAD:deploy/deploy.sh)
sudo -u pededit git pull
# Bash keeps running the copy of this script it started with, so steps added
# by the pull would be skipped. If the pull changed this file, start the new
# one (it pulls again, a no-op, then runs every step).
if [[ -z "${PEDEDIT_DEPLOY_REEXEC:-}" && "$(sudo -u pededit git rev-parse HEAD:deploy/deploy.sh)" != "$BEFORE" ]]; then
    echo "    deploy.sh changed, restarting it"
    PEDEDIT_DEPLOY_REEXEC=1 exec bash /opt/pededit/deploy/deploy.sh "$@"
fi

echo "==> Checking the production settings"
# manage.py check --deploy, failing on warnings (#47). Run before anything is
# built or migrated, so a refusal leaves the running site exactly as it was.
# The dependencies go in first because the new settings may import a new one
# (the same install further down is then a no-op). A warning that is accepted
# on purpose is silenced by name with the reason, in backend/peded/security.py.
cd /opt/pededit/backend
sudo -u pededit uv pip install --python .venv/bin/python -r requirements.txt
if ! sudo -u pededit .venv/bin/python manage.py check --deploy --fail-level WARNING; then
    echo "Error: manage.py check --deploy reported problems, nothing was deployed" >&2
    echo "       security.W004, W008, W012 and W016 together mean \"https\": true is not in $CONFIG" >&2
    echo "       (INSTALL.md, step 8)" >&2
    exit 1
fi
cd /opt/pededit

echo "==> Checking the backup setup"
# The dump itself is taken just before the migration (#48). Checking that it
# can be taken happens here, while stopping still leaves the site untouched.
install -d -o pededit -g pededit -m 700 /var/backups/pededit
sudo -u pededit bash /opt/pededit/deploy/backup.sh --check
# The landing page states how long backups are kept only when the nightly run
# is on (#183): without it nothing deletes old dumps on time, and the page
# says only that a copy is taken at each update.
BACKUP_MAX_DAYS=""
if systemctl is-enabled --quiet pededit-backup.timer 2>/dev/null; then
    BACKUP_MAX_DAYS=$(sudo -u pededit bash /opt/pededit/deploy/backup.sh --max-age-days)
fi

echo "==> Installing Node dependencies"
sudo -u pededit npm ci

echo "==> Writing the changelog from GitHub milestones"
# Into frontend/public (gitignored), so the build copies it into dist. On
# failure the previous file stays and the page shows the last good changelog.
sudo -u pededit node frontend/scripts/changelog.mjs \
    || echo "    (changelog fetch failed, keeping the previous one)"

echo "==> Building frontend"
echo "    VITE_GOOGLE_CLIENT_ID=${GOOGLE_CID:+(set)}"
echo "    VITE_GITHUB_CLIENT_ID=${GITHUB_CID:+(set)}"
echo "    VITE_ROLLBAR_ACCESS_TOKEN=${ROLLBAR_CLIENT_TOKEN:+(set)}"
echo "    VITE_BACKUP_MAX_DAYS=${BACKUP_MAX_DAYS:-(nightly backups off)}"
sudo -u pededit env \
    VITE_GOOGLE_CLIENT_ID="$GOOGLE_CID" \
    VITE_GITHUB_CLIENT_ID="$GITHUB_CID" \
    VITE_ROLLBAR_ACCESS_TOKEN="$ROLLBAR_CLIENT_TOKEN" \
    VITE_ROLLBAR_ENVIRONMENT="$ROLLBAR_ENV" \
    VITE_BACKUP_MAX_DAYS="$BACKUP_MAX_DAYS" \
    npm -w @pedigree-editor/frontend run build

echo "==> Updating backend"
cd /opt/pededit/backend
sudo -u pededit uv pip install --python .venv/bin/python -r requirements.txt
# A dump from before the migration, so a migration that goes wrong can be
# undone (#48, INSTALL.md step 13). A failed dump stops the deploy here: the
# database is not migrated without one.
sudo -u pededit bash /opt/pededit/deploy/backup.sh --predeploy
sudo -u pededit .venv/bin/python manage.py migrate
# The table the rate limit counters live in (#47). Does nothing once it exists.
sudo -u pededit .venv/bin/python manage.py createcachetable
sudo -u pededit .venv/bin/python manage.py collectstatic --noinput

echo "==> Restarting Gunicorn"
sudo systemctl restart pededit

echo "==> Waiting for the health check"
# Asked on loopback, straight to Gunicorn: that is the only caller the health
# check tells its commit to (backend/api/health.py).
EXPECTED=$(cd /opt/pededit && sudo -u pededit git rev-parse HEAD)
HEALTH_URL="http://127.0.0.1:8000/api/health/"
CODE=""
BODY=""
for _ in $(seq 1 30); do
    if OUT=$(curl -sS -w '\n%{http_code}' "$HEALTH_URL" 2>/dev/null); then
        CODE="${OUT##*$'\n'}"
        BODY="${OUT%$'\n'*}"
        if [[ "$CODE" == "200" ]]; then
            VERSION=$(printf '%s' "$BODY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('version',''))")
            if [[ "$VERSION" == "$EXPECTED" ]]; then
                echo "    healthy, serving $VERSION"
                echo "==> Usage"
                # Informational only (#78): a failure here must not fail a deploy
                # that is already live.
                (cd /opt/pededit/backend && sudo -u pededit .venv/bin/python manage.py usage_stats) \
                    || echo "    (usage_stats failed)"
                echo "==> Done"
                exit 0
            fi
            echo "Error: health check is serving '$VERSION', expected $EXPECTED" >&2
            exit 1
        fi
    fi
    sleep 1
done
echo "Error: $HEALTH_URL did not return 200 within 30s" >&2
if [[ -n "$CODE" ]]; then
    # 503 names the failing check: "database": "unavailable" or "disk": "low".
    echo "       last answer: HTTP $CODE $BODY" >&2
fi
echo "       sudo journalctl -u pededit -e" >&2
exit 1
