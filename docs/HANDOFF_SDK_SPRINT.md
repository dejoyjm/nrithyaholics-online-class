# HANDOFF — Custom SDK Classroom Sprint
**Date:** 21-Mar-2026 | **Status:** Pre-sprint planning
**Context:** 22-Mar first real class runs on Prebuilt. SDK sprint starts after.
**Branch:** `sdk-classroom` (never touches `master` until proven)

---

## 🎯 Why We're Building This

100ms Prebuilt iframe is a black box. We've hit its ceiling:

| Problem | Impact | Prebuilt fix? | SDK fix? |
|---------|--------|---------------|----------|
| Music audio killed by browser noise suppression | Every class broken | ❌ | ✅ Music bot |
| Screen share takes over main view | Choreographer disappears | ❌ | ✅ Layout control |
| Guests join with mic/camera ON | Chaos in large classes | ❌ | ✅ Join settings |
| No recording control from our UI | Can't pause/resume | ❌ | ✅ Beam recording API |
| Can't record learner performances | Missing feature | ❌ | ✅ Layout switch + record |
| No mirror mode | Choreographer disoriented | ❌ | ✅ CSS transform |
| Looks like every other 100ms app | No brand differentiation | ❌ | ✅ Full custom UI |

---

## 🏗️ Architecture

### Branch Strategy
```
master           ← production (Prebuilt always live, never broken)
sdk-classroom    ← SDK development (all SDK work here)
```

- SDK work on `sdk-classroom` branch only
- Platform fixes (bookings, emails, admin) on `master`
- Periodically merge `master` → `sdk-classroom` (keeps SDK branch current)
- When SDK is proven → single PR: `sdk-classroom` → `master`
- Feature flag added at merge time — Prebuilt stays as fallback forever

### File Structure
```
frontend/src/pages/
  ClassroomPage.jsx              ← NEVER TOUCH (Prebuilt, always works)
  SDKClassroom/
    index.jsx                    ← HMSRoomProvider, join logic, mode switch
    MainStage.jsx                ← choreographer always prominent
    StudentGrid.jsx              ← learner tiles, muted by default
    SelfView.jsx                 ← host's own camera, togglable
    Controls.jsx                 ← mic, camera, leave, recording, mirror
    MirrorToggle.jsx             ← CSS scaleX(-1) on self-view
    MusicPlayer.jsx              ← song selector + Web Audio API streaming
    MusicBot.jsx                 ← audio-only peer role
    RecordingBanner.jsx          ← persistent RECORDING PAUSED banner
    PerformanceMode.jsx          ← grid layout for all-learner recording
    TimerBanner.jsx              ← copy from ClassroomPage.jsx
```

### The Flip Switch (Admin Control)
```
Platform Settings → Classroom Mode
  ○ Prebuilt (100ms hosted UI)   ← global default
  ○ Custom SDK (NrithyaHolics UI)

Per-session override (Sessions tab → Actions):
  "Force Prebuilt" | "Force SDK"
```

**Rollback = one SQL update, no deploy, 30 seconds:**
```sql
-- Global rollback
UPDATE platform_config SET classroom_mode = 'prebuilt' WHERE id = 1;

-- Single session rollback
UPDATE sessions SET classroom_mode_override = 'prebuilt' WHERE id = 'SESSION_ID';
```

---

## 🗄️ DB Changes (run before sprint starts)

```sql
ALTER TABLE platform_config
  ADD COLUMN IF NOT EXISTS classroom_mode text DEFAULT 'prebuilt',
  ADD COLUMN IF NOT EXISTS sdk_music_bot_enabled bool DEFAULT false,
  ADD COLUMN IF NOT EXISTS sdk_mirror_mode_default bool DEFAULT true,
  ADD COLUMN IF NOT EXISTS sdk_recording_default bool DEFAULT true;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS classroom_mode_override text DEFAULT NULL;
-- NULL = use global | 'prebuilt' = force prebuilt | 'sdk' = force SDK
```

---

## 📋 Use Cases — Full Spec

### UC1 — All Guests Join Muted (Audio + Video OFF)

**Why:** In a 7-20 person dance class, everyone joining with mic on = chaos. Background noise, echo, random audio — all of it disrupts the class from second one.

**Behaviour:**
- Guests (learners) join with both audio AND video muted by default
- Soft banner on join: "Your mic and camera are off — turn on when ready"
- Guests can unmute themselves freely
- Host (choreographer) joins with audio ON, video ON
- Host can mute any peer centrally (100ms "Mute any Peer" permission already enabled in dashboard)

**Implementation:**
```jsx
await hmsActions.join({
  authToken: token,
  userName: userName,
  settings: {
    isAudioMuted: role === 'guest',
    isVideoMuted: role === 'guest',
  }
})
```

---

### UC2 — Host Layout: Class Grid ↔ Own View Toggle

**Why:** Choreographer has two conflicting needs:
1. See students — to check if they're following along
2. See themselves — to check their own form and full-body positioning

Neither Prebuilt mode serves both. SDK lets us build a toggle.

**Mode A — Class Grid (default on join):**
```
┌─────────────────────────────┐
│                             │
│   Choreographer (YOU)       │  ← main stage, large portrait tile
│   [full body, portrait]     │
│                             │
├────────┬────────┬───────────┤
│ Leya   │ Nimmy  │ Jisha     │  ← student strip, small tiles, bottom
└────────┴────────┴───────────┘
```

**Mode B — Self View (toggle with button):**
```
┌─────────────────────────────┐
│                             │
│   YOUR OWN CAMERA           │  ← full screen local tile, mirrored
│   [mirror mode ON]          │
│                             │
│                   ┌─────┐   │
│                   │grid │   │  ← small corner overlay, class still visible
│                   └─────┘   │
└─────────────────────────────┘
```

**Toggle button in Controls bar:** 📷 "See Yourself" ↔ 👥 "See Class"

**State:**
```jsx
const [viewMode, setViewMode] = useState('class') // 'class' | 'self'
```

---

### UC3 — Recording: Auto-Start, Pausable, Non-Dismissable Banner

**Why:** Forgetting to start recording is a painful operational failure. Students want to review. Recording is a future revenue stream (charge for replay access). Forgetting to RESUME after pausing is equally bad — hence the banner that cannot be dismissed.

**Behaviour:**
- Recording starts AUTOMATICALLY when host joins the room
- Indicator in top-right corner: 🔴 REC (small, unobtrusive)
- Host CAN pause recording (bathroom break, warm-up chat, anything off-record)
- When paused: **full-width amber banner, flashing, permanently visible:**

```
┌─────────────────────────────────────────────────────────┐
│  ⏸️  RECORDING IS PAUSED — Tap here to resume recording  │  ← amber, flashing
└─────────────────────────────────────────────────────────┘
```

- Banner CANNOT be dismissed — only disappears when recording resumes
- This is intentionally annoying — forgetting to resume = lost recording
- Host can resume → banner disappears, 🔴 REC returns
- Recording stops automatically when host ends the session

**Recording stored:** 100ms dashboard → Sessions → Recording URLs
**Future:** Auto-upload to Cloudflare R2, link to session DB record, sell replay access

**Implementation — new edge function `recording-control/index.ts`:**
```typescript
// Start recording (called when host joins)
POST /functions/v1/recording-control
Body: { session_id, action: 'start' | 'pause' | 'resume' | 'stop' }

// Uses 100ms Beam Recording API with management token
// Management token never exposed to frontend
```

**Frontend state:**
```jsx
const [recordingState, setRecordingState] = useState('idle')
// 'idle' | 'recording' | 'paused' | 'stopped'

// Auto-start on host join:
useEffect(() => {
  if (isHost && status === 'joined') {
    startRecording()
  }
}, [status])
```

**RecordingBanner.jsx — rendered at top of SDKClassroom when state === 'paused':**
```jsx
// Full width, amber, flashing, non-dismissable
// onClick → resumeRecording()
// Cannot be hidden — z-index above everything except TimerBanner
```

---

### UC4 — Performance Recording Mode (Capture All Learners)

**Why:** End of class moment — choreographer asks everyone to do the full routine together. This is the emotional peak of every class. Everyone wants to see themselves. Need to capture all learners in one frame.

**Behaviour:**
- Host taps "🎬 Performance Mode" button in Controls
- Countdown overlay: "Get ready! Recording in 3... 2... 1... 🎬"
- Layout switches to full equal-tile GRID (all participants, no one prominent)
- Performance recording starts (separate from main class recording)
- "⏹ Stop Performance" button ends performance recording
- Layout returns to normal class view
- Performance clip saved separately

**Performance layout:**
```
┌──────────┬──────────┬──────────┐
│ Choreo   │ Leya     │ Nimmy    │
│          │          │          │
├──────────┼──────────┼──────────┤
│ Jisha    │ Diya     │ Smitha   │
│          │          │          │
└──────────┴──────────┴──────────┘
  All tiles equal size, everyone visible
```

**Critical timing detail:** 100ms Beam Recording captures what's on screen in the recording browser. Layout MUST switch to grid BEFORE recording starts. Hence the 3-second countdown — layout switches at "3", recording starts at "0".

**State:**
```jsx
const [performanceMode, setPerformanceMode] = useState(false)
const [performanceCountdown, setPerformanceCountdown] = useState(null)

async function startPerformanceMode() {
  // Start countdown
  for (let i = 3; i > 0; i--) {
    setPerformanceCountdown(i)
    await sleep(1000)
  }
  setPerformanceCountdown(null)
  setPerformanceMode(true)  // switches to grid layout
  await sleep(500)          // ensure layout rendered
  await startPerformanceRecording(roomId)
}
```

---

## 🎵 Music Bot — Full Spec

**The problem:** Browser WebRTC audio processing (echo cancellation + noise suppression) kills music played through speakers. Cannot be disabled on mobile Safari. No fix possible within Prebuilt.

**The solution:** A second device joins the room as an audio-only `music` role. It injects music directly into the 100ms stream via Web Audio API — bypasses the mic entirely, bypasses all browser audio processing.

**Setup for choreographer:**
1. Open NrithyaHolics class on **mobile** (HOST, camera + voice)
2. Open NrithyaHolics on **any laptop/tablet** → tap "🎵 Start Music Bot"
3. Music bot page joins the same room
4. Pick song → play → students hear perfect music

**Music bot page UI:**
```
┌─────────────────────────────────┐
│  🎵 NrithyaHolics Music Bot     │
│  Session: 90s Bollywood - Bumro │
├─────────────────────────────────┤
│  Paste YouTube URL or upload:   │
│  [https://youtube.com/...    ]  │
│                                 │
│  ♫ Now: Bumbro - Mission Kashmir│
│  ████████████░░░░░░  1:23/5:09  │
│                                 │
│  [⏮]  [⏯ PLAYING]  [⏭]        │
│  Vol: ██████████░░  80%         │
│                                 │
│  🔴 LIVE — Streaming to room    │
│  Students can hear this music   │
└─────────────────────────────────┘
```

**Audio injection (Web Audio API):**
```jsx
const audioCtx = new AudioContext()
const source = audioCtx.createMediaElementSource(audioElement)
const destination = audioCtx.createMediaStreamDestination()
source.connect(destination)
source.connect(audioCtx.destination) // also play locally so choreo hears

const audioTrack = destination.stream.getAudioTracks()[0]
await hmsActions.addTrack(audioTrack, 'audio')
```

**iOS Safari note:** AudioContext requires user gesture. Music bot page must show a "Tap to Start" screen before playing. Fine — choreographer actively starts it.

**100ms dashboard — add `music` role:**
- Publish: audio ✅, video ❌, screen share ❌
- Subscribe: host ✅, guest ✅
- Permissions: none
- Multi-device check: exempt in `get-token`

**`get-token` addition:**
```typescript
const isMusicBot = body.is_music_bot === true
const hmsRole = isMusicBot ? 'music'
  : (isChoreo || isAdmin) ? 'host'
  : 'guest'

if (isMusicBot) {
  // Verify requester is the session's choreographer or admin
  if (session.choreographer_id !== user.id && !isAdmin) {
    return 403 'Not authorised to start music bot'
  }
  // Skip: booking check, device check, time gates
  // Issue music role token immediately
}
```

---

## 📅 Sprint Phases

### Week 1 — Foundation
**Goal:** Basic SDK room join working on sdk-classroom branch.

Tasks:
- `npm install @100mslive/react-sdk`
- `HMSRoomProvider` wrapping `SDKClassroom/index.jsx`
- Join room using existing `get-token` response (no backend changes needed)
- Render all peer video tiles
- UC1: Guests join with audio + video muted ✅
- Leave / end session working
- TimerBanner copied from ClassroomPage

Success: Admin joins draft session, sees video grid, timer works, leaves cleanly.

### Week 2 — Layout + Host UX
**Goal:** Dance-class-optimised layout. Choreographer prominent always.

Tasks:
- UC2: Class grid ↔ self view toggle
- Choreographer tile always MainStage (large, portrait)
- Students in bottom grid strip
- Screen share as corner PiP (never overrides main view)
- Mirror toggle on self-view
- Mobile-responsive (portrait priority)

Success: Nayana joins mobile as host, Jisha joins as guest — Nayana full body on Jisha's screen, Jisha in strip. Nayana can see herself full screen on demand.

### Week 3 — Recording
**Goal:** Recording is automatic, pausable, unforgettable.

Tasks:
- UC3: Auto-start beam recording on host join
- `recording-control` edge function (start/pause/resume/stop)
- Non-dismissable amber banner when paused
- UC4: Performance mode layout + separate recording
- 3-second countdown, grid layout switch, performance clip

Success: Full recording flow tested. Pause 3 times — banner always visible. Performance mode captures all tiles in grid.

### Week 4 — Music Bot
**Goal:** Clean music from second device, choreographer portrait stays main view.

Tasks:
- Add `music` role in 100ms dashboard
- Build `MusicPlayer.jsx` + Web Audio API injection
- `get-token` music role support (is_music_bot flag)
- "Start Music" button in choreographer Controls
- Music bot page route

Success: Nayana phone (host) + music bot laptop → students hear clean music AND see Nayana full body portrait.

### Week 5 — Flip Switch + Production Rollout
**Goal:** SDK in production, Prebuilt as instant fallback.

Tasks:
- Run DB migration (classroom_mode columns)
- Admin Settings tab: global classroom_mode toggle
- Sessions tab: per-session override (Force Prebuilt / Force SDK)
- Merge `sdk-classroom` → `master`
- Deploy (classroom_mode = 'prebuilt' — no change to prod)
- Test ONE real session with classroom_mode_override = 'sdk'
- Monitor 3 sessions
- Flip classroom_mode = 'sdk' globally

---

## ⚠️ Technical Gotchas

**Why Session 7 failed:**
Used UMD bundle via CDN script tag with Vite — incompatible module system.
**Fix:** `npm install @100mslive/react-sdk` (ESM, fully Vite-compatible) ✅
Never use CDN/UMD approach again.

**Beam recording requires management token:**
100ms recording API is server-side only. Build `recording-control` edge function.
Management token never sent to frontend.

**Web Audio API + iOS Safari:**
Requires user gesture before AudioContext can start. Music bot needs "Tap to Begin" screen. Fine for this use case.

**Performance mode timing:**
Beam recording bot visits the meeting URL and records what it sees.
Layout must switch to grid BEFORE recording starts.
3-second countdown solves this — layout at "3", recording at "0".

**get-token is already SDK-compatible:**
Returns `token`, `room_id`, `role`, `user_name`, `session_ends_at`, `token_expires_at`.
No backend changes needed until Week 4 (music role).

---

## ✅ Definition of Done

SDK replaces Prebuilt globally only when ALL pass:

- [ ] Guests join muted (audio + video), can unmute themselves
- [ ] Choreographer always main view regardless of screen share
- [ ] Host class grid ↔ self view toggle works
- [ ] Recording auto-starts when host joins
- [ ] Paused recording shows non-dismissable amber banner
- [ ] Performance mode: grid layout + separate recording
- [ ] Music bot streams clean audio, no noise suppression
- [ ] Choreographer phone portrait = main view for all students
- [ ] Leave / end session clean
- [ ] Timer banner counts down correctly
- [ ] Admin global flip switch works
- [ ] Admin per-session override works
- [ ] Rollback tested: SDK → Prebuilt in under 30 seconds
- [ ] Tested with real students on 3+ sessions without incident

**Do not flip globally until all 14 boxes are checked.**

---

## 🚀 How to Start

**Step 1 — DB migration (Supabase SQL Editor):**
```sql
ALTER TABLE platform_config
  ADD COLUMN IF NOT EXISTS classroom_mode text DEFAULT 'prebuilt',
  ADD COLUMN IF NOT EXISTS sdk_music_bot_enabled bool DEFAULT false,
  ADD COLUMN IF NOT EXISTS sdk_mirror_mode_default bool DEFAULT true,
  ADD COLUMN IF NOT EXISTS sdk_recording_default bool DEFAULT true;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS classroom_mode_override text DEFAULT NULL;
```

**Step 2 — Create branch + install SDK:**
```bash
git checkout -b sdk-classroom
cd frontend
npm install @100mslive/react-sdk
```

**Step 3 — First Claude Code message:**
```
Read HANDOFF_SDK_SPRINT.md in full before starting.

We are building a custom 100ms SDK classroom on the sdk-classroom branch.

Hard rules:
- ClassroomPage.jsx must NEVER be modified
- All SDK code in frontend/src/pages/SDKClassroom/
- Use @100mslive/react-sdk npm package (NOT CDN, NOT UMD)
- Inline styles only — no CSS files, no Tailwind
- get-token edge function already returns the token we need, no backend changes yet

Start Week 1 only:
1. Create frontend/src/pages/SDKClassroom/index.jsx
2. Set up HMSRoomProvider wrapper
3. Join room using token from get-token response
4. Render all peer video tiles in a simple grid
5. Guests: isAudioMuted true, isVideoMuted true on join
6. Leave button that calls hmsActions.leave()
7. Copy TimerBanner logic from ClassroomPage.jsx

Do NOT build the flip switch yet (Week 5).
Do NOT touch ClassroomPage.jsx.
Do NOT start music bot or recording yet.
```

---

## 🔑 Credentials

```
Supabase:           vuxqimoqsbqsgvkashak (Mumbai)
Supabase Anon Key:  sb_publishable_uIUbVLySwkY4SQXjObq4Rw_UM41h1Lo
100ms Template:     dejoy-videoconf-406
100ms Access Key:   69aca7a963cbbe924eef8f70
100ms Template ID:  69aca87c6236da36a7d8c593
App URL:            https://online.nrithyaholics.in
Repo:               dejoyjm/nrithyaholics-online-class
Production branch:  master
SDK branch:         sdk-classroom
Resend from:        bookings@nrithyaholics.in
```

---

**The Prebuilt runs tomorrow. The SDK runs before Nayana's second class.**
**Good luck. 🎯**