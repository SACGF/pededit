#!/usr/bin/env bash
set -euo pipefail

CONFIG="/etc/pededit/pededit.json"

if [[ ! -f "$CONFIG" ]]; then
    echo "Error: $CONFIG not found" >&2
    exit 1
fi

# Pull client IDs from the JSON config
GOOGLE_CID=$(python3 -c "import json; print(json.load(open('$CONFIG')).get('google_client_id', ''))")
GITHUB_CID=$(python3 -c "import json; print(json.load(open('$CONFIG')).get('github_client_id', ''))")

echo "==> Pulling latest code"
cd /opt/pededit
sudo -u pededit git pull

echo "==> Installing Node dependencies"
sudo -u pededit npm ci

echo "==> Building frontend"
echo "    VITE_GOOGLE_CLIENT_ID=${GOOGLE_CID:+(set)}"
echo "    VITE_GITHUB_CLIENT_ID=${GITHUB_CID:+(set)}"
sudo -u pededit env \
    VITE_GOOGLE_CLIENT_ID="$GOOGLE_CID" \
    VITE_GITHUB_CLIENT_ID="$GITHUB_CID" \
    npm -w @pedigree-editor/frontend run build

echo "==> Updating backend"
cd /opt/pededit/backend
sudo -u pededit uv pip install --python .venv/bin/python -r requirements.txt
sudo -u pededit .venv/bin/python manage.py migrate
sudo -u pededit .venv/bin/python manage.py collectstatic --noinput

echo "==> Restarting Gunicorn"
sudo systemctl restart pededit

echo "==> Done"
