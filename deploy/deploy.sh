#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'USAGE'
Usage: sudo bash /opt/pededit/deploy/deploy.sh               deploy the latest main
       sudo bash /opt/pededit/deploy/deploy.sh --back-to [REF]  go back to a release

--back-to checks out REF (a release tag such as 2026-11-16-family-business, or
a commit), then builds, installs and restarts as a deploy does, but does not
migrate. With no REF it goes back to the commit the last deploy (or --back-to)
replaced, from /var/lib/pededit/deploys.log, so running it twice returns. It refuses when the database has migrations REF
does not have, or lacks ones it needs, and says how to fix that. A plain
deploy afterwards returns to main.
USAGE
}

MODE=deploy
TARGET_REF=""
ORIG_ARGS=("$@")
while [[ $# -gt 0 ]]; do
    case "$1" in
        --back-to)
            MODE=back-to
            if [[ $# -gt 1 && "$2" != -* ]]; then
                TARGET_REF="$2"
                shift
            fi
            ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Error: unknown argument '$1'" >&2; usage >&2; exit 1 ;;
    esac
    shift
done

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

REPO=/opt/pededit
# One line per restart: time, mode, the commit that was running, the commit
# started. --back-to with no ref reads its default from the last line.
DEPLOY_LOG=/var/lib/pededit/deploys.log
git_() { sudo -u pededit git -C "$REPO" "$@"; }
cd "$REPO"

backup_max_days() {
    # The landing page states how long backups are kept only when the nightly
    # run is on (#183): without it nothing deletes old dumps on time, and the
    # page says only that a copy is taken at each update.
    BACKUP_MAX_DAYS=""
    if systemctl is-enabled --quiet pededit-backup.timer 2>/dev/null; then
        BACKUP_MAX_DAYS=$(sudo -u pededit bash "$REPO/deploy/backup.sh" --max-age-days)
    fi
}

if [[ "$MODE" == deploy ]]; then
    echo "==> Pulling latest code"
    # The commit being replaced, kept across the restart below.
    OLD="${PEDEDIT_DEPLOY_OLD:-$(git_ rev-parse HEAD)}"
    BEFORE=$(git_ rev-parse HEAD:deploy/deploy.sh)
    # After --back-to the checkout is detached at a release, where git pull
    # fails.
    if ! git_ symbolic-ref -q HEAD >/dev/null; then
        echo "    detached at $(git_ describe --tags --always HEAD), going back to main"
        git_ checkout --quiet main
    fi
    git_ pull
    # Bash keeps running the copy of this script it started with, so steps added
    # by the pull would be skipped. If the pull changed this file, start the new
    # one (it pulls again, a no-op, then runs every step).
    if [[ -z "${PEDEDIT_DEPLOY_REEXEC:-}" && "$(git_ rev-parse HEAD:deploy/deploy.sh)" != "$BEFORE" ]]; then
        echo "    deploy.sh changed, restarting it"
        PEDEDIT_DEPLOY_REEXEC=1 PEDEDIT_DEPLOY_OLD="$OLD" exec bash "$REPO/deploy/deploy.sh" "${ORIG_ARGS[@]}"
    fi
else
    echo "==> Finding the release to go back to"
    OLD=$(git_ rev-parse HEAD)
    # The branch to return to if the new release is refused below.
    OLD_CHECKOUT=$(git_ symbolic-ref -q --short HEAD || echo "$OLD")
    if [[ -z "$TARGET_REF" ]]; then
        # The last restart that changed the commit: a deploy with nothing new
        # to pull is logged too.
        TARGET_REF=$(awk '$3 != $4 {ref = $3} END {print ref}' "$DEPLOY_LOG" 2>/dev/null || true)
        if [[ -z "$TARGET_REF" ]]; then
            echo "Error: $DEPLOY_LOG has no deploys yet, so name the release:" >&2
            echo "       sudo bash $0 --back-to <tag>   (git -C $REPO tag -n1 lists them)" >&2
            exit 1
        fi
        echo "    the last deploy replaced $TARGET_REF ($DEPLOY_LOG)"
    fi
    git_ fetch --quiet --tags origin
    if ! TARGET=$(git_ rev-parse --verify --quiet "$TARGET_REF^{commit}"); then
        echo "Error: '$TARGET_REF' is not a tag or commit here (git -C $REPO tag -n1 lists the releases)" >&2
        exit 1
    fi
    echo "    running $(git_ describe --tags --always "$OLD"), going back to $(git_ describe --tags --always "$TARGET")"
    if [[ "$TARGET" == "$OLD" ]]; then
        echo "    that is the commit already checked out, nothing to do"
        exit 0
    fi

    echo "==> Comparing the database's migrations with the release"
    # Checked with the code that is running now, before anything changes.
    # Only this project's apps: the migrations of Django and other packages
    # come with requirements.txt, not with the checkout.
    cd "$REPO/backend"
    APPLIED=$(sudo -u pededit .venv/bin/python manage.py showmigrations --list)
    cd "$REPO"
    TARGET_FILES=$(git_ ls-tree -r --name-only "$TARGET" -- backend)
    CURRENT_FILES=$(git_ ls-tree -r --name-only HEAD -- backend)
    if ! APPLIED="$APPLIED" TARGET_FILES="$TARGET_FILES" CURRENT_FILES="$CURRENT_FILES" \
        REF="$TARGET_REF" python3 - <<'PY'
import os, re, sys

def migrations(listing):
    found = {}
    for path in listing.split():
        m = re.fullmatch(r"backend/(\w+)/migrations/(\w+)\.py", path)
        if m and m.group(2) != "__init__":
            found.setdefault(m.group(1), set()).add(m.group(2))
    return found

target = migrations(os.environ["TARGET_FILES"])
local_apps = set(target) | set(migrations(os.environ["CURRENT_FILES"]))
applied, app = {}, None
for line in os.environ["APPLIED"].splitlines():
    if line and not line.startswith(" "):
        app = line.strip()
    elif app and line.strip().startswith("[X]"):
        applied.setdefault(app, set()).add(line.strip()[3:].strip())

ref, ok = os.environ["REF"], True
for app in sorted(local_apps):
    have, want = applied.get(app, set()), target.get(app, set())
    extra, missing = sorted(have - want), sorted(want - have)
    if extra:
        ok = False
        back = max(want) if want else "zero"
        print(f"Error: the database has {app} migrations that {ref} does not: {', '.join(extra)}", file=sys.stderr)
        print("       Undo them first, with the code that is running now (this drops what they added,", file=sys.stderr)
        print("       data in it included, so it is worth reading them first):", file=sys.stderr)
        print(f"         cd /opt/pededit/backend && sudo -u pededit .venv/bin/python manage.py migrate {app} {back}", file=sys.stderr)
        print("       or restore the pededit-predeploy dump taken before they ran (INSTALL.md step 13),", file=sys.stderr)
        print("       then run this again.", file=sys.stderr)
    if missing:
        ok = False
        print(f"Error: {ref} has {app} migrations the database has not run: {', '.join(missing)}", file=sys.stderr)
        print("       --back-to never migrates. Going forward is a plain deploy.sh.", file=sys.stderr)
sys.exit(0 if ok else 1)
PY
    then
        echo "       Nothing was changed." >&2
        exit 1
    fi
    echo "    they match"

    # Computed with the scripts that are running now: older releases'
    # backup.sh may not answer --max-age-days.
    backup_max_days
    if ! git_ diff --quiet "$OLD" "$TARGET" -- deploy/backup.sh; then
        echo "    Warning: deploy/backup.sh differs in this release, and the nightly backup runs the"
        echo "    checked-out copy, so its retention is that release's until the next deploy."
    fi

    echo "==> Checking out $TARGET_REF"
    git_ checkout --quiet --detach "$TARGET"
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
    if [[ "$MODE" == back-to ]]; then
        git_ checkout --quiet "$OLD_CHECKOUT"
        sudo -u pededit uv pip install --python .venv/bin/python -r requirements.txt
        echo "       (checked out $OLD_CHECKOUT and its requirements again)" >&2
    fi
    echo "       security.W004, W008, W012 and W016 together mean \"https\": true is not in $CONFIG" >&2
    echo "       (INSTALL.md, step 8)" >&2
    exit 1
fi
cd /opt/pededit

if [[ "$MODE" == deploy ]]; then
    echo "==> Checking the backup setup"
    # The dump itself is taken just before the migration (#48). Checking that it
    # can be taken happens here, while stopping still leaves the site untouched.
    # --back-to does not migrate, so it takes no dump.
    install -d -o pededit -g pededit -m 700 /var/backups/pededit
    sudo -u pededit bash /opt/pededit/deploy/backup.sh --check
    backup_max_days
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
if [[ "$MODE" == deploy ]]; then
    # A dump from before the migration, so a migration that goes wrong can be
    # undone (#48, INSTALL.md step 13). A failed dump stops the deploy here: the
    # database is not migrated without one.
    sudo -u pededit bash /opt/pededit/deploy/backup.sh --predeploy
    sudo -u pededit .venv/bin/python manage.py migrate
fi
# The table the rate limit counters live in (#47). Does nothing once it exists.
sudo -u pededit .venv/bin/python manage.py createcachetable
sudo -u pededit .venv/bin/python manage.py collectstatic --noinput

echo "==> Restarting Gunicorn"
sudo systemctl restart pededit
NEW=$(git_ rev-parse HEAD)
install -d -m 755 "$(dirname "$DEPLOY_LOG")"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $MODE $OLD $NEW $(git_ describe --tags --always "$NEW")" >> "$DEPLOY_LOG"

done_() {
    echo "==> Usage"
    # Informational only (#78): a failure here must not fail a deploy
    # that is already live.
    (cd /opt/pededit/backend && sudo -u pededit .venv/bin/python manage.py usage_stats) \
        || echo "    (usage_stats failed)"
    if [[ "$MODE" == back-to ]]; then
        echo "    Checked out $(git_ describe --tags --always HEAD), detached. To go forward again"
        echo "    (an older release's deploy.sh may not know how to leave a detached checkout):"
        echo "      sudo -u pededit git -C $REPO checkout main && sudo bash $REPO/deploy/deploy.sh"
    fi
    echo "==> Done"
    exit 0
}

if [[ ! -f /opt/pededit/backend/api/health.py ]]; then
    echo "    this release has no health check (#50): check https://pededit.com by hand"
    done_
fi

echo "==> Waiting for the health check"
# Asked on loopback, straight to Gunicorn: that is the only caller the health
# check tells its commit to (backend/api/health.py).
EXPECTED="$NEW"
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
                done_
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
