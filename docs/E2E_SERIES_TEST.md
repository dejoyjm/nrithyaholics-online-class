# End-to-End Test Script: Workshop Series Sessions

**Status:** Ready for execution
**Date written:** 2026-03-31
**Scope:** Full workshop series feature (Phases 1–9 of the series implementation)

Legend:
- 💳 **Requires real/test Razorpay payment**
- 🔧 **Can be done with SQL insert only**
- 👁 **UI-only check**

---

## Pre-Test Setup

Before running these tests, ensure:
1. You have access to a choreographer account and a learner account (+ admin account for T15)
2. Supabase SQL Editor access
3. Access to email inbox for `dejoy.mathai@ril.com` (or your test learner email)
4. `online.nrithyaholics.in` is reachable

---

## T1 — Create single session as choreographer (regression check)

**Pre-condition:** Logged in as choreographer.
**Action:**
1. Go to ChoreoPage → click "+ New Session"
2. Confirm "Single Class" is selected by default in the Session Type toggle
3. Fill in title, set a future date/time, leave duration at 60 min, set a price
4. Click Save

**Expected result:**
- Session saved successfully
- In Supabase: `session_type = 'single'`, `series_parts IS NULL`

**Verification (SQL):**
```sql
SELECT id, title, session_type, series_parts
FROM sessions
WHERE title = '<your title>'
ORDER BY created_at DESC LIMIT 1;
```
Expected: `session_type = 'single'`, `series_parts = null`

---

## T2 — Create 2-part series as choreographer

**Pre-condition:** Logged in as choreographer.
**Action:**
1. Click "+ New Session"
2. Click "Workshop Series" toggle button
3. Confirm Date & Time fields are hidden and "Workshop Parts" section appears
4. Set Part 1: future date (e.g. `2026-04-05`), time `6:00 PM`, duration `90 min`
5. Set Part 2: next day (e.g. `2026-04-06`), same time, duration `90 min`
6. Set title, price, and save

**Expected result:**
- Session saved successfully
- `session_type = 'series'`
- `series_parts` is a JSONB array with 2 elements

**Verification (SQL):**
```sql
SELECT id, title, session_type, series_parts, scheduled_at
FROM sessions
WHERE title = '<your title>'
ORDER BY created_at DESC LIMIT 1;
```
Expected:
- `session_type = 'series'`
- `series_parts[0].part = 1`, `series_parts[1].part = 2`
- `series_parts[0].start` is UTC equivalent of `2026-04-05 12:30:00 UTC` (for a 6 PM IST start)
- `scheduled_at` matches `series_parts[0].start`

---

## T3 — Single session card on HomePage (regression check) 👁

**Pre-condition:** At least one single session with status `open` exists.
**Action:** Visit `https://online.nrithyaholics.in` without logging in.

**Expected result:**
- Single session card shows normal `Sat, 5 Apr · 6:00 PM` date format
- No "🎓 Workshop Series" badge on single session card

---

## T4 — Series card on HomePage 👁

**Pre-condition:** Series session from T2 exists with status `open`.
**Action:** Visit homepage.

**Expected result:**
- Series card shows `"🎓 Workshop Series"` badge (top-left, below style tag, dark `#1a1a2e` background)
- Date line shows `"Sat 5 + Sun 6 Apr · 2 parts"` format (no time shown)
- No single-session date format on this card

---

## T5 — Book series session → confirmation email lists all parts 💳

**Pre-condition:** Series session from T2 is open. Logged in as learner (`dejoy.mathai@ril.com`).
**Action:**
1. Click the series session card → SessionPage
2. Confirm "Workshop Schedule" block shows both parts with date/time ranges in IST
3. Click Book → complete payment

**Expected result (email):**
- Subject: `"Confirmed: <title> — Workshop Series"`
- Email body contains `"📚 Your Workshop Schedule"` heading
- Both parts listed: `"Part 1 — Saturday 5 April · 6:00 pm – 7:30 pm IST"`, `"Part 2 — Sunday 6 April · 6:00 pm – 7:30 pm IST"`
- CTA button: `"🎓 Go to Workshop Hub →"` (purple `#5b4fcf` background)
- No single date/time rows visible

**Verification:** Check email inbox + check DB:
```sql
SELECT confirmation_email_sent_at FROM bookings
WHERE session_id = '<series session id>'
ORDER BY created_at DESC LIMIT 1;
```

---

## T6 — Join before Part 1 window → too_early response

**Pre-condition:** Series session scheduled with Part 1 starting > 15 min in the future. Learner has a confirmed booking. Logged in as learner.
**Action:**
1. Navigate to the series session → click "Join Class"

**Expected result:**
- Countdown screen appears (not classroom)
- Shows "Class starts in Xd Yh Zm Ws" countdown
- No room iframe shown

---

## T7 — Join during Part 1 window → room opens

**Pre-condition:** Part 1 starts within the next 5 minutes (within `guest_pre_join_minutes`).
**Action:** Navigate to the series session → click "Join Class"

**Expected result:**
- 100ms room iframe loads successfully
- Can see/hear video
- Confirm in edge function logs: `get-token` returned a valid JWT for Part 1

**Verification (Supabase function logs):**
Check `get-token` function logs for "series active part 1" or similar log line.

---

## T8 — Join between parts → `between_parts` countdown screen 🔧

**Pre-condition:** Part 1 has ended (past its grace window). Part 2 has not yet started (before pre-join window).
**Setup SQL:** Create a series session where Part 1 ended 2 hours ago and Part 2 starts in 2 hours:
```sql
INSERT INTO sessions (
  title, choreographer_id, scheduled_at, duration_minutes,
  status, session_type, series_parts, price_tiers, min_seats, max_seats
)
SELECT
  'T8 Between Parts Test',
  id,
  NOW() - INTERVAL '2 hours',
  60,
  'confirmed',
  'series',
  json_build_array(
    json_build_object('part', 1, 'start', (NOW() - INTERVAL '2 hours')::text, 'duration_minutes', 60),
    json_build_object('part', 2, 'start', (NOW() + INTERVAL '2 hours')::text, 'duration_minutes', 60)
  )::jsonb,
  '[{"label":"Standard","price":0}]'::jsonb,
  1, 20
FROM profiles WHERE is_admin = true LIMIT 1
RETURNING id;
```
Then insert a confirmed booking for your learner user:
```sql
INSERT INTO bookings (user_id, session_id, seats, amount_paid_inr, status)
VALUES ('<learner_user_id>', '<session_id>', 1, 0, 'confirmed');
```

**Action:** Log in as learner → navigate to this session → click "Join Class"

**Expected result:**
- `between_parts` screen shown (not countdown, not room)
- Shows: `"🎉 Part 1 Complete"` heading
- Shows: `"Part 2 starts in"` with live countdown (days/hours/min/sec)
- `"← Back to session"` button visible

**Cleanup:**
```sql
UPDATE sessions SET status = 'cancelled' WHERE title = 'T8 Between Parts Test';
```

---

## T9 — Join during Part 2 window → room opens

**Pre-condition:** Part 2 is within its pre-join window. Continuing from T8 or a new test session.
**Action:** Wait until Part 2 opens → navigate to session → click "Join Class"

**Expected result:**
- 100ms room iframe loads successfully (same `room_id` as Part 1 — it's the same session)
- Confirm in `get-token` logs: returned JWT for Part 2 window

---

## T10 — Join after Part 2 grace → `session_ended` response

**Pre-condition:** Part 2 has ended and grace period has elapsed.
**Action:** Navigate to the session → click "Join Class"

**Expected result:**
- "Session has ended" or equivalent message shown
- No countdown, no room

---

## T11 — `check-upcoming-parts` fires before Part 1 → email sent, stamp set 🔧

**Pre-condition:** Series session from T2, with a confirmed booking. Part 1 starts in < 5 minutes (within `guest_pre_join_minutes`).
**Setup:** Update `series_parts[0].start` in the session to be 4 minutes from now:
```sql
UPDATE sessions
SET series_parts = jsonb_set(
  series_parts,
  '{0,start}',
  to_jsonb((NOW() + INTERVAL '4 minutes')::text)
)
WHERE id = '<series_session_id>';
```

**Action:** Manually invoke `check-upcoming-parts`:
```bash
supabase functions invoke check-upcoming-parts --no-verify-jwt
```
Or wait for the cron to fire (runs every minute).

**Expected result:**
- Join link email received in learner's inbox
- Email subject: `"🎬 Part 1 of <title> starts soon — here is your join link"`
- Email contains "Join Part 1 Now →" CTA button
- `series_parts_sent` stamped in DB:

```sql
SELECT series_parts_sent FROM sessions WHERE id = '<series_session_id>';
```
Expected: `{"1": "2026-04-05T12:26:00.000Z"}` (non-null timestamp for key "1")

---

## T12 — `check-upcoming-parts` fires again → no duplicate

**Pre-condition:** T11 completed; `series_parts_sent.1` is already stamped.
**Action:** Invoke `check-upcoming-parts` again immediately.

**Expected result:**
- No email sent
- `series_parts_sent.1` timestamp unchanged in DB

---

## T13 — `check-upcoming-parts` fires before Part 2 → second email sent 🔧

**Pre-condition:** T11 completed (`series_parts_sent.1` stamped). `series_parts_sent.2` is null or absent.
**Setup:** Update Part 2 start time to 4 minutes from now:
```sql
UPDATE sessions
SET series_parts = jsonb_set(
  series_parts,
  '{1,start}',
  to_jsonb((NOW() + INTERVAL '4 minutes')::text)
)
WHERE id = '<series_session_id>';
```

**Action:** Invoke `check-upcoming-parts`.

**Expected result:**
- Second join link email received
- Subject: `"🎬 Part 2 of <title> starts soon — here is your join link"`
- `series_parts_sent.2` now stamped in DB:

```sql
SELECT series_parts_sent FROM sessions WHERE id = '<series_session_id>';
```
Expected: `{"1": "...", "2": "..."}`

---

## T14 — Series auto-cancel if min_seats not met → all learners emailed 🔧

**Pre-condition:** Series session with `min_seats = 3`, only 1 confirmed booking. Session scheduled < 24h from now.

**Action:** Wait for or manually trigger the auto-cancel logic (runs via the existing `send-join-links` cron, which checks `min_seats`).

**Expected result:**
- Session `status` changes to `'cancelled'`
- All confirmed bookings' users receive a cancellation email (existing behaviour — not new to series)
- Verify via SQL:
```sql
SELECT status FROM sessions WHERE id = '<series_session_id>';
```

---

## T15 — Admin views series in SessionsTab → "Series · N parts" label 👁

**Pre-condition:** Logged in as admin (`nrithyaholics@gmail.com`). Series session exists with status `open`.
**Action:** Go to AdminPage → Sessions tab.

**Expected result:**
- In the sessions table, the date column for a series session shows: `"5 Apr 2026 · Series · 2 parts"` (purple text after the date)
- Single session rows show no "Series" label

**Also test edit modal:**
1. Click the series session row → Edit icon
2. `AdminSessionEditModal` opens
3. Below the date/time fields, a yellow info box is shown:
   - Header: `"Workshop Series: 2 parts"`
   - Lists each part: `"Part 1 — Saturday 5 April · 6:00 pm (90 min)"`
   - Footer note: `"To edit series dates, ask the choreographer to update via their dashboard."`
4. Single session edit modal shows no such box

---

## T16 — All single session flows still pass (regression) 👁💳

**Action:** Run through the core single-session happy path:
1. Create a single session as choreographer → confirm `session_type = 'single'`
2. Book it as a learner → confirm confirmation email shows one Date + Time row (no Workshop Schedule)
3. Subject contains `"Confirmed: <title> on <weekday long date>"`
4. CTA button: `"Join Class →"` (dark `#0f0c0c` background)
5. Class opens 5 min before start → room accessible
6. After grace period → session ended screen

**Expected result:** All behaviours identical to pre-series state. No regressions.

---

## Test Session Cleanup

After all tests, clean up test sessions:
```sql
UPDATE sessions
SET status = 'cancelled'
WHERE title LIKE 'T%' AND (title LIKE 'T1 %' OR title LIKE 'T2 %' OR title LIKE 'T8 %')
   OR title = 'Test Workshop Series - UI Check';
```

Or use the Admin panel to mark sessions as cancelled.
