# Backup and restore drill

`scripts/backup-db.sh` takes the backup, and deletes its own backups older than `KEEP_DAYS` (default 30), as the privacy policy promises. After any restore of production, delete again every account that was deleted after the backup was taken, since the restore brings it back. `scripts/restore-drill.sh` proves the backup can be restored: it backs up a database, restores the dump into an empty one, and checks that every table has the same row count and that the token ledger still balances (`token_ledger_audit` returns no rows).

Both use the commands from Supabase's guide, [Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore): `supabase db dump` for roles, schema and data (`--use-copy --data-only`), then one `psql --single-transaction --variable ON_ERROR_STOP=1` run with `SET session_replication_role = replica` before the data.

## Running the drill

```bash
# Local database -> throwaway local Supabase stack (ports 553xx, removed afterwards)
scripts/restore-drill.sh

# Hosted database -> throwaway local stack (nothing is written to the source)
DATABASE_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' DRILL_STRICT=0 scripts/restore-drill.sh

# Hosted database -> a NEW, empty Supabase project (a real disaster-recovery rehearsal)
DATABASE_URL='<production>' RESTORE_URL='<new empty project>' DRILL_STRICT=0 scripts/restore-drill.sh
```

- The script refuses a `RESTORE_URL` that already has Prayer Tower tables, so it cannot overwrite a real database.
- `DRILL_STRICT=0` reports row-count differences without failing. Use it on a live database, where writes during the dump change a few counts.
- It needs Docker, `psql` and the repo's Supabase CLI. Use the session pooler or direct connection string, with the password percent-encoded.
- Restoring leaves out `GRANT SET ON PARAMETER ...` lines from `roles.sql`. They are grants to Supabase's own roles, which a new project already has, and only a superuser can run them.
- Storage files (photos and videos) are not in the database dump. Copy the `post-media` bucket separately if you need them; the restored rows still point to their paths.

## Repair after a bad deploy

A bad release can damage some rows: a migration that overwrote a column, or a bug that deleted things. Don't restore the whole backup over production, because you'd lose everything written since. Repair only the damaged rows:

1. **Roll back the code first** ([PILOT_DAY_ONE_RUNBOOK.md](PILOT_DAY_ONE_RUNBOOK.md) → Rollback steps), so nothing keeps damaging data.
2. **Supabase Pro:** if most of the database is damaged, restore from Dashboard → Database → Backups instead. "The project is inaccessible during this process" ([Supabase backups](https://supabase.com/docs/guides/platform/backups)), and everything written since that backup is lost.
3. **Otherwise, restore your last backup into a throwaway copy.** Use the backup from the day before, and keep the copy running:

   ```bash
   KEEP=1 BACKUP_DIR=backups/<time> scripts/restore-drill.sh
   ```

   It prints the copy's address as `RESTORE_URL=...`. The row counts will differ from today's, which is expected.
4. **Copy the damaged rows back, only where they are still damaged.** For example, when a release overwrote request text with `[lost]`:

   ```bash
   psql "$RESTORE_URL" -c "\copy (select id, body from public.posts) to 'posts-from-backup.csv' csv"
   psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 <<'SQL'
   create temp table fix (id uuid primary key, body text);
   \copy fix from 'posts-from-backup.csv' csv
   update public.posts p set body = fix.body from fix where fix.id = p.id and p.body = '[lost]';
   SQL
   ```

   For deleted rows, copy them out the same way and `insert ... select ... from fix on conflict (id) do nothing`. Change the table, the columns and the `where` to fit the damage, and try it on staging first.
5. **Check:** `select count(*) from token_ledger_audit` must return 0, and the app should show the repaired data.
6. **Remove the copy** with the `npx supabase stop ...` line the script printed. Delete the CSV files, because they contain members' words.

Rehearsed 2026-10-28 on the staging stack. A release broke the feed, and its migration overwrote the text of 937 requests. Then:

- The rollback (`fly deploy --image ...:good-…`) brought the feed back.
- The restore into a throwaway copy took 38 seconds.
- The repair put back all 937 texts. A request posted after the backup was kept, and the ledger balanced.

## Last result

Local stack, 2026-10-28: backup 4 s, restore 1 s, 101 tables with matching counts, ledger balanced. CI runs the drill after the server tests on every pull request.

## Schedule (default)

- Monthly: the drill against production into a throwaway local stack, with `DRILL_STRICT=0`. Note the times above.
- Before the pilot and before any major migration: the full rehearsal into a new empty project, then delete that project.
