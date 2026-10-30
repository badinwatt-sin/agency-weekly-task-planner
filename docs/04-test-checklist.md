# 4. Test checklist

Run on a **staging** deployment (separate Supabase project) with a few test tasks, using three test accounts: **M** (Manager), **A** and **B** (team members). Record pass/fail, tester and date.

## Automated checks
- [ ] `npm test` — 17 tests (passing at hand-over), including meeting-summary parsing and cleaning: week maths across month/year boundaries, Bangkok "today", overdue/upcoming rules, filter parsing and combinations, dashboard counts vs effort, carry-over counting, monthly bucketing, workload, year summary.
- [ ] `supabase/tests/10_rls_test.sql` — 6 groups (passing at hand-over on PostgreSQL 16): seed has no demo data, anonymous access blocked, Manager editing with forged-authorship protection and stale-write rejection, carry-over history, server-only account linking, team members fully read-only (tasks, comments, meetings, supporters, week moves, roster), append-only history, deactivation, unknown users.
- [ ] After `npm install`: `npm run typecheck` and `npm run build` succeed with no errors (run this first — see the hand-over note).

## 1. Login and accounts
| # | Steps | Expected |
|---|---|---|
| 1.1 | Open any app URL (e.g. `/dashboard`) while signed out | Redirected to Sign in; no data visible |
| 1.2 | Call `/api/export` signed out | 401, no data |
| 1.3 | Sign in with correct employee ID + password | Lands on Weekly board |
| 1.4 | Employee ID typed in lower case / with spaces | Still signs in (IDs are case- and space-insensitive) |
| 1.5 | Wrong password; then an employee ID that doesn't exist | Same message both times: "Employee ID or password is incorrect" |
| 1.6 | 5 wrong passwords for one ID within 15 min | 6th attempt blocked with a wait message, even with the right password |
| 1.7 | Try the employee ID as the password when setting a password | Rejected |
| 1.8 | Password of 11 characters; mismatched confirmation | Rejected with clear messages |
| 1.9 | Manager → Set up account for A → A opens email → Continue → sets password | A signed in; Team admin shows *Active account* |
| 1.10 | Open the same invitation link a second time | "Link has expired or was already used" |
| 1.11 | Forgot password with A's ID; with an unknown ID | Same confirmation message; only A receives an email |
| 1.12 | Change password while signed in on two devices | Other device is signed out |
| 1.13 | Manager deactivates B while B is signed in; B refreshes | B is sent to Sign in with "account not active"; cannot sign in again |
| 1.14 | Reactivate B | B can sign in; history intact |
| 1.15 | View page source / browser dev tools on any page | No employee IDs, emails of others, service keys or passwords present |
| 1.16 | Team admin after accounts set up | Shows "Employee ID on file" and a masked email, never the ID itself |

## 2. Permissions (Manager edits, team views)
| # | Steps | Expected |
|---|---|---|
| 2.1 | A opens `/dashboard`, `/admin/team`, `/admin/projects`, `/tasks/new`, `/meetings/new` | Redirected to the board with "only available to the Manager"; Manager links not in A's menu |
| 2.2 | A opens `/api/export?format=json` | 403 |
| 2.3 | A views the board, all tasks, People, Calendar, Annual overview, Meetings | Everything visible, including other people's tasks and meeting summaries |
| 2.4 | A looks for New task, + button, Move, drag handles, Record meeting, Carry over | None shown |
| 2.5 | A opens any task | Read-only form with "View only" note; progress updates visible, no post box |
| 2.6 | (Security check) A calls the database directly with the public key, e.g. from the browser console, to update a task | Refused by row-level security (covered by `10_rls_test.sql` group 4) |
| 2.7 | M edits / moves / archives any task, posts updates | Allowed |
| 2.8 | M tries to demote themselves when they are the only Manager; tries to deactivate themselves | Both refused |

## 3. Task updates and collaboration
| # | Steps | Expected |
|---|---|---|
| 3.1 | Create a task with every field (supporters, links, effort, notes) | Saved; all fields shown on task page |
| 3.2 | Due date before start date; non-backlog without week; link `javascript:alert(1)` | Each rejected with a field message; typed values remain on screen |
| 3.3 | Drag a Backlog card into To Do on a selected week | Card moves; planned week becomes the selected week |
| 3.4 | Move a card to Done | Completion date = today; moving back to Doing clears it |
| 3.5 | Use the *Move* menu on a phone | Same result as dragging |
| 3.6 | Post a progress update and a comment | Shown newest first with author and timestamp; cannot be edited or deleted |
| 3.7 | Change owner, status and due date | Activity history lists each change (from → to), who and when |
| 3.8 | **Conflict:** M opens the same task on a laptop and a phone; saves on the phone, then on the laptop | Laptop shows "…updated this task at … Your changes have NOT been saved" with a Reload button; typed text is still visible |
| 3.9 | **Conflict on board:** move a card on the phone, then move the same card on a laptop that hasn't refreshed | Laptop's move is reverted with an explanation; board refreshes |
| 3.10 | Two browsers on the same week; change a task in one | The other board updates within a few seconds |
| 3.11 | Carry one task to next week | Task moves; Week history shows old → new week; carried ×1 badge |
| 3.12 | M: "Carry N unfinished to next week" | Only To Do/Doing move; Done stays; each moved task has history |
| 3.13 | Record a meeting by hand with 3 action items (this week / next week / backlog) | Tasks created in the right places and linked to the meeting |

## 3b. Meeting summaries with Claude (needs `ANTHROPIC_API_KEY`)
| # | Steps | Expected |
|---|---|---|
| 3b.1 | Without a key: open Record meeting | Notice that the summarizer needs a key; "Add items by hand" still works |
| 3b.2 | Press Summarize with an empty notes box and no files | "Paste the notes or upload a file first." |
| 3b.3 | Paste Thai + English updates for 3–4 people using first names or nicknames; Summarize | Draft shows a summary, one update per person matched to the right names, sensible new tasks with owners and dates (relative dates like "ศุกร์นี้" resolved from the meeting date) |
| 3b.4 | Notes mention progress on a task already on the board | It appears under "Progress on existing tasks", not as a duplicate new task |
| 3b.5 | Upload a .docx, a .txt and a screenshot of a LINE chat | All three are read; a .pdf is refused with a "paste the text" message |
| 3b.6 | Untick one new task, change another's owner and due date, edit the summary; Save | Only ticked tasks created, with the edits; summary and per-person updates shown on the meeting page |
| 3b.7 | Between Summarize and Save, change one of the listed existing tasks elsewhere | Its status change is skipped (message says so); the progress note is still posted |
| 3b.8 | Use a wrong API key | Clear "API key was refused" message; nothing saved |
| 3b.9 | Upload three large phone photos (4–8 MB each) | Each is resized on the phone (file list shows a few hundred KB, .jpg); summary works. Files over 4 MB in total → clear "limit is 4.0 MB" message |
| 3b.10 | Deploy with one environment variable removed; open the site | Sign-in page shows "Setup not finished" naming that variable, not "Application error" |

## 4. Search and filters
| # | Steps | Expected |
|---|---|---|
| 4.1 | Search a word from a task description | Task found (title, description and notes are searched) |
| 4.2 | Filter by owner, Unassigned, status, Open, Not done, project, priority | Only matching tasks |
| 4.3 | Date filter: due / start / planned week / completion, with from-to | Correct range, inclusive |
| 4.4 | Overdue; Due in 7 days; Carried over | Due today is *not* overdue; Done tasks never overdue |
| 4.5 | Combine several filters, copy the URL into another browser (signed in) | Same result |
| 4.6 | Edit the URL with nonsense values (`?owner=abc&status=foo`) | Ignored safely, no error |
| 4.7 | Board filters keep the selected week; Calendar filters keep the month | Yes |

## 5. Dashboard and report calculations
Create a handful of test tasks across two weeks, then spot-check with real tasks.

| # | Steps | Expected |
|---|---|---|
| 5.1 | Click each headline number and each chart segment | Task list count equals the number clicked |
| 5.2 | Status table row for a person | Sum of segments = row total; Backlog column includes backlog from any week |
| 5.3 | Workload: a task with no estimate | Counted in tasks; shown as "+1 unest." under effort, not as zero effort |
| 5.4 | Carry a To Do task from week W to W+1 | Week W: planned unchanged (still includes it), carried out +1; W+1: planned +1 |
| 5.5 | Complete a task planned last week this week | Counted as completed in **this** week |
| 5.6 | Change period to "This month", "Year to date"; pick a project | All figures, charts and drill-downs respect the period and project (overdue/upcoming lists are "as of today") |
| 5.7 | Annual overview totals vs Month-by-month table | Completed total = sum of monthly completed |
| 5.8 | Search the dashboard for any score, rank or rating | None present; explanatory note visible |
| 5.9 | Export CSV; open in Excel | Thai and English text correct; cells starting with `=` are neutralised |
| 5.10 | Full backup JSON | Contains tasks, comments, activity, moves, meetings, roster — no employee IDs or emails |

## 6. Responsive layout
Test on: phone (≈390 px wide, iOS Safari and Android Chrome), tablet (≈768–1024 px, portrait and landscape), desktop (≥1280 px).

| # | Steps | Expected |
|---|---|---|
| 6.1 | Every page on a phone | No sideways page scrolling (charts and tables scroll inside their own card) |
| 6.2 | Phone navigation | Bottom bar: Board, Tasks, People, Calendar, More; More lists the rest incl. sign out |
| 6.3 | Board on phone | Segmented control shows one column at a time with counts; **Move** opens a bottom sheet with large options |
| 6.3b | Manager on phone | Floating **+** opens New task / Record a meeting; hidden on form pages so it never covers Save |
| 6.3c | Filters on phone | Hidden behind a **Filter** button showing how many filters are active |
| 6.4 | Calendar on phone | Agenda list by day instead of month grid |
| 6.5 | Task form on phone | Single-column fields; date pickers native; Save bar stays above the bottom tabs; typing doesn't zoom the page on iPhone |
| 6.6 | Tablet landscape / desktop | Sidebar navigation; board shows 4 columns |
| 6.7 | Keyboard only (desktop) | All controls reachable; visible focus ring; cards can be moved with keyboard |
| 6.8 | Zoom to 200% | Content reflows, still usable |
