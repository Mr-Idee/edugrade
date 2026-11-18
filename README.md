# EduGrade

EduGrade is a school administration and academic assessment application for
managing staff, classes, student enrollment, subject assignments, term scores,
report cards, academic history, and staff document workflows. It is designed
for school leadership, form tutors, subject teachers, and administrators.

The application is built with React, TypeScript, and Vite. Its production API
runs as Vercel serverless functions and stores the school's canonical data in
Supabase PostgreSQL. Supabase Storage is used for private staff documents.

## What the application does

- Maintains the school profile, academic sessions, terms, classes, subjects,
  students, staff records, assessment configuration, and grading scales.
- Assigns staff as form tutors and/or to teach specific subjects in particular
  class sections.
- Records class assessment results and term-level scores, with automatic
  saving, CSV import/export, and score-change auditing.
- Tracks student subject inclusion so that reports and completeness checks
  reflect the subjects each student actually takes.
- Produces student report cards, transcripts, class summaries, and academic
  history.
- Provides promotion, repeat, probation, class-transfer, and final-year
  graduation workflows.
- Supports staff announcements and messages, lesson/document submissions,
  department assignments, and Head of Department (HOD) review.
- Provides executive dashboards, missing-results checks, duplicate-student
  checks, backups, and school configuration tools.

## Roles and access

Each staff account has a system role. Navigation and server-side data access
are restricted according to that role and the staff member's assigned classes,
subjects, and responsibilities.

| Role | Typical responsibilities |
| --- | --- |
| Super Admin | Full system administration, including staff and school setup, class management, backups, and database configuration. |
| Principal | Executive academic administration, reporting, and class management. |
| Head of Schools | Executive academic oversight and class management. |
| Vice Principal | Executive academic administration and class management. |
| Class Teacher | Form-class workflows, student enrollment and records, assigned-class assessment work, and related reports. |
| Subject Teacher | Assessment and student records for assigned subjects and classes. |

Executive roles can access Master Settings and Class Management. Database
configuration and full system backup/restore are restricted to the Super
Admin. Teachers do not receive executive settings access. Report printing,
downloads, and data visibility are subject to role and assignment checks.

Staff sign in with their username and password. A staff account that has only
been initialized with a bootstrap PIN uses that PIN for its first sign-in and
then sets a password. Password reset requests must be approved by an
authorized executive.

## Main navigation

- **Home Overview** — School status, academic session, class directory, and
  quick navigation. Selecting a class opens its available subject choices.
- **Teacher's Corner / Executive Office** — Staff profiles and responsibilities,
  office messages, required-document submissions, and HOD/Executive review
  workflows.
- **Assessment Grid & Registry** — Enter and review scores, manage subject
  inclusion, work with term records, and import/export assessment data.
- **Executive Dashboard** — School and class performance summaries for users
  with access.
- **Report Cards & Transcripts** — Review student reports by class, term, and
  report type; authorized users can print or download reports.
- **Student Enrollment Matrix** — Review a class's student-subject matrix,
  student subject inclusion, scores, and summary results.
- **Audit Trail & Missing Checker** — Find incomplete results, review score
  changes, and identify likely duplicate student records.
- **Class Management** — Academic promotion, Year 12 graduation, class transfers,
  and movement history. Available to executive roles.
- **Master Settings** — School-wide configuration and record management.
  Available to executive roles, with Super Admin-only tools noted below.

The application requires staff authentication for operational sections. When
signed out, the Home Overview remains available and requests sign-in before
opening protected workflows.

## Common school workflows

### 1. Configure the school year and curriculum

1. Sign in with an executive account and open **Master Settings**.
2. In **School & Terms**, configure the school profile, academic session,
   active session, and term dates/names.
3. In **Classes**, create class sections and maintain the class level, teacher,
   and other section details.
4. In **Subjects**, maintain the subject catalogue, applicability, ordering,
   and class-specific display names.
5. In **CA Headers & Values**, configure assessment component labels and
   values. In **Comments and Grading**, maintain report comments and grading
   bands.

Some subject display names are intentionally class-specific. For example,
Fashion Design and Garment Making displays as **HOME ECONOMICS** in Year 9,
and Citizenship and Heritage Studies displays as **CIVIC EDUCATION** in
Year 12. These labels do not create duplicate subject identities.

### 2. Add students and assign staff

1. Add students in **Master Settings → Students**, or use the supported
   enrollment/import workflow.
2. Assign a form tutor to the appropriate class section.
3. Assign subject teachers to a subject within each class section they teach.
   The same subject can have different teachers in different sections.
4. Review the staff directory and assignment summaries. Master Settings
   provides feedback when an assignment succeeds or fails and lets users
   inspect additional assigned subjects.

Teachers' access is scoped to their assigned responsibilities. A class/form
tutor can perform the class-teacher workflows allowed by their role; subject
teachers receive subject-specific access.

### 3. Set student subject inclusion

Use the **Student Enrollment Matrix** to select a class and student, review the
subjects for the active term, and set whether the student takes each
applicable subject. Subject inclusion affects score entry, report cards, class
summaries, and missing-results checks.

Junior Religious Studies is a single underlying subject with a student choice
of **Christian Religious Studies (CRS)** or **Islamic Religious Studies (IRS)**.
For each student, the authorized staff member records the choice for the
active academic session. A student takes one of the two options, not both.
Teacher assignments specify CRS or IRS, and the score-entry and report
workflows respect the student's session choice and the teacher's assignment.
The existing subject and score identity is retained.

### 4. Enter and review assessment results

1. From Home Overview, choose a class and an available subject, or open
   **Assessment Grid & Registry** directly.
2. Select the academic term and enter the configured assessment components.
   Scores are associated with the student, class subject, and term.
3. Use the grid and term registry to review component values, totals, and
   results. The interface indicates when scores have been auto-saved.
4. Set or review whether a subject is included for a student; excluded
   subjects are handled accordingly in reports and summaries.
5. For larger sets of results, use **Bulk CSV Import / Export**. Export a
   template, fill in student and score data, upload or paste the CSV, review
   detected students and subject-inclusion values, resolve conflicts, then
   commit the import. The workflow reports parsing or database-save errors
   and provides a retry path for failed saves.

### 5. Produce reports and review school performance

- Open **Report Cards & Transcripts**, choose the class and student, then
  select the report type and term/session data to review.
- Reports show the student's applicable and included subjects. For Religious
  Studies, the report displays the student's selected CRS or IRS label.
- Use the **Executive Dashboard** for school/class summaries and student
  performance review.
- Use **Student Enrollment Matrix** to inspect an individual student's
  subject and score summary.
- Printing and downloads are enabled only for authorized roles and contexts.

### 6. Check completeness and audit score changes

The **Audit Trail & Missing Checker** includes:

- **Missing / Incomplete Results Checker** — Review students with missing
  scores for subjects they are expected to take in the selected class and
  term. A valid score of zero is not treated as missing.
- **Duplicate Students Checker** — Review possible duplicate records based on
  matching names and assessment data, scoped to a class or more broadly.
- **Score Audit Trail** — Search the recorded score-change history, including
  the student, subject, staff, and change context where available.

Authorized users can download supported audit reports.

### 7. Promote students, transfer classes, and graduate Year 12

Open **Class Management** and choose the relevant workflow:

- **Promotion / Graduation** — Review students' academic results and proposed
  decisions, select the destination session and class when required, adjust
  decisions where permitted, and execute promotion. Year 12 uses the
  graduation workflow rather than promotion to another class. Graduation
  seals the academic record and generates an official testimonial/transcript
  record.
- **Parallel Class Transfer** — Select students moving between class sections,
  review duplicate warnings, and confirm the transfer. Student score and
  academic records follow the student.
- **Movement & Graduation Log** — Review recorded promotion, transfer, and
  graduation history.

### 8. Use staff office and document workflows

In **Teacher's Corner / Executive Office**:

- Staff can review their profile, assigned class/subjects, messages, and
  required document slots.
- Staff can submit supported documents against the relevant class or subject.
- Executive users can create/manage document requirements and send messages
  to an individual staff member or a broader audience.
- HOD review is associated with department and subject responsibilities.
  Authorized reviewers can add a review status or remark to relevant
  submissions.
- Optional web push notifications can alert signed-in staff to pending office
  messages. Notifications do not bypass authentication.

### 9. Configure reports, history, backup, and updates

Additional Master Settings workflows include:

- **Custom Report Sheet** — Configure report templates and their data sources;
  templates can be previewed and enabled for the report workflow.
- **Academic Records & History** — Browse records across academic sessions.
- **Backup & Restore** — Create and restore full system backups. This module is
  Super Admin-only; validate backups before restoring them.
- **UPDATE** — Manage supported software update packages and update history.
- **MySQL / phpMyAdmin & Publish** — Legacy/local database and publishing
  tools, restricted to Super Admin. The production cloud API itself uses
  Supabase and does not query a MySQL server.

## Saving, offline changes, and data handling

The Supabase-backed API is the production system of record. Score edits and
other supported changes are saved through the server API. When connectivity
is unavailable, eligible edits can be held in an offline queue and submitted
when the connection returns. If the server and offline copy changed the same
record, the application surfaces a conflict for review rather than silently
overwriting one side. Review pending changes before reloading or leaving the
application.

The browser may also retain preferences and working state locally. Local
storage is not a substitute for the production database or a verified backup.
The Supabase schema enables row-level security without granting direct data
access to anonymous or authenticated browser roles; the server API uses the
server-only Supabase secret and performs authentication and authorization.
Never put server secrets in browser code, `VITE_` variables, or committed
files.

For details on database migrations and legacy import, see
[`supabase/README.md`](./supabase/README.md).

## Technology and project layout

- `src/components/` — Application screens and workflows.
- `src/context/AppContext.tsx` — Shared application state, authentication
  context, saving, and offline synchronization.
- `src/utils/` — Assessment calculations, access policies, report logic,
  import/export, backup, and related helpers.
- `api/` — Express API handlers used by the Vercel deployment.
- `supabase/migrations/` — PostgreSQL schema, data-storage, and feature
  migrations.
- `public/` — Static assets, including the PWA manifest and service-worker
  assets.

The app is installable as a Progressive Web App (PWA) on supported devices.

## Local development and verification

Requirements: a supported Node.js version, npm, and access to a configured
Supabase project for server-backed workflows.

```powershell
npm ci
npm run dev
```

The development server starts the API and frontend workflow. Configure the
required environment variables before using authenticated or database-backed
features.

Run the available checks before deploying:

```powershell
npm run lint
npm test
npm run build
```

## Vercel and Supabase deployment

1. Apply the SQL migrations in `supabase/migrations/` in filename order in the
   Supabase SQL Editor or using the Supabase CLI. Apply migrations required by
   a release before deploying code that depends on them.
2. Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, `AUTH_VAULT_ENCRYPTION_KEY`, and `SESSION_SECRET` in
   the local environment and Vercel project settings. Keep server secrets out
   of browser code and Git.
3. When migrating from the legacy MySQL database, configure its connection
   details and run `npm run db:import` to import the canonical school
   snapshot, encrypted staff vault, offline commit history, and available
   teacher-upload files. Existing Supabase credential records are preserved.
   Staff initialized from bootstrap PINs must set a password on first
   sign-in. MySQL is needed for this legacy import, not for normal cloud
   operation.
4. Run `npm run db:check` to verify Supabase tables, incremental score and
   audit storage, state reads and writes, and document storage. The check uses
   an isolated temporary database row and does not change school records.
5. Run `npm run lint`, `npm test`, and `npm run build`.
6. Connect the Git repository to Vercel and deploy. API requests are rewritten
   to a shared server handler; the single-page-app fallback excludes
   `/api/*` requests. Vercel installs development dependencies for the build
   so TypeScript and configured type definitions are available.

The score-storage migration backfills existing score and audit data from the
canonical snapshot. Apply it before deploying the matching application build;
it keeps the legacy save RPC available during a rolling deployment. Refer to
the migration files and [`supabase/README.md`](./supabase/README.md) for the
current migration/import details.

### Web Push notifications

Apply
[`supabase/migrations/20261113120000_push_subscriptions.sql`](./supabase/migrations/20261113120000_push_subscriptions.sql)
before enabling message notifications. Configure these server-only variables
in the local environment and Vercel project settings:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (a `mailto:` or HTTPS contact URI)

Generate one VAPID key pair and keep it stable across deployments:

```powershell
node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"
```

Never commit or expose `VAPID_PRIVATE_KEY`. Staff enable device notifications
after signing in; notification clicks always require authentication.

Generate separate encryption and session values with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

User-specific records, credentials, local backups, generated reports, and
uploaded files must not be committed to this repository.
