# 2. Setup, deployment and team onboarding

Time needed: about 1–2 hours for someone comfortable with web dashboards. No server administration is required.

This guide uses the **free** setup (Supabase Free + Netlify Free). The paid upgrade is the same steps with a different plan; nothing moves.

## A. Create the database and authentication (Supabase)

1. Create an organisation at [supabase.com](https://supabase.com) (Free plan is fine to start).
2. **New project** → name `agency-task-planner`, region **Southeast Asia (Singapore)**, generate a strong database password and store it in your password manager.
3. **SQL Editor** → paste and run, in order:
   1. `supabase/migrations/0001_schema.sql` — tables, triggers and security policies
   2. `supabase/seed.sql` — Keng as Manager and a "General" project (no demo tasks)
   3. `supabase/roster.local.sql` — your team's names. This file is **not** in the public repository; Claude sent it to you separately. Without it, add people in Team admin instead. (`supabase/roster.example.sql` shows the format.)
4. **Authentication → Sign In / Providers**
   * **Allow new users to sign up: OFF** (only the Manager can create accounts)
   * Email provider: **on**; *Confirm email*: **on**
   * Minimum password length: **12**; tick lower-case, upper-case and digits
   * *Prevent use of leaked passwords* (Pro plan only): on, if available
5. **Authentication → URL Configuration**
   * Site URL: your app's address, e.g. `https://team-planner.netlify.app`
   * Redirect URLs: add `https://team-planner.netlify.app/**` (and `http://localhost:3000/**` for local testing)
6. **Authentication → Emails → SMTP Settings**: enable **custom SMTP** — required, because Supabase's own sender only reaches members of the Supabase project and sends 2 emails an hour. Free options:
   * **Gmail / Google Workspace**: host `smtp.gmail.com`, port `465`, user = the Gmail address, password = an [App Password](https://myaccount.google.com/apppasswords) (needs 2-Step Verification).
   * **Brevo** free plan: create an SMTP key and use their host/port ([guide](https://developers.brevo.com/docs/supabase-smtp-integration)).
7. **Authentication → Emails → Templates**
   * *Invite user* → paste `supabase/templates/invite.html`
   * *Reset password* → paste `supabase/templates/recovery.html`
   (These link to `/auth/confirm`, which protects one-time links from email security scanners.)
8. **Project Settings → API Keys** — copy the **Project URL**, the **publishable (anon) key** and the **secret (service-role) key**. Treat the secret key like a master password.
9. **Database → Publications**: confirm `tasks` is in `supabase_realtime` (the migration adds it).
10. Turn on **two-factor authentication** for every person with access to the Supabase dashboard.

> Free projects pause after 7 days with no activity. Weekly use keeps it awake; if it does pause, open the Supabase dashboard and press **Resume project** — data is kept.

## B. Get the code

The code is on GitHub: `github.com/badinwatt-sin/agency-weekly-task-planner`. `.env*` files and `supabase/roster.local.sql` are git-ignored — never commit keys or the team list.

## C. Deploy the web app (Netlify, free)

1. Sign in at [netlify.com](https://www.netlify.com) with GitHub → **Add new site → Import an existing project** → GitHub → pick `agency-weekly-task-planner`.
2. Build settings are detected for Next.js (build command `npm run build`). Keep the defaults.
3. **Site configuration → Environment variables** — add:

   | Name | Value | Exposed to browser? |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL | yes (safe) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable / anon key | yes (safe — row-level security protects data) |
   | `NEXT_PUBLIC_SITE_URL` | `https://team-planner.netlify.app` | yes |
   | `NEXT_PUBLIC_APP_TIMEZONE` | `Asia/Bangkok` | yes |
   | `SUPABASE_SERVICE_ROLE_KEY` | secret / service-role key | **no — server only** |
   | `AUTH_THROTTLE_SECRET` | output of `openssl rand -base64 48` | **no — server only** |
   | `ANTHROPIC_API_KEY` | key from [platform.claude.com](https://platform.claude.com) (optional) | **no — server only** |
   | `ANTHROPIC_MODEL` | `claude-sonnet-5-5` (optional) | no |

   Mark the server-only values as **Secret** so they're hidden after saving.
4. **Deploys → Trigger deploy**. Then **Domain management** → change the site name to something like `team-planner` (gives `team-planner.netlify.app`), or add your own domain. HTTPS is automatic. Update `NEXT_PUBLIC_SITE_URL` and the Supabase URL settings (A5) if the address changes, then redeploy.

**Claude API key (meeting summaries):** at [platform.claude.com](https://platform.claude.com) → add a payment method → **API keys → Create key** → paste into `ANTHROPIC_API_KEY`. Set a **monthly spend limit** (e.g. $5) under *Limits*. Without a key, the planner works normally and the Manager adds meeting items by hand.

**Using Vercel instead:** the same environment variables apply; choose region Singapore (`sin1`). Vercel's free Hobby plan is for non-commercial use, so use Vercel Pro for agency work.

## D. Create the Manager's account (one time)

Done on any computer with Node.js 20+, by the person setting up the system together with Keng:

```bash
npm install
cp .env.example .env.local     # fill in the same values as on Netlify
npm run bootstrap:manager
```

Choose **Keng**, type Keng's employee ID and work email. Keng receives an invitation email → **Continue** → chooses a password → is signed in. Delete `.env.local` afterwards if the computer isn't a secure developer machine.

## E. Onboard the team (Manager, in the app)

1. Sign in → **Team admin**.
2. Check names (see *Manager configuration*). Edit, add or deactivate anyone — no code changes needed.
3. For each person: open their row → **Set up account** → type their **employee ID** and **work email** → **Send invitation**.
   * Enter IDs directly into this form. Don't collect them by chat, email or spreadsheet.
4. Each person opens the invitation, presses **Continue**, chooses a password (12+ characters, not containing their employee ID) and lands on the board.
5. Status in Team admin moves from *No account yet* → *Invitation sent* → *Active account*. Use **Send password link** for anyone whose invitation expired.

**Message the Manager can send the team:**

> The weekly task planner is live at https://team-planner.netlify.app. You'll get an email invitation — open it, press *Continue* and choose your own password (at least 12 characters). From then on sign in with your **employee ID** and that password. Forgot it? Use *Forgot password* on the sign-in page. The board shows the whole team's work after each weekly meeting. On your phone, open the link and choose *Add to Home Screen* to use it like an app.

### Password resets
* **Self-service:** *Forgot password?* → employee ID → reset link goes to the work email on file.
* **Manager-assisted:** Team admin → person → **Send password link**.
* The Manager never sees or sets anyone's password.

### People leaving or joining
* **Leaving:** Team admin → **Deactivate**. Sign-in is blocked immediately; their tasks and history remain (reassign open tasks from the People view).
* **Joining:** **Add a team member** → **Set up account**.
* **Changing ID or email:** person → *Change employee ID or email*.
* **Second Manager:** change someone's role to Manager (recommended, so the team is never locked out).

## F. Backups and export

| What | How | Frequency |
|---|---|---|
| Automatic database backups | Supabase **Pro only**: daily, kept 7 days (restore from **Database → Backups**). Not available on Free. | automatic on Pro |
| Team-readable export | Team admin → **Export CSV** (opens in Excel/Sheets, Thai-safe UTF-8) | as needed |
| Full application backup | Team admin → **Full backup (JSON)** — tasks, comments, activity, carry-over history, meetings, roster (no employee IDs or emails) | **weekly**, saved to the company's secure drive |
| Off-site database copy (optional, IT) | `pg_dump "postgresql://…"` using the connection string from Supabase, or `supabase db dump` | monthly |

## G. Local development

```bash
npm install
cp .env.example .env.local   # point at a separate *development* Supabase project
npm run dev                  # http://localhost:3000
npm test                     # dates, filters, dashboard maths, meeting-summary parsing
npm run typecheck
```

Database security tests run against any PostgreSQL 15+ (they mock Supabase's `auth` schema — never run them on the live project):

```bash
createdb planner_test
psql -d planner_test -v ON_ERROR_STOP=1 \
  -f supabase/tests/00_supabase_mock.sql \
  -f supabase/migrations/0001_schema.sql \
  -f supabase/seed.sql \
  -f supabase/tests/10_rls_test.sql
```

## H. Customising

| Change | Where |
|---|---|
| Who may edit tasks | `can_edit_task()` and the insert policies in `0001_schema.sql` (comments there show how to let members edit their own tasks) |
| Summary model / prompt | `ANTHROPIC_MODEL`; prompt text in `src/lib/ai-draft.ts` (`buildPrompt`) |
| Login lockout thresholds | `RULES` in `src/lib/throttle.ts` |
| Password rules | `passwordProblem()` in `src/lib/validation.ts` + Supabase Auth settings |
| Effort scale labels | `EFFORT_OPTIONS` in `src/lib/types.ts` (and the check constraint on `effort_points`) |
| Colours | `@theme` block in `src/app/globals.css` |
| "Due soon" window | `UPCOMING_DAYS` in `src/lib/filters.ts` |
| Time zone | `NEXT_PUBLIC_APP_TIMEZONE` and `app_today()` in the migration |

## I. Updating the app

Push to the main branch → Netlify (or Vercel) builds and deploys automatically; failed builds never go live. For database changes, add a new numbered file in `supabase/migrations/`, test it on a development project, then run it in the SQL editor. Keep dependencies patched (`npm outdated`, `npm audit`) at least monthly.
