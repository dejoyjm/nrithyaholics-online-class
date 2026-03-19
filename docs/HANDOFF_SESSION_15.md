# NrithyaHolics — Session 15 Handoff
**Date:** 20-Mar-2026 | **Sessions completed:** 1–15

---

## 🔗 Live URLs & Accounts

| Item | Value |
|------|-------|
| Production app | https://online.nrithyaholics.in |
| GitHub repo | https://github.com/dejoyjm/nrithyaholics-online-class (branch: master) |
| Supabase project | vuxqimoqsbqsgvkashak (Mumbai, ap-south-1) |
| Supabase dashboard | https://supabase.com/dashboard/project/vuxqimoqsbqsgvkashak |
| Resend dashboard | resend.com (account: dejoyjm) |
| 100ms dashboard | dashboard.100ms.live |

## 🧪 Test Accounts

| Email | Role |
|-------|------|
| dejoyjm@gmail.com | Admin (is_admin=true) |
| dejoy.mathai@shredsindia.org | Choreographer (approved) |
| dejoy.mathai@ril.com | Learner |

---

## 🏗️ Stack

- **Frontend:** React + Vite, no TypeScript, **inline styles only** (no CSS files, no Tailwind)
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions)
- **Auth:** Magic link only
- **Hosting:** Vercel (auto-deploys on push to master, ~2 min)
- **Payments:** Razorpay Live (`rzp_live_bYmMMbiG8WZC34`)
- **Video:** 100ms.live Prebuilt via iframe (subdomain: `dejoy-videoconf-406`)
- **Email:** Resend (`bookings@nrithyaholics.in`) — secrets set in Supabase

---

## ✅ Completed This Session (Session 15)

All work this session was in `frontend/src/HomePage.jsx` — fixing the age group filter end to end.

### 1. Age group filter chips added to Filters panel (98d3205)
**File:** `frontend/src/HomePage.jsx`

- Added `AGE_GROUPS = ['All', 'Kids', 'Teens', 'Adults', 'Seniors']` constant
- Added `ageFilter` / `onAgeChange` props to `FilterPanel`
- Added **AGE GROUP** section inside the Filters bottom sheet panel, using same chip style as other filter sections (dark active colour), linked to the same `ageFilter` state as the hero chips
- `ageFilter` and `setAgeFilter` passed down via `<FilterPanel ageFilter={ageFilter} onAgeChange={setAgeFilter} />`

### 2. Null/empty age_groups filter logic fixed (98d3205)
- Replaced `s.age_groups || ['All Ages']` (which didn't handle empty arrays) with:
  `Array.isArray(s.age_groups) && s.age_groups.length ? s.age_groups : ['All Ages']`
- Sessions with `NULL` or `[]` for `age_groups` are treated as "All Ages" — they show for any filter

### 3. "All Ages" chip = no filter, show all sessions (03c65cf)
**Root cause:** `ageFilter` was stored as the string `'All'`, and the filter guard `if (ageFilter !== 'All')` was correct, but the chip labelled "All Ages" was setting state to `'All'` while the DB value is `'All Ages'` — creating confusion and a latent correctness risk.

**Fix:**
- `ageFilter` default changed to `null` (no filter = show everything)
- "All Ages" hero chip sets `ageFilter = null`; active when `!ageFilter`
- FilterPanel AGE GROUP chips: "All Ages" sets `null`, others set their label string
- Filter logic replaced with exact spec:
  ```js
  const ageMatch = !ageFilter || ageFilter === 'All Ages' ||
    (Array.isArray(s.age_groups) && s.age_groups.length > 0 &&
      (s.age_groups.includes(ageFilter) || s.age_groups.includes('All Ages')))
  if (!ageMatch) return false
  ```
- `activeFilterCount` uses `!!ageFilter` (null = not active)
- `resetFilters()` sets `setAgeFilter(null)`

### 4. Reverted explicit SELECT column list — back to select('*') (189bb73)
**Root cause of regression:** commit `fa0fcd7` changed `select('*')` to an explicit column list to try to ensure `age_groups` was fetched. This broke the query and returned no sessions (likely a column name mismatch or Supabase rejecting the explicit list).

**Fix:** Reverted to `select('*, profiles(full_name)')`. DB data was confirmed correct — 4 sessions with `['All Ages']` and DappanKoothu with `['Kids', 'Seniors']`. The `*` wildcard correctly returns `age_groups`.

**Confirmed working behaviour after fix:**
- No filter / All Ages chip → all 5 sessions show
- Kids filter → DappanKoothu + all "All Ages" sessions
- Seniors filter → DappanKoothu + all "All Ages" sessions
- Adults filter → only "All Ages" sessions (DappanKoothu excluded)

---

## 🚨 UNRESOLVED — Carried Over from Session 14

### 🔴 #1 — pg_cron cannot call edge function
**Symptom:** `cron.job_run_details` shows `status = failed`, error = `Schema "net" does not exist` or `Token "null" is invalid`

**What was tried:**
- Job created with `net.http_post` → `Schema "net" does not exist`
- Job recreated with anon key hardcoded → `Token "null" is invalid` (old job still running)
- Unscheduled old job (jobid=1), new job (jobid=2) created with anon key

**Current state:** jobid=2 exists with anon key. Latest run showed `Schema "net" does not exist`. Need to check if pg_net extension is installed.

**Diagnostic queries to run first:**
```sql
-- Check if pg_net is installed
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- Check latest run status
SELECT runid, status, return_message, start_time
FROM cron.job_run_details
WHERE jobid = 2
ORDER BY start_time DESC
LIMIT 5;

-- Check current job
SELECT jobid, schedule, active, command FROM cron.job;
```

**Fix options in order of preference:**

Option A — Enable pg_net and use correct schema:
```sql
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
SELECT cron.unschedule('send-join-links-cron');
SELECT cron.schedule(
  'send-join-links-cron', '*/5 * * * *',
  $$
  SELECT extensions.http_post(
    url := 'https://vuxqimoqsbqsgvkashak.supabase.co/functions/v1/send-join-links',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_uIUbVLySwkY4SQXjObq4Rw_UM41h1Lo"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

Option B — Use Supabase's built-in `supabase_functions.http_request`:
```sql
SELECT cron.unschedule('send-join-links-cron');
SELECT cron.schedule(
  'send-join-links-cron', '*/5 * * * *',
  $$
  SELECT supabase_functions.http_request(
    'https://vuxqimoqsbqsgvkashak.supabase.co/functions/v1/send-join-links',
    'POST',
    '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_uIUbVLySwkY4SQXjObq4Rw_UM41h1Lo"}'::jsonb,
    '{}'::jsonb,
    5000
  );
  $$
);
```

Option C — If both fail, use a Supabase Database Webhook instead of pg_cron (more reliable, no extension needed). Create a webhook in Supabase dashboard → Database → Webhooks → trigger on sessions table INSERT/UPDATE when status changes to 'open'.

**Workaround until fixed:** Manual trigger via PowerShell works perfectly:
```powershell
Invoke-WebRequest -Uri "https://vuxqimoqsbqsgvkashak.supabase.co/functions/v1/send-join-links" -Method POST -Headers @{"Authorization"="Bearer sb_publishable_uIUbVLySwkY4SQXjObq4Rw_UM41h1Lo"; "Content-Type"="application/json"} -Body '{"session_id": "SESSION_ID_HERE"}'
```

---

## 📋 Pending Backlog

### 🟠 P1

| Task | Notes |
|------|-------|
| **pg_cron fix** | See Unresolved above — send-join-links cron still not firing automatically |
| **100ms — Mute any Peer** | dashboard → host role → Permissions → enable. Manual dashboard change. |
| **Auto-confirm session** | When `bookings_count >= min_seats` → status = 'confirmed'. Trigger on booking insert. |
| **Auto-cancel session** | 24h before if min_seats not met → cancel + notify all bookers |
| **Session reminder email** | Separate from join link — maybe 24h before as a heads-up? |
| **Join from ProfilePage** | BookingRow → direct ClassroomPage launch when canJoinNow |

### 🟡 P2

| Task | Notes |
|------|-------|
| **Razorpay webhook secret** | Set in Razorpay dashboard + `supabase secrets set RAZORPAY_WEBHOOK_SECRET=...` |
| **Google SSO** | Supabase OAuth + Google Cloud Console. ~2-3 hrs. |
| **bookings@ forwarding** | Google Workspace → forward to nrithyaholics@gmail.com |

### 🟢 P3

| Task | Notes |
|------|-------|
| Series/multi-session workshops | Makku feedback — summer workshop bundles |
| Ratings | Post-session star rating |
| Group bookings | Multiple attendees per booking |
| Choreographer public profile page | |
| Admin proxy session creation | |

---

## 🛠️ Dev Workflow Rules

- **Chrome extension is unreliable** — never use it, never call `Claude in Chrome:*` tools
- All git commands from `nrithyaholics-platform/` (repo root, NOT frontend/)
- **Inline styles only** — zero CSS files, zero Tailwind
- No TypeScript in frontend (`.jsx` only); Edge functions: `.ts` fine
- Vercel auto-deploys on push to master (~2 min)
- Edge function deploy: `supabase functions deploy {name} --no-verify-jwt`
- **Do NOT use explicit SELECT column lists in Supabase queries** — use `select('*')`. Explicit lists break if any column name is wrong or missing, and return no data silently.

## 💡 Key Architecture Decisions (don't re-debate)

1. **100ms Prebuilt via iframe** — SDK abandoned Session 7 (UMD/Vite incompatibility)
2. **Token expiry = hard disconnect** — client-side timer
3. **Grace period for people ALREADY inside** — `get-token` blocks new joins after `token_expires_at`
4. **One device per learner** — time-based ghost detection in get-token; hosts exempt
5. **Magic link only** — no passwords (Google SSO planned P1)
6. **Email split:** Supabase Auth sends magic link emails; Resend sends transactional (bookings@)
7. **Webhook creates booking on mobile** fast-path; verify-payment creates on desktop path; both send email; no duplicates (Postgres rejects duplicate razorpay_order_id)
8. **Join link email** sent by cron 5 mins before class via send-join-links edge function
9. **canJoinNow** driven by `platform_config` pre_join/grace minutes; per-session overrides take priority
10. **cancelled session** — canEnterClass and canTestSetup both check `session.status !== 'cancelled'`
11. **age_groups filter** — `null` ageFilter = no filter (show all). Specific value = session must have that value OR 'All Ages' in its array. Sessions with null/empty age_groups in DB pass all filters (treated as All Ages).

---

## 🔑 Credentials & Keys

| Item | Value |
|------|-------|
| Supabase URL | `https://vuxqimoqsbqsgvkashak.supabase.co` |
| Supabase Anon Key | `sb_publishable_uIUbVLySwkY4SQXjObq4Rw_UM41h1Lo` |
| Razorpay Live Key | `rzp_live_bYmMMbiG8WZC34` |
| 100ms Access Key | `69aca7a963cbbe924eef8f70` |
| 100ms Template ID | `69aca87c6236da36a7d8c593` |
| 100ms Subdomain | `dejoy-videoconf-406` |
| Resend From | `bookings@nrithyaholics.in` |
| APP_URL | `https://online.nrithyaholics.in` |

---

## 🗄️ Database — Key Tables & Columns

### `sessions` — notable columns
```sql
status                           text  -- 'draft'|'open'|'confirmed'|'full'|'cancelled'
age_groups                       text[] -- e.g. ['Kids','Seniors'] or ['All Ages']; NULL = All Ages
room_id                          text  -- 100ms room (set on first join)
reminder_sent_at                 timestamptz DEFAULT NULL  -- set when join link email sent
host_pre_join_minutes_override   int   DEFAULT NULL
guest_pre_join_minutes_override  int   DEFAULT NULL
host_grace_minutes_override      int   DEFAULT NULL
guest_grace_minutes_override     int   DEFAULT NULL
```

### `platform_config` (single row, id=1)
```sql
host_pre_join_minutes  int  -- default 15
guest_pre_join_minutes int  -- default 5
host_grace_minutes     int  -- default 30
guest_grace_minutes    int  -- default 15
```

### RLS policies (added Sessions 13-14)
- `sessions`: choreographer_id = auth.uid() OR is_admin = true (UPDATE)
- `bookings`: Admin can UPDATE any booking

---

## 📧 Email Flow Summary

| Trigger | Email | Sender | Content |
|---------|-------|--------|---------|
| Payment confirmed (desktop) | Booking confirmation | Resend | Session details + "join link coming" + Test Setup |
| Payment confirmed (mobile/UPI) | Booking confirmation | Resend | Same — sent via razorpay-webhook |
| 5 mins before class (cron) | Join link email | Resend | Magic link → auto-login → session page |
| Booking within join window | Instant join link | Resend | Same as above, triggered from verify-payment |
| Magic link request | Login link | Supabase Auth | Branded magic link email |

---

## 🆕 Claude Code Setup Guide

**What it is:** CLI tool that reads/edits your repo files directly, runs git commands, deploys — no more copy-paste workflow.

**Install:**
```bash
npm install -g @anthropic-ai/claude-code
```
Requires Node.js 18+. Check: `node --version`

**Run in your repo (use Git Bash, not PowerShell):**
```bash
cd "/c/Users/dejoy.mathai/OneDrive - Reliance Corporate IT Park Limited/User_Data/Personal/Personal/NrithyaHolics/V2 - Class/nrithyaholics-platform"
claude
```

**First message to Claude Code:**
```
Read HANDOFF_SESSION_15.md to understand the project, then [describe what you need].
```

**What changes with Claude Code:**
- No more copy-pasting files to outputs and back
- Claude reads files directly before editing — no blind find-replace
- Claude runs git add/commit/push itself
- Claude runs supabase deploy commands itself
- You focus on describing what you want, not file management

**What stays the same:**
- Screenshots and UI feedback → still here (claude.ai)
- Architecture discussions → still here
- 100ms dashboard changes → still manual
- Supabase SQL Editor changes → still manual

**Tip:** Use Git Bash not PowerShell — avoids the curl/Invoke-WebRequest friction we hit today.
