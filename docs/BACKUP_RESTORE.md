# Backup and restore drill

`scripts/backup-db.sh` takes the backup. `scripts/restore-drill.sh` proves the backup can be restored: it backs up a database, restores the dump into an empty one, and checks that every table has the same row count and that the token ledger still balances (`token_ledger_audit` returns no rows).

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

## Last result

Local stack, 2026-10-28: backup 4 s, restore 1 s, 101 tables with matching counts, ledger balanced. CI runs the drill after the server tests on every pull request.

## Schedule (default)

- Monthly: the drill against production into a throwaway local stack, with `DRILL_STRICT=0`. Note the times above.
- Before the pilot and before any major migration: the full rehearsal into a new empty project, then delete that project.
