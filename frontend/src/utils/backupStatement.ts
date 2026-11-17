import { BACKUP_MAX_DAYS } from "../config";

/**
 * What the site says about deleted data and backups, on the landing
 * page ("How to delete it") and in the Delete account dialog. It must agree
 * with `deploy/backup.sh`: every dump, nightly or taken before a deploy, is
 * deleted within `BACKUP_MAX_AGE_DAYS`. With no nightly run nothing deletes
 * old dumps on time, so no limit is stated. Either way it says backups are
 * not for recovering one deleted pedigree or account, so nobody asks.
 */
export function backupStatement(maxDays: number = BACKUP_MAX_DAYS): string {
  const never = "They are never used to bring back a deleted pedigree or account.";
  if (maxDays > 0) {
    return `The database is backed up every night, only so the whole site can be restored after a failure, `
      + `and each backup is deleted within ${maxDays} days. ${never}`;
  }
  return "A copy of the database is taken each time the site is updated, only so the site can be restored if "
    + `the update goes wrong, and such a copy may still hold what was deleted. ${never}`;
}
