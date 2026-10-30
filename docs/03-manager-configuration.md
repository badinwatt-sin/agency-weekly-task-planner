# 3. Items the Manager must configure

Work through this list before inviting the team. Tick each item.

## Roster and roles
- [ ] **Load the team list** with `supabase/roster.local.sql` (sent to you privately — it is not in the public GitHub repository), then **confirm the spelling of every name** in Team admin.
- [ ] **Keng's entry:** seeded as "Keng" with the Manager role. Add a full name and keep "Keng" as the display name if preferred.
- [ ] Optional **display names / nicknames** for anyone who prefers them on cards.
- [ ] Add anyone missing; deactivate anyone who shouldn't have access.
- [ ] **Appoint a second Manager** (deputy) so the team isn't locked out if Keng is away.
- [ ] Confirm the **editing rule**: only the Manager changes tasks, meetings and progress notes; the team views everything except the Manager dashboard and Team admin. (The migration file explains how to let members edit their own tasks later.)

## Employee IDs and accounts (secure process)
- [ ] Have each person's **official employee ID** and **work email** to hand (from HR records). Nothing in the app has been pre-filled — no IDs were invented.
- [ ] Enter them **only** in Team admin → person → **Set up account**. Don't send IDs over chat or email, and don't keep a spreadsheet of IDs next to the app.
- [ ] Remember: the employee ID is the **sign-in name**, not a password. Never use it as, or in, a password.
- [ ] Confirm every person reaches **Active account**; resend links for any that expire.
- [ ] Check the Team admin list once a month and deactivate leavers on their last day.

## Platform settings (with whoever administers Supabase / Netlify)
- [ ] Supabase **sign-ups disabled**, password minimum 12 (leaked-password protection too, if on the Pro plan).
- [ ] **Custom SMTP** configured and a test invitation received (check spam folders).
- [ ] Invitation and reset **email templates** installed.
- [ ] Site URL and redirect URLs set to the final domain.
- [ ] Two-factor authentication on all Supabase, Netlify, GitHub and Claude Console accounts; list of who holds those accounts recorded.
- [ ] Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `AUTH_THROTTLE_SECRET`, `ANTHROPIC_API_KEY`) set only in Netlify, marked Secret. Never commit them to GitHub.
- [ ] Site address chosen (e.g. `team-planner.netlify.app`, or your own domain).

## Working conventions
- [ ] **Projects / categories:** create real ones in Team admin → Projects (a "General" project exists to start).
- [ ] **Effort scale:** agree what XS/S/M/L/XL (1/2/3/5/8) mean for the team, or decide not to use estimates. Estimates are optional and are never turned into a rating.
- [ ] **Week convention:** Monday–Sunday, Bangkok time (default). Agree the meeting day and when tasks should be updated (e.g. by Friday 17:00).
- [ ] **Carry-over routine:** after each meeting, review the "unfinished in earlier weeks" banner and carry forward or close items.
- [ ] **Meeting summaries (optional):** create a Claude API key, add it as `ANTHROPIC_API_KEY` in Netlify, and set a monthly spend limit in the Claude Console. Run one real meeting through "Summarize with Claude" and check the draft before saving.
- [ ] Remember Claude **proposes** and you decide: check names, owners and dates in each draft before saving.

## Data protection
- [ ] **Weekly** Full backup (JSON) saved to the company's secure drive; owner named. (Essential on the Supabase Free plan, which has no automatic backups.)
- [ ] Meeting notes sent for summarizing are processed by the Claude API. Avoid pasting personal or confidential client data that doesn't need to be in the plan.
- [ ] Decide how long finished tasks are kept (default: indefinitely; archived tasks stay in exports).
- [ ] Tell the team what the planner stores (task content, comments, activity history) and who can see the dashboard.
- [ ] Use dashboard figures as a prompt for discussion alongside quality, complexity and context — not as a performance score.
