#!/usr/bin/env bash
# Tests for backup.sh that need no database (#48): pg_dump, pg_restore and
# rclone are replaced by stubs on PATH, and the clock by PEDEDIT_BACKUP_NOW.
# Covers retention, the failure paths and the off-box copy (rsync to a local
# directory, GnuPG if it is installed).
#
#   bash deploy/test-backup.sh
#
# It does not prove a dump restores. That is restore-test.sh, against a real
# PostgreSQL.

set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FAILED=0
OUT="$WORK/out"

ok() { echo "ok    $1"; }
bad() { echo "FAIL  $1"; FAILED=1; [[ -f "$OUT" ]] && sed 's/^/        /' "$OUT"; }
check() { # check "name" command...
    local name="$1"; shift
    if "$@"; then ok "$name"; else bad "$name"; fi
}

# ── Stubs ────────────────────────────────────────────────────────────────────
mkdir -p "$WORK/bin"
cat > "$WORK/bin/pg_dump" <<'EOF'
#!/usr/bin/env bash
[[ -n "${STUB_DUMP_FAILS:-}" ]] && { echo "pg_dump: error: connection refused" >&2; exit 1; }
for arg in "$@"; do [[ "$arg" == --file=* ]] && file="${arg#--file=}"; done
echo "PGPASSWORD=${PGPASSWORD:-} args=$*" > "$STUB_LOG.pg_dump"
head -c "${STUB_DUMP_BYTES:-50000}" /dev/urandom > "$file"
EOF
cat > "$WORK/bin/pg_restore" <<'EOF'
#!/usr/bin/env bash
[[ -n "${STUB_RESTORE_FAILS:-}" ]] && { echo "pg_restore: error: not a valid archive" >&2; exit 1; }
echo "3; 0 0 TABLE DATA public ${STUB_TABLE:-api_pedigree} pededit"
EOF
cat > "$WORK/bin/rclone" <<'EOF'
#!/usr/bin/env bash
echo "$*" > "$STUB_LOG.rclone"
[[ -z "${STUB_RCLONE_FAILS:-}" ]]
EOF
chmod +x "$WORK/bin"/*
export PATH="$WORK/bin:$PATH" STUB_LOG="$WORK/log"

# ── A run of backup.sh in a fresh setting ────────────────────────────────────
export PEDEDIT_CONFIG="$WORK/pededit.json" PEDEDIT_BACKUP_ENV="$WORK/backup.env"
echo '{"database_url": "postgres://pededit:s3cr%40t@localhost:5432/pededit"}' > "$PEDEDIT_CONFIG"
DIR="$WORK/backups"
NOW="2026-11-16 02:30:00"   # a Monday

fresh() { # fresh [extra env file lines...]
    rm -rf "$DIR" "$WORK/remote" "$STUB_LOG".*
    mkdir -p "$DIR" "$WORK/remote"
    printf '%s\n' "BACKUP_DIR=$DIR" "$@" > "$PEDEDIT_BACKUP_ENV"
    chmod 600 "$PEDEDIT_BACKUP_ENV"
}
run() { # run [backup.sh args]; output in $OUT, status returned
    PEDEDIT_BACKUP_NOW=$(date -u -d "$NOW" +%s) bash "$HERE/backup.sh" "$@" > "$OUT" 2>&1
}
old_dump() { # old_dump prefix "date"
    head -c 100 /dev/zero > "$DIR/$1-$(date -u -d "$2" +%Y%m%dT%H%M%SZ).dump"
}
names() { (cd "$1" && ls | grep -v '^offsite$' | sort | tr '\n' ' '); }
day() { date -u -d "$NOW $1" +%Y%m%d; }

# ── Retention ────────────────────────────────────────────────────────────────
fresh
for n in $(seq 1 70); do old_dump pededit-db "$NOW $n days ago"; done
old_dump pededit-db "$NOW 2 days ago 1 hour ago"        # an earlier dump that day
run
check "nightly run succeeds" test $? -eq 0
# 14 days: 16 Nov back to 3 Nov. Then the newest of each earlier ISO week
# until 8 weeks are counted: Sundays 1 Nov, 25, 18, 11 and 4 Oct.
expected=""
for n in 43 36 29 22 15 13 12 11 10 9 8 7 6 5 4 3 2 1; do
    expected+="pededit-db-$(day "$n days ago")T023000Z.dump "
done
expected+="pededit-db-$(day "")T023000Z.dump "
check "keeps 14 daily and 8 weekly, removes the rest" test "$(names "$DIR")" = "$expected"
check "says what it kept" grep -q "retention: kept 19, removed 53" "$OUT"
check "the new dump is the stub's 50000 bytes" test "$(stat -c %s "$DIR/pededit-db-$(day "")T023000Z.dump")" -eq 50000
check "the password is not on the command line" grep -q "PGPASSWORD=s3cr@t args=--format=custom --compress=6 --file=" "$STUB_LOG.pg_dump"
check "says the backup is local only" grep -q "LOCAL ONLY" "$OUT"
check "dumps are private" test "$(stat -c %a "$DIR/pededit-db-$(day "")T023000Z.dump")" = 600

fresh
for n in 1 2 3 4 5 6 20; do old_dump pededit-predeploy "$NOW $n days ago"; done
old_dump pededit-db "$NOW 1 day ago"
run --predeploy
check "pre-deploy run succeeds" test $? -eq 0
expected="pededit-db-$(day "1 day ago")T023000Z.dump "
for n in 4 3 2 1; do expected+="pededit-predeploy-$(day "$n days ago")T023000Z.dump "; done
expected+="pededit-predeploy-$(day "")T023000Z.dump "
check "keeps 5 pre-deploy dumps, none older than 14 days, nightly ones untouched" test "$(names "$DIR")" = "$expected"

fresh "BACKUP_KEEP_DAILY=2" "BACKUP_KEEP_WEEKLY=1"
for n in 1 2 3 9; do old_dump pededit-db "$NOW $n days ago"; done
touch "$DIR/notes.txt"
run
check "retention settings are read, other files are left alone" test "$(names "$DIR")" = \
    "notes.txt pededit-db-$(day "1 day ago")T023000Z.dump pededit-db-$(day "")T023000Z.dump "

# ── Failure paths: non-zero exit, nothing half-written, old dumps kept ───────
failure() { # failure "name" "expected message" ENV=value...
    local name="$1" message="$2"; shift 2
    fresh
    for n in $(seq 1 30); do old_dump pededit-db "$NOW $n days ago"; done
    env "$@" PEDEDIT_BACKUP_NOW="$(date -u -d "$NOW" +%s)" bash "$HERE/backup.sh" > "$OUT" 2>&1
    local status=$?
    if [[ $status -ne 0 ]] && grep -q "BACKUP FAILED: .*$message" "$OUT" \
        && [[ $(find "$DIR" -name 'pededit-db-*' | wc -l) -eq 30 ]] \
        && [[ -z $(find "$DIR" -name '.tmp-*') ]]; then
        ok "$name"
    else
        bad "$name (exit $status)"
    fi
}
failure "pg_dump failing fails the run" "pg_dump exited with an error" STUB_DUMP_FAILS=1
failure "an empty dump fails the run" "0 bytes, under the 20000 byte floor" STUB_DUMP_BYTES=0
failure "a tiny dump fails the run" "1500 bytes, under the 20000 byte floor" STUB_DUMP_BYTES=1500
failure "an unreadable archive fails the run" "pg_restore cannot read the dump" STUB_RESTORE_FAILS=1
failure "a dump without the pedigree table fails the run" "does not contain the api_pedigree table" STUB_TABLE=other

fresh; rmdir "$DIR"
run; check "a missing backup directory fails" test $? -ne 0
check "and --check says so too" bash -c "! PEDEDIT_BACKUP_NOW=1 bash '$HERE/backup.sh' --check > '$OUT' 2>&1 && grep -q 'missing or not writable' '$OUT'"

fresh; chmod 644 "$PEDEDIT_BACKUP_ENV"
run; status=$?
check "a settings file others can read is refused" bash -c "test $status -ne 0 && grep -q 'must not be readable or writable by others' '$OUT'"

fresh
echo '{"database_url": "sqlite:////tmp/x.sqlite3"}' > "$WORK/sqlite.json"
PEDEDIT_CONFIG="$WORK/sqlite.json" run; status=$?
check "a SQLite database is refused" bash -c "test $status -ne 0 && grep -q 'not PostgreSQL' '$OUT'"

fresh
run --check
check "--check passes and writes nothing" bash -c "test $? -eq 0 && test -z \"\$(ls '$DIR')\""

# ── Off-box copy ─────────────────────────────────────────────────────────────
if command -v rsync >/dev/null; then
    fresh "BACKUP_RSYNC_DEST=$WORK/remote"
    for n in $(seq 1 20); do old_dump pededit-db "$NOW $n days ago"; done
    cp "$DIR"/pededit-db-* "$WORK/remote/"       # the remote as last night left it
    touch "$WORK/remote/someone-elses-file"
    run
    check "rsync run succeeds" test $? -eq 0
    check "rsync mirrors the kept set and leaves other files alone" \
        test "$(names "$WORK/remote")" = "$(names "$DIR")someone-elses-file "
    check "no local-only warning with a destination" bash -c "! grep -q 'LOCAL ONLY' '$OUT'"

    fresh "BACKUP_RSYNC_DEST=$WORK/remote/missing/deeper"
    run; status=$?
    check "a failed copy fails the run but keeps the local dump" bash -c \
        "test $status -ne 0 && grep -q 'BACKUP FAILED: rsync could not mirror' '$OUT' && ls '$DIR' | grep -q pededit-db-"

    fresh "BACKUP_RSYNC_DEST=$WORK/remote" "BACKUP_MAX_REMOTE_DELETE=3"
    for n in $(seq 1 12); do old_dump pededit-db "$NOW $n days ago"; done
    cp "$DIR"/pededit-db-* "$WORK/remote/"
    rm "$DIR"/pededit-db-*                        # the local set vanished
    run; status=$?
    check "a mirror that would delete too much is refused" bash -c \
        "test $status -ne 0 && test \$(ls '$WORK/remote' | wc -l) -ge 9"
else
    echo "skip  rsync is not installed"
fi

fresh "BACKUP_RCLONE_DEST=b2:bucket/pededit"
run
check "rclone is asked to mirror the backup directory" bash -c \
    "test $? -eq 0 && grep -q '^sync $DIR b2:bucket/pededit --include /pededit-\*.dump\* --max-delete 10\$' '$STUB_LOG.rclone'"
fresh "BACKUP_RCLONE_DEST=b2:bucket/pededit"
STUB_RCLONE_FAILS=1 run; status=$?
check "rclone failing fails the run" bash -c "test $status -ne 0 && grep -q 'BACKUP FAILED: rclone could not mirror' '$OUT'"

if command -v gpg >/dev/null && command -v rsync >/dev/null; then
    KEYS="$WORK/gnupg"; mkdir -m 700 "$KEYS"
    if gpg --batch --quiet --homedir "$KEYS" --passphrase '' --quick-generate-key backup@example.org default default never 2>"$OUT" \
        && gpg --batch --homedir "$KEYS" --armor --export backup@example.org > "$WORK/public.asc"; then
        fresh "BACKUP_RSYNC_DEST=$WORK/remote" "BACKUP_GPG_PUBLIC_KEY=$WORK/public.asc"
        old_dump pededit-db "$NOW 1 day ago"
        mkdir "$DIR/offsite"; touch "$DIR/offsite/pededit-db-20200101T000000Z.dump.gpg"   # pruned long ago
        run
        check "encrypted run succeeds" test $? -eq 0
        today="pededit-db-$(day "")T023000Z.dump"
        check "only encrypted files leave the box" test "$(names "$WORK/remote")" = \
            "pededit-db-$(day "1 day ago")T023000Z.dump.gpg $today.gpg "
        check "the copy decrypts to the dump with the private key" bash -c \
            "gpg --batch --quiet --homedir '$KEYS' --decrypt '$WORK/remote/$today.gpg' 2>/dev/null | cmp -s - '$DIR/$today'"
        check "and is not the dump itself" bash -c "! cmp -s '$WORK/remote/$today.gpg' '$DIR/$today'"
        fresh "BACKUP_RSYNC_DEST=$WORK/remote" "BACKUP_GPG_PUBLIC_KEY=$WORK/nothing.asc"
        run; check "a missing public key fails before dumping" bash -c "test $? -ne 0 && test -z \"\$(ls '$DIR')\""
    else
        echo "skip  gpg could not make a test key"
    fi
    gpgconf --homedir "$KEYS" --kill all 2>/dev/null
else
    echo "skip  gpg is not installed"
fi

if [[ $FAILED -eq 0 ]]; then echo "all passed"; else echo "FAILURES"; fi
exit $FAILED
