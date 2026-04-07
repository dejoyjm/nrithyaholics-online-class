# Handoff — AI Scoring Sprint Day 1 (07 Apr 2026)

## Status
Phase 1 complete. Phase 2 complete and verified with real skeleton video.
Phase 3 architecture locked. Ready to build.

## What Was Built Today

### Phase 1 — Reference Infrastructure
- DB: is_ai_reference, reference_label on recordings; student_uploads and
  dance_scores tables; show_pose_preview_to_choreo in platform_config
- RecordingsTab.jsx — toggle, label, extract trigger, skeleton preview modal
- RLS: admins_read_all_recordings, admins_update_recordings

### Phase 2 — Pose Extraction Pipeline
- Railway service: nrithyaholics-online-class (inside music-bot-server project)
- URL: https://nrithyaholics-online-class-production.up.railway.app
- Dockerfile build (NOT nixpacks) — libgl1, libglib2.0-0, ffmpeg
- MediaPipe 0.10.9, classic mp.solutions.pose API
- PNG frame sequence + ffmpeg H.264 encoding (browser-compatible)
- extract-pose edge function (fire-and-forget, avoid 150s timeout)
- get-skeleton-url edge function
- VERIFIED: skeleton overlay working on real human video

### Railway Environment Variables (all set)
POSE_SERVICE_SECRET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
R2_SECRET_ACCESS_KEY, R2_BUCKET=nrh-recordings,
SUPABASE_URL, SUPABASE_SERVICE_KEY

### Supabase Secrets (all set)
POSE_SERVICE_SECRET, POSE_SERVICE_URL

## Architecture Decisions Locked Today

### MVP Flow
1. Choreographer joins classroom alone, starts music, records 2-min
   reference performance, stops. Latest recording = reference automatically.
2. Student joins practice room (no new booking needed — confirmed booking
   = entitlement). Watches choreographer recording. Starts music. Records
   self dancing. Tagged as recorder_type = 'student'.
3. Admin clicks Score on student recording in RecordingsTab. System aligns
   both videos via audio fingerprinting (librosa), scores pose similarity
   (DTW + cosine), writes to dance_scores.
4. Admin sees side-by-side skeleton videos + score report.
5. Student sees score on ProfilePage. Simple number + timeline. No AI label.

### Key Decisions
- Latest choreographer recording for a session = auto-reference (no toggle needed)
- Confirmed booking = practice room entitlement (no new booking)
- recorder_type column distinguishes choreographer vs student recordings
- Audio fingerprinting (librosa chromagram cross-correlation) for alignment
- DTW for fine alignment within dance segment
- Score = 0.7 × form_score + 0.3 × timing_score
- Beat/rhythm layer deferred until form scoring is validated
- All AI terminology hidden from users

## DB Migration Needed (run at start of Session 2)
ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS recorder_type text DEFAULT 'choreographer',
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES bookings(id);

## Build Plan

### Session 2 — Practice Room
- PracticePage.jsx: #/practice/{session_id} route
- Left: choreographer recording playback (latest for session)
- Right: student live camera
- Music player (session music track)
- Start/Stop recording — tags recorder_type=student, links booking_id
- Solo only — no other participants
- ProfilePage: "Practice" button on completed past bookings

### Session 3 — Alignment + Scoring
- librosa added to pose-service requirements.txt
- /align endpoint: audio fingerprint cross-correlation → offset_ms
- /score-student extended: align first, score overlap only
- score-dance Supabase edge function
- Admin Score button in RecordingsTab

### Session 4 — Score Display
- Score report section in AdminPage
- Side-by-side skeleton modal (choreo vs student)
- ProfilePage ScoreCard: overall score + timeline graph
- Branch: ai-scoring (first user-facing changes)

## Deferred
- Multiple reference versions per session
- Student choosing which recording to submit
- Choreographer seeing student scores
- Public leaderboards
- Beat/rhythm scoring layer

## Key Learnings
- Railway had major build incident 07 Apr — Hobby tier paused for hours
- mediapipe <= 0.10.9 for classic mp.solutions.pose API
- cv2.VideoWriter broken headless — use PNG sequence + ffmpeg instead
- apt-get install libgl1 (not libgl1-mesa-glx) on Debian trixie
- Supabase edge function 150s timeout — pose extraction must be fire-and-forget
- railway logs --service nrithyaholics-online-class from repo root
