# AI Scoring Sprint — Day 1 Part 2 Handoff

## Status at handoff

| Component | Status |
|---|---|
| `PracticePage.jsx` | Built, deployed to Vercel |
| `upload-student-video` edge fn | Deployed, active |
| `score-dance` edge fn | Deployed, active |
| `update-score` edge fn | **NOT YET BUILT** (next task) |
| `pose-service/main.py` | Updated — calls `update-score` after scoring |
| `INTERNAL_SECRET` | Exists in Supabase secrets (cryptographic value, do not change) |
| Practice button | Fix pushed, pending Vercel deploy |

## INTERNAL_SECRET situation

The secret already existed with a cryptographic value before today.
Claude Code correctly uses `Deno.env.get('INTERNAL_SECRET')` in all edge function files.
The same secret value must be added to Railway pose-service environment variables.

**Admin action required:** Supabase Dashboard → Settings → Secrets → `INTERNAL_SECRET` → eye icon → copy value → paste into Railway pose-service Variables.

## Next tasks in order

1. Verify Practice button appears on completed sessions after Vercel deploys
2. Build `update-score` edge function (spec below)
3. Add `INTERNAL_SECRET` to Railway pose-service variables
4. Test full end-to-end: Practice → Record → Save → `score-dance` fires → Railway scores → `update-score` updates DB
5. Build ScoreCard on ProfilePage
6. Build score report in AdminPage RecordingsTab

## `update-score` edge function spec

```
POST /functions/v1/update-score
Header: x-internal-secret must match INTERNAL_SECRET env var
Body: { session_id, student_recording_id, overall_score, timeline }
```

- No JWT auth needed — internal call from Railway only
- Action: `UPDATE dance_scores SET overall_score = $, timeline_data = $, status = 'scored' WHERE upload_id = student_recording_id`
- Return `{ updated: true }` on success
- Deploy with `--no-verify-jwt`

## Score display spec

### ProfilePage ScoreCard (on completed bookings with a score)

- `status = 'scored'` → show "Your Score: {overall_score}/100" in large text; tap to expand a simple per-second timeline bar graph
- `status = 'processing'` → show "Your coach is reviewing your practice 🎯"
- `status = 'no_reference'` → show nothing (silent)
- `status = 'failed'` → show nothing (silent)

### AdminPage score report (RecordingsTab)

Student recordings show:
- `recorder_type` column
- Score button — triggers `score-dance` manually as a fallback retry
- Score result when available: `overall_score` + link to side-by-side skeleton modal

## Key files

| File | State |
|---|---|
| `frontend/src/pages/PracticePage.jsx` | New |
| `frontend/src/pages/ProfilePage.jsx` | Updated — Practice button |
| `frontend/src/App.jsx` | Updated — practice routing |
| `supabase/functions/upload-student-video/index.ts` | Fires `score-dance` after insert |
| `supabase/functions/score-dance/index.ts` | Orchestrates full scoring pipeline |
| `supabase/functions/update-score/index.ts` | **To build** |
| `pose-service/main.py` | Calls `update-score` after scoring |

## Safety rules (carry forward)

- master branch only
- Inline styles only in frontend — no CSS files, no TypeScript in frontend
- Never touch `ClassroomPage.jsx` or `SDKClassroom/index.jsx`
- Always deploy edge functions with `--no-verify-jwt --project-ref vuxqimoqsbqsgvkashak`
- Use `--use-api` flag if Docker bundling fails (corporate SSL issue)
