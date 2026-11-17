#!/usr/bin/env bash
# Database backup (#48). Run by pededit-backup.timer every night as the
# `pededit` user, and by deploy.sh before migrations (--predeploy).
#
#   backup.sh              dump, prune, copy off the box
#   backup.sh --predeploy  dump and prune only, kept apart from the nightly set
#   backup.sh --check      check the setup, change nothing (deploy.sh preflight)
#   backup.sh --max-age-days  print the retention limit in days (deploy.sh)
#
# What it does:
#   1. pg_dump in custom format (compressed) to a temporary name, checks the
#      dump is a readable archive of a plausible size that contains the
#      pedigree table, then renames it into place. A half-written dump never
#      has a final name.
#   2. Retention by age (#183): no dump is kept longer than
#      BACKUP_MAX_AGE_DAYS (default 7), nightly or pre-deploy, here or off the
#      box. The landing page states this limit to users, so it is a promise:
#      a run deletes what is past it before it dumps, so a dump that fails
#      every night still cannot keep an old one. Within the limit: the
#      newest dump of each day, and the newest 5 pre-deploy dumps.
#   3. Off-box copy: mirrors the kept set to an rclone remote and/or an
#      rsync-over-ssh destination, encrypted first if a GnuPG public key is
#      configured. With no destination it says so on every run: a backup on
#      the same disk is not a backup.
#
# Any failure exits non-zero with a line starting "BACKUP FAILED", so the
# systemd unit goes to "failed" and the journal says why.
#
# Settings come from /etc/pededit/backup.env (optional, see backup.env.example)
# and the database from "database_url" in /etc/pededit/pededit.json.

set -Eeuo pipefail
umask 077

CONFIG="${PEDEDIT_CONFIG:-/etc/pededit/pededit.json}"
ENV_FILE="${PEDEDIT_BACKUP_ENV:-/etc/pededit/backup.env}"

MODE="nightly"
case "${1:-}" in
    "") ;;
    --predeploy) MODE="predeploy" ;;
    --check) MODE="check" ;;
    --max-age-days) MODE="max-age" ;;
    *) echo "usage: $0 [--predeploy | --check | --max-age-days]" >&2; exit 2 ;;
esac

fail() {
    echo "BACKUP FAILED: $*" >&2
    exit 1
}
trap 'echo "BACKUP FAILED: line $LINENO: $BASH_COMMAND" >&2' ERR

# ── Settings ─────────────────────────────────────────────────────────────────
if [[ -e "$ENV_FILE" ]]; then
    # The file is sourced, so whoever can write it runs code as this user,
    # and it may name credentials. Refuse anything open to "other".
    perms=$(stat -c '%a' "$ENV_FILE")
    if (( 8#$perms & 8#007 )); then
        fail "$ENV_FILE has mode $perms, must not be readable or writable by others (chmod 640)"
    fi
    # shellcheck disable=SC1090
    source "$ENV_FILE"
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/pededit}"
BACKUP_MAX_AGE_DAYS="${BACKUP_MAX_AGE_DAYS:-7}"
BACKUP_KEEP_PREDEPLOY="${BACKUP_KEEP_PREDEPLOY:-5}"
[[ "$BACKUP_MAX_AGE_DAYS" =~ ^[0-9]+$ ]] && (( BACKUP_MAX_AGE_DAYS >= 2 )) \
    || fail "BACKUP_MAX_AGE_DAYS is '$BACKUP_MAX_AGE_DAYS', must be a whole number of days, at least 2"
if [[ -n "${BACKUP_KEEP_DAILY:-}${BACKUP_KEEP_WEEKLY:-}" ]]; then
    echo "WARNING: BACKUP_KEEP_DAILY and BACKUP_KEEP_WEEKLY in $ENV_FILE are no longer read;" >&2
    echo "WARNING: retention is BACKUP_MAX_AGE_DAYS ($BACKUP_MAX_AGE_DAYS days)." >&2
fi
# A dump of an empty PedEdit database (schema only) is about 30 kB. Anything
# under this is a dump of nothing.
BACKUP_MIN_BYTES="${BACKUP_MIN_BYTES:-20000}"
BACKUP_RCLONE_DEST="${BACKUP_RCLONE_DEST:-}"
BACKUP_RSYNC_DEST="${BACKUP_RSYNC_DEST:-}"
BACKUP_RSYNC_SSH_KEY="${BACKUP_RSYNC_SSH_KEY:-}"
BACKUP_GPG_PUBLIC_KEY="${BACKUP_GPG_PUBLIC_KEY:-}"
BACKUP_PING_URL="${BACKUP_PING_URL:-}"
# A mirror run normally removes one or two old dumps. More than this in one
# go means something is wrong locally, and the copies off the box are left.
# It is per mirror, and a nightly run mirrors twice (before and after the dump).
BACKUP_MAX_REMOTE_DELETE="${BACKUP_MAX_REMOTE_DELETE:-10}"

DB_PATTERN='^pededit-db-[0-9]{8}T[0-9]{6}Z\.dump$'
PREDEPLOY_PATTERN='^pededit-predeploy-[0-9]{8}T[0-9]{6}Z\.dump$'
OFFSITE_DIR="$BACKUP_DIR/offsite"

now_epoch() {
    # PEDEDIT_BACKUP_NOW (epoch seconds) is for the retention tests only.
    echo "${PEDEDIT_BACKUP_NOW:-$(date -u +%s)}"
}

# ── Database connection ──────────────────────────────────────────────────────
# Passed to pg_dump in the environment, never on a command line, where the
# password would show in `ps`.
load_database() {
    [[ -r "$CONFIG" ]] || fail "cannot read $CONFIG"
    local vars
    vars=$(python3 - "$CONFIG" <<'PY'
import json, shlex, sys
from urllib.parse import unquote, urlparse

url = urlparse(json.load(open(sys.argv[1]))["database_url"])
if url.scheme not in ("postgres", "postgresql", "pgsql", "psql"):
    sys.exit(f"database_url is {url.scheme}, not PostgreSQL: nothing to dump")
values = {
    "PGHOST": unquote(url.hostname or ""),
    "PGPORT": str(url.port or ""),
    "PGUSER": unquote(url.username or ""),
    "PGPASSWORD": unquote(url.password or ""),
    "PGDATABASE": unquote(url.path.lstrip("/")),
}
for key, value in values.items():
    if value:
        print(f"export {key}={shlex.quote(value)}")
PY
    ) || fail "could not read database_url from $CONFIG"
    eval "$vars"
    [[ -n "${PGDATABASE:-}" ]] || fail "database_url in $CONFIG names no database"
}

# ── Checks shared by every mode ──────────────────────────────────────────────
check_setup() {
    local tool
    for tool in pg_dump pg_restore python3 flock; do
        command -v "$tool" >/dev/null || fail "$tool is not installed"
    done
    [[ -d "$BACKUP_DIR" && -w "$BACKUP_DIR" ]] \
        || fail "$BACKUP_DIR is missing or not writable by $(id -un) (INSTALL.md, step 13)"
    if [[ -n "$BACKUP_RCLONE_DEST" ]]; then
        command -v rclone >/dev/null || fail "BACKUP_RCLONE_DEST is set but rclone is not installed"
    fi
    if [[ -n "$BACKUP_RSYNC_DEST" ]]; then
        command -v rsync >/dev/null || fail "BACKUP_RSYNC_DEST is set but rsync is not installed"
        [[ -z "$BACKUP_RSYNC_SSH_KEY" || -r "$BACKUP_RSYNC_SSH_KEY" ]] \
            || fail "cannot read BACKUP_RSYNC_SSH_KEY $BACKUP_RSYNC_SSH_KEY"
    fi
    if [[ -n "$BACKUP_GPG_PUBLIC_KEY" ]]; then
        command -v gpg >/dev/null || fail "BACKUP_GPG_PUBLIC_KEY is set but gpg is not installed"
        [[ -r "$BACKUP_GPG_PUBLIC_KEY" ]] || fail "cannot read BACKUP_GPG_PUBLIC_KEY $BACKUP_GPG_PUBLIC_KEY"
    fi
}

has_destination() {
    [[ -n "$BACKUP_RCLONE_DEST" || -n "$BACKUP_RSYNC_DEST" ]]
}

warn_local_only() {
    echo "WARNING: no off-box destination is configured (BACKUP_RCLONE_DEST or" >&2
    echo "WARNING: BACKUP_RSYNC_DEST in $ENV_FILE). This backup is LOCAL ONLY, on" >&2
    echo "WARNING: the same disk as the database. It will not survive losing the server." >&2
}

# ── Dump ─────────────────────────────────────────────────────────────────────
dump() {
    local prefix="$1" stamp final tmp size
    stamp=$(date -u -d "@$(now_epoch)" +%Y%m%dT%H%M%SZ)
    final="$BACKUP_DIR/$prefix-$stamp.dump"
    tmp="$BACKUP_DIR/.tmp-$prefix-$stamp.$$"
    # Remove the partial file on any way out of this function's work.
    trap 'rm -f "$BACKUP_DIR"/.tmp-*."$$"' EXIT

    pg_dump --format=custom --compress=6 --file="$tmp" \
        || fail "pg_dump exited with an error"

    size=$(stat -c '%s' "$tmp")
    (( size >= BACKUP_MIN_BYTES )) \
        || fail "dump is $size bytes, under the $BACKUP_MIN_BYTES byte floor: not keeping it"
    # Reads the archive's table of contents: catches a truncated or corrupt
    # file, and a dump of the wrong or an empty database.
    local contents
    contents=$(pg_restore --list "$tmp") || fail "pg_restore cannot read the dump it just wrote"
    grep -q 'TABLE DATA public api_pedigree ' <<<"$contents" \
        || fail "dump does not contain the api_pedigree table: wrong or empty database"

    sync "$tmp"
    mv "$tmp" "$final"
    echo "dumped $PGDATABASE to $final ($size bytes)"
}

# ── Retention ────────────────────────────────────────────────────────────────
list_dumps() {
    # Newest first. The timestamp in the name sorts as text.
    local pattern="$1" name
    for name in "$BACKUP_DIR"/pededit-*.dump; do
        [[ -e "$name" ]] || continue
        name=${name##*/}
        if [[ "$name" =~ $pattern ]]; then echo "$name"; fi
    done | sort -r
}

stamp_of() {
    local name="${1%.dump}"
    echo "${name##*-}"
}

# Dumps older than this UTC stamp are past the limit. A day less than the
# limit, less an hour for the timer's random delay: the nightly run then
# deletes a dump about N-1 days after it was taken, and even with one night
# missed it is gone before it is N days old.
age_cutoff() {
    date -u -d "@$(( $(now_epoch) - (BACKUP_MAX_AGE_DAYS - 1) * 86400 + 3600 ))" +%Y%m%dT%H%M%SZ
}

prune() {
    local name stamp day cutoff kept=0 removed=0 count=0
    local -A day_seen=()
    cutoff=$(age_cutoff)

    # Nightly dumps: the newest of each day, none past the limit.
    while read -r name; do
        [[ -n "$name" ]] || continue
        stamp=$(stamp_of "$name")
        day=${stamp:0:8}
        if [[ -z "${day_seen[$day]:-}" && ! "$stamp" < "$cutoff" ]]; then
            day_seen[$day]=1; kept=$((kept + 1))
        else
            rm -f "$BACKUP_DIR/$name"; removed=$((removed + 1))
        fi
    done < <(list_dumps "$DB_PATTERN")

    # Pre-deploy dumps: a few recent ones for rolling a migration back, under
    # the same limit.
    while read -r name; do
        [[ -n "$name" ]] || continue
        count=$((count + 1))
        if (( count > BACKUP_KEEP_PREDEPLOY )) || [[ "$(stamp_of "$name")" < "$cutoff" ]]; then
            rm -f "$BACKUP_DIR/$name"; removed=$((removed + 1))
        else
            kept=$((kept + 1))
        fi
    done < <(list_dumps "$PREDEPLOY_PATTERN")

    # Partial files left by a run that was killed.
    find "$BACKUP_DIR" -maxdepth 2 -name '.tmp-*' -mmin +1440 -delete

    echo "retention: kept $kept, removed $removed (in $BACKUP_DIR)"
}

# ── Off-box copy ─────────────────────────────────────────────────────────────
# With a public key, what leaves the box is OFFSITE_DIR: one .gpg per kept
# dump. The private key is not on this server, so the copies can be read only
# by whoever holds it. The local dumps stay unencrypted (the live database
# sits beside them, and the restore test needs to read them).
encrypt_offsite() {
    local gpg_home name
    mkdir -p "$OFFSITE_DIR"
    gpg_home=$(mktemp -d)
    # shellcheck disable=SC2064
    trap "rm -rf '$gpg_home'; rm -f '$OFFSITE_DIR'/.tmp-*.'$$'" EXIT
    for name in $(list_dumps "$DB_PATTERN") $(list_dumps "$PREDEPLOY_PATTERN"); do
        if [[ -e "$OFFSITE_DIR/$name.gpg" ]]; then continue; fi
        gpg --batch --quiet --no-tty --homedir "$gpg_home" --trust-model always \
            --compress-algo none --recipient-file "$BACKUP_GPG_PUBLIC_KEY" \
            --output "$OFFSITE_DIR/.tmp-$name.$$" --encrypt "$BACKUP_DIR/$name" \
            || fail "gpg could not encrypt $name with $BACKUP_GPG_PUBLIC_KEY"
        mv "$OFFSITE_DIR/.tmp-$name.$$" "$OFFSITE_DIR/$name.gpg"
    done
    for name in "$OFFSITE_DIR"/pededit-*.dump.gpg; do
        [[ -e "$name" ]] || continue
        name=${name##*/}
        if [[ ! -e "$BACKUP_DIR/${name%.gpg}" ]]; then rm -f "$OFFSITE_DIR/$name"; fi
    done
}

# Returns non-zero when a mirror fails; the caller says what that means.
copy_off_box() {
    local source="$BACKUP_DIR" what="unencrypted"
    if [[ -n "$BACKUP_GPG_PUBLIC_KEY" ]]; then
        encrypt_offsite
        source="$OFFSITE_DIR"
        what="encrypted with $BACKUP_GPG_PUBLIC_KEY"
    fi
    # Both tools mirror: a dump pruned here is removed there, so the copies
    # follow the same retention. Only names matching pededit-*.dump* are
    # touched at the destination.
    if [[ -n "$BACKUP_RCLONE_DEST" ]]; then
        rclone sync "$source" "$BACKUP_RCLONE_DEST" \
            --include '/pededit-*.dump*' --max-delete "$BACKUP_MAX_REMOTE_DELETE" \
            || { echo "rclone could not mirror to $BACKUP_RCLONE_DEST" >&2; return 1; }
        echo "off-box: mirrored to $BACKUP_RCLONE_DEST with rclone ($what)"
    fi
    if [[ -n "$BACKUP_RSYNC_DEST" ]]; then
        local ssh="ssh -o BatchMode=yes"
        if [[ -n "$BACKUP_RSYNC_SSH_KEY" ]]; then ssh="$ssh -i $BACKUP_RSYNC_SSH_KEY"; fi
        rsync --recursive --times --delete --max-delete="$BACKUP_MAX_REMOTE_DELETE" \
            --include='/pededit-*.dump*' --exclude='*' -e "$ssh" \
            "$source/" "$BACKUP_RSYNC_DEST/" \
            || { echo "rsync could not mirror to $BACKUP_RSYNC_DEST" >&2; return 1; }
        echo "off-box: mirrored to $BACKUP_RSYNC_DEST with rsync ($what)"
    fi
}

# ── Main ─────────────────────────────────────────────────────────────────────
if [[ "$MODE" == "max-age" ]]; then
    echo "$BACKUP_MAX_AGE_DAYS"
    exit 0
fi

load_database
check_setup

if [[ "$MODE" == "check" ]]; then
    echo "backup setup looks right: $PGDATABASE to $BACKUP_DIR, kept at most $BACKUP_MAX_AGE_DAYS days"
    has_destination || warn_local_only
    exit 0
fi

# One run at a time: the nightly timer and a deploy can meet.
exec 9>"$BACKUP_DIR/.lock"
flock --wait 600 9 || fail "another backup has held $BACKUP_DIR/.lock for 10 minutes"

# Past the limit goes first, here and off the box, so a dump that fails
# cannot leave an old one behind (the promise on the landing page).
prune
if [[ "$MODE" == "nightly" ]] && has_destination && ! copy_off_box; then
    echo "WARNING: could not remove expired copies off the box yet; trying again after the dump" >&2
fi

if [[ "$MODE" == "predeploy" ]]; then
    dump "pededit-predeploy"
    prune
    echo "pre-deploy dump is local; the nightly run copies it off the box"
    exit 0
fi

dump "pededit-db"
prune
if has_destination; then
    copy_off_box || fail "the off-box copy failed (the local dump was kept)"
else
    warn_local_only
fi

if [[ -n "$BACKUP_PING_URL" ]]; then
    # A dead man's switch (healthchecks.io and the like): it alerts when this
    # ping stops arriving, which also covers the timer never firing.
    curl -fsS --max-time 20 --retry 3 -o /dev/null "$BACKUP_PING_URL" \
        || fail "backup succeeded but the ping to BACKUP_PING_URL failed"
fi
echo "backup finished"
