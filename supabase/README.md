# Supabase migration foundation

`migrations/20261112000000_app_state.sql` creates the PostgreSQL tables needed
for the application's canonical JSONB snapshot, offline commit history,
encrypted authentication vault, login rate limits, and backups. It also
creates a private `edugrade-documents` Storage bucket. The canonical snapshot
is the record loaded and saved by the cloud runtime; it replaces the previous
MySQL `app_state_store.state_json` record.

The migration enables row-level security and grants no access to the
`anon` or `authenticated` roles. The server-side API in `api/app.ts` uses the
Supabase secret key only in server context and authenticates users before
reading or writing application data. Never put that key in a `VITE_` variable,
browser code, or a committed environment file.

## Migration and import

Run this file in the Supabase SQL Editor (or apply it with the Supabase CLI).
Then configure the required environment variables and run
`npm run db:import`. The importer reads the legacy MySQL
`app_state_store` row, encrypted staff vault, offline commit history, and
available teacher-upload files; re-encrypts the vault using
`AUTH_VAULT_ENCRYPTION_KEY`; then imports them to Supabase. It reports counts
only and never writes secrets into source files. Missing legacy upload files
are omitted from the imported snapshot.

Run `npm run db:check` after applying the migration to verify table access,
the state-write function, an isolated temporary database write, and the private
document bucket. The check removes its temporary row and does not change school
records.

The cloud API is implemented in `api/app.ts`; it does not use a MySQL server.
The MySQL connection is required only while `npm run db:import` reads the
legacy database. Only the canonical snapshot and associated cloud runtime
tables are created in Supabase; the older 28-table MySQL relational
projection is not recreated because the cloud runtime does not query it.
