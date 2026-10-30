# 1. Product overview, architecture and data model

## Product overview

**Agency Weekly Task Planner** is a private web app the Manager uses straight after each weekly meeting to plan and follow up the team's work. The team signs in to see the whole picture: this week's board, everyone's tasks, deadlines and meeting summaries. It works like a phone app on mobile (bottom tabs, one board column at a time, a floating + button) and as a full dashboard on desktop.

| Area | What it does |
|---|---|
| **Weekly board** | Kanban with Backlog · To Do · Doing · Done for a selected week. Drag cards by their grip handle (mouse, touch or keyboard) or use the *Move* menu on each card. Overdue cards are outlined in red; a banner flags unfinished work left in earlier weeks; the Manager can carry all unfinished work to the next week in one click. |
| **All tasks** | Search plus filters for owner, status, project, priority, date (due / start / planned week / completion), overdue, due-in-7-days and carried-over. Filters live in the URL, so any view can be bookmarked or shared. This page is also the drill-down target for every number in the app. |
| **Task page** | Full details, supporting members, links, effort estimate, timestamped progress updates and comments, week-by-week carry-over history and an automatic activity log (who changed what, when). |
| **People** | Each person's open work, overdue items, upcoming deadlines and planned load for the next six weeks (count *and* effort). |
| **Calendar** | Month grid by due date or start date with owner/status filters; becomes an agenda list on phones. |
| **Annual overview** | Monthly planned / completed / carried-over trend, completed, ongoing, overdue and backlog totals, and completed work by project. |
| **Meetings** | Paste or upload what each person reported (text, Word, or photos / screenshots such as a LINE chat). **Claude drafts** the meeting summary, each person's update, new tasks (owner, priority, due date, week) and progress on tasks already on the board. The Manager reviews and edits everything before it is saved. Manual entry is still available. |
| **Manager dashboard** *(Manager only)* | Status by person, open workload by owner (count and effort side by side), planned vs completed by week and month, carry-overs, overdue and upcoming lists, filtered by period and project. Every number links to the exact tasks behind it. |
| **Team admin** *(Manager only)* | Add, edit, deactivate/reactivate people, change roles, attach employee IDs and work emails, send invitations and password links, manage projects, export CSV / full JSON backup. |

### Roles

| | Team member | Manager |
|---|---|---|
| View board, all tasks, people, calendar, annual overview, meetings, progress updates | ✓ | ✓ |
| Create, edit and move tasks; post progress updates | – | ✓ |
| Record meetings and summarize notes with Claude | – | ✓ |
| Carry a whole week forward, archive tasks | – | ✓ |
| Manager dashboard, exports, Team admin | – | ✓ |

> The Manager keeps the planner up to date; the team views it. This is enforced by the database itself (row-level security), not only by hiding buttons. To let team members edit their own tasks later, change `can_edit_task()` and three insert policies — the migration file explains exactly what to change.

### Design principles

* **Count ≠ effort ≠ performance.** Every report shows task counts and effort points separately, states how many tasks are unestimated, and never produces a score or rating. The dashboard carries a standing note that the figures are a starting point for discussion.
* **No silent overwrites.** Every task has a version number. If two people edit the same task, the second save is refused with *who* changed it and *when*, and the person's unsaved edits stay on screen.
* **History is never lost.** Carrying a task forward keeps the task (and its comments) and records each week move; the activity log is written by the database itself and cannot be edited.
* **Claude drafts, the Manager decides.** The meeting summarizer only proposes. Unknown people, projects or tasks in Claude's answer are dropped, invalid dates are cleared, and nothing is written until the Manager saves the reviewed draft. Status changes from a summary are skipped if someone changed the task after the summary was made.
* **Real use from day one.** The database starts empty (no demo tasks). Team names are kept out of the public repository in a private roster file.

## Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Web app | **Next.js 15** (App Router, React 19, TypeScript, server actions) | Server-rendered pages: data and permission checks stay on the server; one codebase for desktop, tablet and phone. |
| Styling | Tailwind CSS 4, IBM Plex Sans, built-in icon set | Navy / royal-blue corporate palette, consistent status colours, no icon licence dependencies. |
| Database | **Supabase Postgres** | Managed, persistent, backed up; row-level security enforces access inside the database. |
| Authentication | **Supabase Auth** (managed) | Bcrypt-hashed passwords, email invitations and resets, session management, built-in rate limits, leaked-password check (Pro). |
| Live updates | Supabase Realtime | Boards refresh within a second when someone else changes a task. |
| Hosting | **Netlify** (free) or **Vercel** | Next.js hosting with HTTPS and encrypted environment variables. Netlify's free plan allows business use; Vercel's free plan does not. |
| Meeting summaries | **Claude API** (`claude-sonnet-5-5`, configurable) | Reads Thai and English notes, Word files and images; called only from the server with the agency's own key. |
| Drag and drop | @dnd-kit | Accessible: mouse, touch and keyboard. |

### Services and likely costs (USD, checked October 2026)

**Start free** — enough for a 14-person team:

| Service | Plan | Cost | Notes |
|---|---|---|---|
| Supabase | Free | $0 | 500 MB database, plenty for years of tasks. Pauses after 7 days with no activity (weekly use keeps it awake; a paused project resumes from the dashboard with data intact). **No automatic backups** — use Team admin → Full backup (JSON) weekly. |
| Netlify | Free | $0 | Business use allowed. Gives an address like `team-planner.netlify.app`. |
| Email for invitations / resets | Gmail or Google Workspace SMTP, or Brevo free | $0 | Required: Supabase's built-in sender only reaches the Supabase project's own members and sends 2 emails an hour. |
| Claude API (meeting summaries) | Pay per use | ≈ $0.03–0.10 per meeting with Sonnet 5.5 ($2 / $10 per million input / output tokens) | Optional. Set a monthly spend limit in the Claude Console. About $0.50 a month for weekly meetings. |
| **Total** | | **≈ $0–1 / month** | |

**When the team relies on it daily**, upgrade without moving any data:

| Service | Plan | Cost | Why |
|---|---|---|---|
| Supabase | Pro | $25 / month | Never pauses, daily backups kept 7 days, leaked-password protection. |
| Hosting | Netlify Pro or Vercel Pro | ~$19–20 / month per seat | Only needed for more build minutes, team seats or support. |

Prices change — confirm on [supabase.com/pricing](https://supabase.com/pricing), [netlify.com/pricing](https://www.netlify.com/pricing/) and [claude.com/pricing](https://claude.com/pricing#api).

Prices change — confirm on [supabase.com/pricing](https://supabase.com/pricing) and [vercel.com/pricing](https://vercel.com/pricing) before purchase.

**Lower-cost alternative:** the same app can run on Netlify or a small VPS with Node.js; Supabase remains the database and auth. Expect more set-up work.

## Architecture

```
 Browser (desktop / tablet / phone)
   │  HTTPS only · strict CSP with per-request nonce · no data in local storage
   ▼
 Vercel — Next.js server (Singapore)
   ├─ middleware.ts ........ refreshes session; every page except sign-in/reset requires login
   ├─ Server components .... read data AS THE SIGNED-IN USER (RLS applies)
   ├─ Server actions ....... validate input with zod; version-checked updates
   ├─ Admin actions ........ Manager check, then service-role calls for invites / account changes
   └─ /api/export .......... Manager-only CSV / JSON
   │
   ▼
 Supabase (Singapore)
   ├─ Auth ................. bcrypt password hashes, invitations, resets, sessions, rate limits
   ├─ Postgres ............. tables + triggers (versioning, activity log, carry-over history)
   │                         + row-level security on every table
   └─ Realtime ............. pushes task changes to open boards
```

### Security model

| Requirement | How it is met |
|---|---|
| Public URL, private data | Middleware redirects anonymous visitors to sign-in; every query runs under row-level security that requires an **active** roster entry. Anonymous database role has no table privileges. Search engines are told not to index (`robots.txt`, `noindex`). |
| Employee ID is the username, not the password | Sign-in takes employee ID + password. The server looks up the ID in `member_private` (no client access, no RLS policies) to find the account email, then calls Supabase Auth. |
| Employee IDs never exposed client-side | IDs exist only in the database and server code. They are typed by the Manager into Team admin, sent once to the server, and never rendered again (the UI shows "Employee ID on file"). No IDs in code, seed data or sample data. |
| Secure passwords | Chosen by each person from an emailed one-time link; 12–72 characters with strength rules; must not contain their employee ID; Supabase stores bcrypt hashes only; enable leaked-password protection (Pro). Other sessions are signed out after a password change. |
| Repeated login attempts | 5 failures per employee ID or 30 per network address in 15 minutes → temporary block (hashed keys in `auth_attempts`), plus Supabase Auth's own rate limits. Error messages and timing don't reveal whether an ID exists. |
| Role-based access on the server | Manager pages call `requireManager()`; server actions call `actionUser({ manager: true })`; database policies (`is_manager()`) enforce the same rules even if the app were bypassed. |
| Secrets | Service-role key, throttle secret and Claude API key are server-only environment variables (`server-only` import makes the build fail if they leak into browser code). Meeting notes go to the Claude API from the server only. |
| Deactivation | Sets `is_active = false` (RLS blocks all data immediately) and bans the auth user (no new sessions). History is kept. |
| Email-link scanners | Invitation / reset links land on a confirmation page; the one-time token is only redeemed when the person presses *Continue*. |
| Browser hardening | CSP with nonce, `frame-ancestors 'none'`, HSTS, `nosniff`, strict referrer policy, `Cache-Control: no-store` on private pages, CSV-formula-injection protection in exports. |
| Audit | `admin_audit` records every roster/account change; `task_activity` records every task change with actor and timestamp. |

## Data model

```
members ──1:1── member_private        (employee_id, email — server only)
   │
   ├──< tasks.owner_id
   ├──< task_supporters >── tasks
   ├──< task_updates (comments / progress, append-only)
   └──< task_activity (written by triggers)

projects ──< tasks
meetings ──< tasks.meeting_id
tasks ──< task_week_moves (carry-over history)
auth_attempts, admin_audit (server only)
```

| Table | Key columns | Notes |
|---|---|---|
| `members` | `full_name`, `display_name`, `role` (member/manager), `is_active`, `account_status` (no_account/invited/active), `user_id` → auth user, `is_sample` | The editable roster. Only the server can link `user_id`. |
| `member_private` | `employee_id` (unique, case-insensitive), `email` | RLS on, **no policies** → unreadable from any browser session. |
| `projects` | `name`, `color`, `is_active`, `is_sample` | Retiring keeps history. |
| `meetings` | `title`, `meeting_date`, `week_start`, `notes` (summary), `people` (per-person updates), `source` (manual / claude) | Action items are tasks with `meeting_id`. |
| `tasks` | `title`, `description`, `project_id`, `owner_id`, `status`, `priority`, `planned_week` (Monday), `start_date`, `due_date`, `completed_on`, `effort_points` (1/2/3/5/8 or none), `notes`, `links` (JSON), `carry_over_count`, `version`, `created_by/at`, `updated_by/at`, `archived_at`, `is_sample` | Constraints: due ≥ start; planned week must be a Monday; anything not in Backlog needs a planned week. Triggers set authorship, bump `version`, set/clear `completed_on`, count carry-overs. |
| `task_supporters` | `task_id`, `member_id` | Optional supporting members. |
| `task_updates` | `kind` (progress/comment), `body`, `author_id`, `created_at` | Written by the Manager (including notes from meeting summaries); author forced to the signed-in person; no update/delete. |
| `task_activity` | `actor_id`, `action`, `changes` (field: from → to), `created_at` | Trigger-written, read-only. |
| `task_week_moves` | `from_week`, `to_week`, `status_at_move`, `moved_by`, `moved_at` | One row each time unfinished work changes week. |
| `auth_attempts` | hashed key, hashed IP, success, time | Login/reset throttling; auto-pruned after 7 days. |
| `admin_audit` | actor, action, target, details | Roster and account changes. |

### Report definitions (also shown in the UI)

| Figure | Definition |
|---|---|
| Overdue | Not Done and due date before today (agency time zone). Due today is not overdue. |
| Due in 7 days | Not Done, due today through today + 7. |
| Planned in a week | Tasks planned for that week **plus** tasks that were planned for it and later carried forward. |
| Completed in a week / month | Completion date within that week / month. |
| Carried out of a week | Distinct unfinished tasks moved from that week to a later one. |
| Dashboard status table | All Backlog tasks + To Do / Doing / Done planned within the selected period. |
| Open workload | To Do + Doing planned within the period; count and effort shown separately with the number of unestimated tasks. |
| Weeks | Monday–Sunday, `Asia/Bangkok`. |
