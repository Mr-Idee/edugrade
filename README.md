# EduGrade

Academic assessment, class management, reporting, and staff document workflows
built with React, TypeScript, Vercel serverless functions, and Supabase.

## Vercel and Supabase setup

1. Apply [`supabase/migrations/20261112000000_app_state.sql`](./supabase/migrations/20261112000000_app_state.sql)
   in the Supabase SQL Editor.
2. Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, `AUTH_VAULT_ENCRYPTION_KEY`, and `SESSION_SECRET` in
   the local `.env` and Vercel project settings. Keep server secrets out of
   browser code and Git.
3. With the legacy MySQL database available, run `npm run db:import` to import
   the canonical school snapshot and encrypted staff vault.
4. Run `npm run lint`, `npm test`, and `npm run build`.
5. Connect the Git repository to Vercel and deploy. The API is routed through
   `api/[[...path]].ts`.

Generate separate encryption and session values with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

See [`supabase/README.md`](./supabase/README.md) for migration and import
details. User-specific records, credentials, local backups, generated reports,
and upload files must not be committed to this repository.
