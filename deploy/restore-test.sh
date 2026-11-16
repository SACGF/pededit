#!/usr/bin/env bash
# Restore test (#48): proves a dump can be restored, without touching the live
# database. Restores it into a scratch database, checks the tables and row
# counts, and drops the scratch database again.
#
#   sudo bash deploy/restore-test.sh                  the newest nightly dump
#   sudo bash deploy/restore-test.sh /path/to/x.dump  that dump
#
# Run it as root on the server: the database commands then run as the
# `postgres` system user, because the app's own role cannot create databases.
# Run as anyone else it uses that user and the PG* environment as they are.
#
# Exits non-zero with a line starting "RESTORE TEST FAILED" if anything is
# wrong. A backup that has never been restored is a hope, not a backup: run
# this after setting backups up and every few months after.

set -Eeuo pipefail

ENV_FILE="${PEDEDIT_BACKUP_ENV:-/etc/pededit/backup.env}"
if [[ -r "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$ENV_FILE"
fi
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pededit}"
# The live database, read only to compare counts. Empty skips the comparison.
LIVE_DB="${RESTORE_TEST_LIVE_DB-pededit}"
# The newest dump should be last night's. Older than this and backups have
# stopped, which is the thing this test most needs to notice.
MAX_AGE_HOURS="${RESTORE_TEST_MAX_AGE_HOURS:-48}"
SCRATCH="pededit_restore_test_$$"

fail() {
    echo "RESTORE TEST FAILED: $*" >&2
    exit 1
}
trap 'echo "RESTORE TEST FAILED: line $LINENO: $BASH_COMMAND" >&2' ERR

pg() {
    if [[ $EUID -eq 0 ]]; then
        runuser -u postgres -- "$@"
    else
        "$@"
    fi
}

query() {
    pg psql --dbname="$1" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="$2"
}

# ── Which dump ───────────────────────────────────────────────────────────────
DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
    DUMP=$(find "$BACKUP_DIR" -maxdepth 1 -name 'pededit-db-*.dump' | sort | tail -n 1)
    [[ -n "$DUMP" ]] || fail "no pededit-db-*.dump in $BACKUP_DIR: the nightly backup has never succeeded"
    age_hours=$(( ($(date +%s) - $(stat -c '%Y' "$DUMP")) / 3600 ))
    (( age_hours <= MAX_AGE_HOURS )) \
        || fail "the newest dump, $DUMP, is $age_hours hours old: backups have stopped (systemctl status pededit-backup)"
fi
[[ -r "$DUMP" ]] || fail "cannot read $DUMP"
[[ "$DUMP" != *.gpg ]] || fail "$DUMP is encrypted: decrypt it first (gpg --decrypt, with the private key, not on this server)"
echo "restoring $DUMP ($(stat -c '%s' "$DUMP") bytes) into scratch database $SCRATCH"

# ── Restore ──────────────────────────────────────────────────────────────────
cleanup() {
    pg dropdb --if-exists "$SCRATCH" >/dev/null 2>&1 || echo "note: could not drop $SCRATCH, drop it by hand" >&2
}
trap cleanup EXIT

pg createdb "$SCRATCH" || fail "could not create the scratch database"
# From stdin, so the postgres user does not need to read the backup directory.
pg pg_restore --no-owner --exit-on-error --dbname="$SCRATCH" < "$DUMP" \
    || fail "pg_restore reported an error"

# ── Checks ───────────────────────────────────────────────────────────────────
for table in api_pedigree api_tagpreset auth_user django_migrations; do
    [[ "$(query "$SCRATCH" "SELECT to_regclass('public.$table') IS NOT NULL")" == "t" ]] \
        || fail "table $table is missing from the restored database"
done

pedigrees=$(query "$SCRATCH" "SELECT count(*) FROM api_pedigree")
users=$(query "$SCRATCH" "SELECT count(*) FROM auth_user")
migrations=$(query "$SCRATCH" "SELECT count(*) FROM django_migrations")
newest=$(query "$SCRATCH" "SELECT coalesce(max(updated)::text, 'none') FROM api_pedigree")
# Every pedigree's JSON came back as JSON with its people in it.
broken=$(query "$SCRATCH" "SELECT count(*) FROM api_pedigree WHERE NOT (data ? 'individuals')")

echo "restored: $pedigrees pedigrees, $users users, $migrations migrations applied"
echo "newest edit in the dump: $newest"
(( migrations > 0 )) || fail "django_migrations is empty"
(( broken == 0 )) || fail "$broken restored pedigrees have no individuals in their data"

if [[ -n "$LIVE_DB" ]]; then
    if live=$(query "$LIVE_DB" "SELECT count(*) FROM api_pedigree" 2>/dev/null); then
        echo "live database $LIVE_DB has $live pedigrees now"
        # The dump is older than now, so the counts differ a little. An empty
        # or half-sized restore beside a full live database is a bad dump.
        (( pedigrees * 2 >= live )) \
            || fail "the dump has $pedigrees pedigrees, the live database $live: the dump is missing data"
    else
        echo "note: could not read live database $LIVE_DB, counts not compared"
    fi
fi

echo "RESTORE TEST PASSED: $DUMP restores cleanly"
