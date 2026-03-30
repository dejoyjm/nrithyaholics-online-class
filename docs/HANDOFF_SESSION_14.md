# NrithyaHolics — Session 14 Handoff
**Date:** 16-Mar-2026 | **Sessions completed:** 1–14

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

## ✅ Completed This Session (Session 14)

### 1. get-token — Multi-device ghost peer fix (DEPLOYED)
**File:** `supabase/functions/get-token/index.ts`

- Added `getGhostPeerIds()` — queries 100ms Sessions API for active peers with `left_at == null`
- Added `removeGhostPeers()` — calls `POST /v2/active-rooms/{roomId}/remove-peers` per ghost
- Time-based ghost detection: peer is ghost if `joined_at` > 3 mins ago AND `left_at == null`
- Active peer (real second device): `joined_at` < 3 mins ago → block
- Ghost peer (stale mobile WebRTC): `joined_at` > 3 mins ago → remove and allow rejoin
- Hosts always exempt from peer check
- `recently_left` flag still accepted but no longer used as bypass (removed trust in client)

**Known limitation:** 3-minute threshold has a crack window — deliberate rapid sequence (leave laptop → join mobile → leave mobile → join laptop immediately) can bypass. Accepted for MVP. Full fix requires DB-side session lock with heartbeat — deferred.

### 2. 100ms dashboard — Mute any Peer permission
- Go to: dashboard.100ms.live → Template VC-icy-rain-507242 → **host** role → Permissions → enable **"Mute any Peer"**
- This gives choreo "Mute All" button in participant list
- **Status: Pending — needs to be done manually in dashboard**

### 3. Time picker — 24×7, 15-min granularity (DEPLOYED)
- `ChoreoPage.jsx` and `AdminPage.jsx` — replaced TIME_SLOTS arrays with HOURS (0-23) + MINUTES ['00','15','30','45']
- IST-safe date initialisation using `toLocalDateString()` helper
- Live preview line shows formatted time

### 4. Magic link email branding (DONE in Supabase Auth dashboard)
- Subject: `Your NrithyaHolics Online login link`
- Branded HTML with burnt orange header, login button, safety footer

### 5. Resend setup (COMPLETE)
- Domain: nrithyaholics.in ✅ verified
- Sender: `NrithyaHolics Online <bookings@nrithyaholics.in>`
- Secrets: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` set in Supabase

### 6. Booking confirmation email (DEPLOYED — both paths)
- `verify-payment/index.ts` — desktop Razorpay path
- `razorpay-webhook/index.ts` — mobile UPI/GPay path (webhook fires first)
- Both use `EdgeRuntime.waitUntil()` so email never blocks payment response
- Content: session details card, Add to Google Calendar, "Join link coming 5 mins before class" notice, Test Setup card, tips

### 7. Email deep links — Join Class + Test Setup (DEPLOYED)
- `App.jsx` — detects `?session=ID` and `?test=1` URL params on load
- `?session=ID` → opens SessionPage directly (no homepage)
- `?test=1` → also auto-opens SetupTestModal
- `cameFromEmail` prop → changes "Login to Book" to "Log In to Join Class →" with hint "Already booked? Log in and your spot will be waiting."

### 8. Razorpay webhook — return OK immediately (DEPLOYED)
- Was: `await sendEmail()` then `return OK` → caused Razorpay timeout on mobile, stalled GPay redirect
- Fixed: `EdgeRuntime.waitUntil(emailPromise)` then immediately `return OK`

### 9. skip_preview fix for guests (DEPLOYED)
- Was: `skip_preview=true` for guests → joined with no audio/video controls at all
- Fixed: back to `skip_preview=false` for everyone
- Mute on join: not reliably enforceable via 100ms Prebuilt URL params — the preview screen lets users override. Host "Mute any Peer" permission is the practical solution.

### 10. Rejoin after leave — ClassroomPage (DEPLOYED)
- On leave/end, writes `nrh_left_{sessionId} = Date.now()` to sessionStorage
- On fetch token, passes `recently_left: true` if left within 90 seconds
- get-token uses time-based ghost detection regardless (see point 1)
- Better error message: "You appear to be in this class on another device... If you just left, wait 30 seconds"

### 11. Cancelled session — hide Join/Test buttons (DEPLOYED)
- `canEnterClass` and `canTestSetup` both now check `session.status !== 'cancelled'`
- Logged-in booked user on cancelled session now correctly sees "Session Cancelled" not Join button

### 12. send-join-links edge function (DEPLOYED)
- New function: `supabase/functions/send-join-links/index.ts`
- Generates signed magic link per learner via `supabase.auth.admin.generateLink()`
- Magic link redirects to `/?session=SESSION_ID` — auto-login + direct session open
- Supports `session_id` param (manual/cron trigger) and `single_user_email` (late booking)
- Marks `reminder_sent_at` on session to prevent duplicate sends
- Timing: DB fetches sessions in ±30 min window, per-session check uses `scheduled_at - preJoinMins` with 6-min slack

### 13. pg_cron job (ATTEMPTED — see Unresolved below)
- pg_cron extension enabled
- `reminder_sent_at timestamptz` column added to sessions table
- Job `send-join-links-cron` created, schedule `*/5 * * * *`
- **Problem:** `net.http_post` / `extensions.http_post` failing — see Unresolved section

### 14. Late booking join link (DEPLOYED)
- In `verify-payment` and `razorpay-webhook`: if session join window already open at booking time, immediately calls `send-join-links` with `single_user_email` so late booker gets instant join link

---

## 🚨 UNRESOLVED — Must Fix Next Session

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
| **Age group tag** | Add `age_group` field: Kids/Teens/Adults/All ages |
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
- Project knowledge synced from GitHub — always search project knowledge first

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
Read HANDOFF_SESSION_14.md to understand the project, then help me fix the pg_cron issue described in the Unresolved section.
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