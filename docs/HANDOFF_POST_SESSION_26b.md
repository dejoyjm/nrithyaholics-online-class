# Handoff: Post-Session 26b

## Session Summary

Implemented per-part join link emails for workshop series sessions.
Phase 4 of the series implementation (Phases 1–3 were DB migration + sessionTime.js + get-token, done in session 26a).

---

## TASK 1 — `supabase/functions/send-join-links/index.ts` (single-line change, deployed)

Added `.eq('session_type', 'single')` to the sessions query so series sessions
are never processed by this function. Single session behaviour is completely
unchanged. Deployed — now at new version.

Change location: the `let sessionsQuery = supabase.from('sessions')...` chain
in the main handler.

---

## TASK 2 — `supabase/functions/check-upcoming-parts/index.ts` (new, deployed)

New edge function. Handles per-part join link emails for series sessions only.

### Logic

1. Fetches `platform_config` (id=1) for `guest_pre_join_minutes`.
2. Fetches all series sessions: `session_type = 'series'`, `status IN ('open','confirmed')`,
   `series_parts IS NOT NULL`. Uses `select('*')` throughout.
3. For each session, iterates `series_parts` array. For each part:
   - **Idempotency check**: if `series_parts_sent[part_number_as_string]` is not null → skip.
   - **Timing check**: computes `windowOpenMs = part.start - preJoinMins * 60000`.
     `preJoinMins = session.guest_pre_join_minutes_override ?? config.guest_pre_join_minutes ?? 5`
     (never hardcoded). Window must have opened within the last 6 minutes (1 min slack for cron drift).
   - **Sends immediately stamps** `series_parts_sent[partKey]` with current ISO timestamp
     before sending emails — prevents duplicate sends from parallel cron invocations.
   - Fetches all confirmed, non-kicked bookings for the session.
   - For each learner: fetches email via `supabase.auth.admin.getUserById`, generates signed
     magic link redirecting to `/?session=SESSION_ID`, sends HTML email via Resend.
4. Returns `{ checked: N, sent: [{ session_id, part, learners }] }`.

### Email details

- Subject: `🎬 Part [N] of [session title] starts soon — here is your join link`
- Body: personalised greeting, part number, date/time in IST, CTA button "Join Part [N] Now →"
- Same brand template as `send-join-links`
- Magic link auto-logs the learner in and redirects to their session page

### Pre-join resolution (never hardcoded)

```
preJoinMins = session.guest_pre_join_minutes_override ?? config?.guest_pre_join_minutes ?? 5
```

---

## TASK 3 — pg_cron job (run manually in Supabase SQL Editor)

**Run this SQL to register the cron job:**

```sql
SELECT cron.schedule(
  'check-upcoming-parts-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vuxqimoqsbqsgvkashak.supabase.co/functions/v1/check-upcoming-parts',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

**Verify it was created:**

```sql
SELECT jobname, schedule, active FROM cron.job
WHERE jobname = 'check-upcoming-parts-every-5min';
```

**To remove it:**

```sql
SELECT cron.unschedule('check-upcoming-parts-every-5min');
```

The function uses `--no-verify-jwt` so no Authorization header is needed from the cron caller.

---

## TASK 4 — Manual test steps

### Step A — Create a test series session with Part 1 starting in ~6 minutes

Run in Supabase SQL Editor:

```sql
INSERT INTO sessions (
  title, choreographer_id, scheduled_at, duration_minutes,
  status, session_type, series_parts, series_parts_sent,
  price_tiers, min_seats, max_seats
)
SELECT
  'TEST SERIES PART EMAIL - DELETE AFTER',
  id,
  NOW() + interval '6 minutes',
  60,
  'confirmed',
  'series',
  ('[{"part":1,"start":"' || (NOW() + interval '6 minutes')::text ||
   '","duration_minutes":60},{"part":2,"start":"' ||
   (NOW() + interval '30 hours')::text || '","duration_minutes":60}]')::jsonb,
  '{"1": null, "2": null}'::jsonb,
  '[{"label":"Standard","price":100}]'::jsonb,
  1,
  10
FROM profiles WHERE is_admin = true LIMIT 1
RETURNING id, title, series_parts;
```

### Step B — Insert a confirmed booking for a learner email you control

```sql
INSERT INTO bookings (session_id, booked_by, credits_paid, status)
SELECT
  'SESSION_ID_FROM_ABOVE',
  id, 100, 'confirmed'
FROM profiles WHERE id = (
  SELECT id FROM auth.users WHERE email = 'dejoy.mathai@ril.com'
) LIMIT 1;
```

### Step C — Manually trigger the function (PowerShell)

```powershell
Invoke-WebRequest -Uri "https://vuxqimoqsbqsgvkashak.supabase.co/functions/v1/check-upcoming-parts" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{}'
```

Or via curl:

```bash
curl -X POST https://vuxqimoqsbqsgvkashak.supabase.co/functions/v1/check-upcoming-parts \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Step D — Verify

1. Check `dejoy.mathai@ril.com` inbox for Part 1 email with "Join Part 1 Now →" button
2. Check idempotency:
   ```sql
   SELECT series_parts_sent FROM sessions WHERE id = 'SESSION_ID';
   -- Expect: {"1": "2026-...", "2": null}
   ```
3. Trigger the function a second time — confirm no duplicate email is sent
4. Clean up:
   ```sql
   UPDATE sessions SET status = 'cancelled' WHERE title = 'TEST SERIES PART EMAIL - DELETE AFTER';
   ```

---

## Files changed

| File | Change |
|---|---|
| `supabase/functions/send-join-links/index.ts` | Added `.eq('session_type', 'single')` — excludes series |
| `supabase/functions/check-upcoming-parts/index.ts` | New function — per-part emails for series sessions |
| `docs/HANDOFF_POST_SESSION_26b.md` | This file |

---

## Deployed function versions (post-session 26b)

| Function | Status |
|---|---|
| `send-join-links` | Updated — series sessions now excluded |
| `check-upcoming-parts` | New — deployed |
| `get-token` | Updated in session 26a |

---

## Next priorities

- Register the pg_cron job (Task 3 SQL above — run manually)
- Run the manual test (Task 4) to verify end-to-end email delivery
- Admin UI for creating series sessions (enter parts as a list of date/time + duration)
- Wire `canJoinNow` from `sessionTime.js` into `SessionPage.jsx` — currently SessionPage
  still has its own inline join eligibility logic
- Booking confirmation email deduplication (P1 from session 25 backlog):
  track `confirmation_email_sent_at` on bookings to prevent double-sends between
  `razorpay-webhook` and `verify-payment` paths
