# NrithyaHolics — Session 16 Handoff
**Date:** 20-Mar-2026 | **Sessions completed:** 1–16

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

## ✅ Completed This Session (Session 16)

### 1. Hash-based routing for page refresh persistence (0c15be9)
**File:** `frontend/src/App.jsx`

Added pure-vanilla hash routing so that refreshing the browser restores the correct page instead of always landing on HomePage.

- `parseHash(hash)` — module-level helper, returns `{ page, id }` from `window.location.hash`
- `applyHashState(hash, u, p)` — resets all page-navigation state then switches on the parsed page; takes `u`/`p` as explicit params to avoid stale-closure issues in event listeners
- `navigateTo(hash)` — sets `window.location.hash` AND calls `applyHashState` together; used at every navigation callsite
- `useEffect [loading]` — once auth resolves, restores page from hash (skipped when URL params took priority)
- `useEffect [user?.id, profile?.id]` — restores `pendingHash` after login completes (e.g. refresh on `#/profile` while logged out → auth → ProfilePage)
- `useEffect [user, profile]` — re-registers `popstate` listener with fresh closure on every auth change (browser back/forward)
- `useEffect [user, profile?.is_admin]` — keeps `#/admin` in the URL bar for admin users

**Hash routes supported:**
| Hash | Page |
|------|------|
| `#/` or empty | HomePage |
| `#/session/ID` | SessionPage |
| `#/profile` | ProfilePage (auth-guarded; restores after login) |
| `#/teach` | ChoreoPage (only if approved choreographer) |
| `#/admin` | AdminPage (only if is_admin; else → `#/`) |
| `#/classroom/ID` | Restores as SessionPage (user re-clicks Join for fresh token) |

**All navigation callsites updated to use `navigateTo`:**
- `onSessionClick` → `navigateTo('#/session/' + id)`
- `onProfileClick` → `navigateTo('#/profile')`
- `onSwitchToTeaching` → `navigateTo('#/teach')`
- All `onBack` / `onLeave` / `onSwitchToLearning` handlers → `navigateTo('#/')`
- `ClassroomPage.onStartClass` / `ProfilePage.onJoinClass` → `window.location.hash = '#/classroom/ID'` (direct, avoids calling applyHashState which would reset state)

**Priority rules preserved:**
- Magic link `?session=ID` and Razorpay redirect params take priority over hash (URL params set `urlParamsHandled.current = true`; hash restoration is skipped)
- URL cleaning now uses `replaceState` that sets the hash in the same call (no extra history entry)
- choreo apply localStorage fix (`nrh_choreo_apply_step`) still routes to RoleSelectPage at `#/`
- `logOut` sets `window.location.hash = '#/'` before clearing state

---

### 2. 24-hour session reminder email + cron job (beb96d7)
**File:** `supabase/functions/send-reminders/index.ts` *(new)*

New edge function that fires every 30 minutes. Finds sessions whose `scheduled_at` is between `NOW()+23h` and `NOW()+25h`, sends a warm reminder email to every confirmed learner, then stamps `reminder_24h_sent_at` to prevent duplicates.

**Email content:**
- Subject: `Your class tomorrow — [Session Title] 🎶`
- Session details table (class, instructor, date, time/duration)
- "Your spot is confirmed" reassurance
- **Add to Google Calendar** button (properly formatted gcal URL with UTC dates)
- **Test Your Setup** button → `APP_URL/#/session/SESSION_ID`
- "Join link arrives 5 mins before class" note

**Same pattern as `send-join-links`:** Supabase admin client, Resend, `EdgeRuntime.waitUntil`, manual trigger via `session_id` body param for testing.

**DB column required (add via SQL editor before cron fires):**
```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz DEFAULT NULL;
```

**pg_cron job to create (SQL editor):**
```sql
SELECT cron.schedule(
  'send-reminders-cron', '*/30 * * * *',
  $$
  SELECT supabase_functions.http_request(
    'https://vuxqimoqsbqsgvkashak.supabase.co/functions/v1/send-reminders',
    'POST',
    '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_uIUbVLySwkY4SQXjObq4Rw_UM41h1Lo"}'::jsonb,
    '{}'::jsonb,
    5000
  );
  $$
);
```

---

### 3. HMAC signature verification hardened in razorpay-webhook (9203e68)
**File:** `supabase/functions/razorpay-webhook/index.ts`

The function already had HMAC-SHA256 verification scaffolded, but with three gaps now fixed:

| | Before | After |
|---|---|---|
| No secret configured | silent pass | `console.warn(...)` then continues (backwards-compatible) |
| Missing signature header | `401` plain text | `400 { error: 'Invalid signature' }` JSON |
| Signature mismatch | `===` string compare | timing-safe XOR loop → `400` JSON |
| Body reading | branched `var` in if/else | single `rawBody = await req.text()` at top |

**`timingSafeStringEqual(a, b)`** — XOR loop over all chars regardless of mismatch position; prevents timing oracle attacks.

---

### 4. Waitlist for full sessions with DB capture (ecad4b9)
**DB table required (already created):**
```sql
CREATE TABLE IF NOT EXISTS waitlist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz DEFAULT NOW(),
  notified_at timestamptz DEFAULT NULL,
  UNIQUE(session_id, user_id)
);
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
-- RLS: users can insert/select own rows; admin can select all
```

**`frontend/src/HomePage.jsx` — SessionCard:**
- Accepts `user` + `onLoginClick` props (now threaded from the `filtered.map`)
- `useEffect` checks `waitlist` table on mount for existing entry
- "Waitlist" button: clicks `handleWaitlist(e)` → `stopPropagation` (doesn't open session) → inserts row; handles `23505` duplicate gracefully
- Button turns green + "✓ On Waitlist" + disabled once joined
- Unauthenticated users → `onLoginClick()` (login first)

**`frontend/src/pages/SessionPage.jsx`:**
- New `session.status === 'full'` render branch in booking card (between `isChoreo` and generic `!isBookable`)
- Shows 🎟️ "This session is full" + "Notify me if a spot opens →" button
- "✓ You're on the waitlist" green banner once joined
- Unauthenticated: button label changes to "Log in to join waitlist"

**`frontend/src/pages/AdminPage.jsx`:**
- `fetchAll` now queries `waitlist` table (4th parallel query), groups by `session_id` into `waitlistCounts` dict
- Sessions table: `+N waiting` amber badge on rows with waitlist entries
- `AdminSessionEditModal`: `useEffect` fetches email + created_at for that session's waitlist on open; scrollable list (max 160px) with email + join date

**Note:** Actual notification emails to waitlist when a spot opens are a future task. This session captures the data only.

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
| **pg_cron fix** | See Unresolved above — send-join-links cron still not firing automatically. Same fix needed for new send-reminders cron. |
| **send-reminders cron** | SQL to create the cron job is in Session 16 notes above. Column `reminder_24h_sent_at` also needs to be added. |
| **Waitlist notification email** | When a booking is cancelled and a seat opens, email the first person on the waitlist. `notified_at` column is already in the table. |
| **100ms — Mute any Peer** | dashboard → host role → Permissions → enable. Manual dashboard change. |
| **Auto-confirm session** | When `bookings_count >= min_seats` → status = 'confirmed'. Trigger on booking insert. |
| **Auto-cancel session** | 24h before if min_seats not met → cancel + notify all bookers |
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
12. **Hash routing** — `window.location.hash` is the source of truth for current page. `navigateTo(hash)` sets hash + React state together. `applyHashState(hash, u, p)` takes auth as explicit params to avoid stale closures. URL params (magic link / Razorpay) take priority over hash and skip hash restoration.

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
reminder_24h_sent_at             timestamptz DEFAULT NULL  -- set when 24h reminder sent (NEW Session 16)
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

### `waitlist` (NEW — Session 16)
```sql
id          uuid PRIMARY KEY
session_id  uuid REFERENCES sessions(id) ON DELETE CASCADE
user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE
email       text NOT NULL
created_at  timestamptz DEFAULT NOW()
notified_at timestamptz DEFAULT NULL  -- set when notification email sent
UNIQUE(session_id, user_id)
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
| ~24h before class (cron every 30m) | 24h reminder | Resend | Session details + Google Calendar + Test Setup |
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
Read HANDOFF_SESSION_16.md to understand the project, then [describe what you need].
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
