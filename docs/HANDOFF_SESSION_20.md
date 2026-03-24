# HANDOFF — Session 20
**Date:** 24-Mar-2026 | **Branch:** `music-bot` | **Status:** MP3 working end-to-end, YouTube blocked

---

## What was built across this branch (Phases 1–3)

### Phase 1 — Music bot infrastructure (Session 19)
- Edge functions: `get-token` (music fast-path), `start-music-bot`, `stop-music-bot`, `music-bot-control`
- Bot server (`music-bot-server/`): Express + Puppeteer on Railway
- Frontend: `MusicBotPage.jsx` (headless Puppeteer page), `App.jsx` early-exit for `#/music-bot`
- DB: 6 `music_*` columns on `sessions` table
- Supabase Storage: `music-tracks` bucket

### Phase 2 — Music setup UI in ChoreoPage (Session 19 / commit b6b126d)
- "🎵 Set up music" button on each upcoming session card
- Modal with YouTube URL input → oEmbed fetch (title + thumbnail preview)
- MP3 upload to Supabase Storage `music-tracks/{user_id}/{session_id}/track.mp3`
- Saves `music_track_url`, `music_track_type`, `music_track_title`, `music_track_thumb` to sessions DB
- Inline styles only, `.jsx` only

### Phase 3 — Floating music control overlay in ClassroomPage (commit b1f3ebf)
- Host-only floating panel (bottom-right): play/pause/resume, seek slider, volume slider, stop
- Collapsed pill mode when minimised
- Position polling every 2s when `musicBotStatus === 'playing'`
- Auto-stop on session end
- Leave button calls `handleStopMusic()` if bot is active

---

## Session 20 — Bugs hit and fixes applied

| # | Bug | Root cause | Fix | Commit |
|---|---|---|---|---|
| 1 | UI stuck on "⏳ Starting music..." forever | `handleStartMusic()` set `'starting'` but never transitioned to `'playing'` | Added `setMusicBotStatus('playing')` after receiving `bot_id` | `e17fab0` |
| 2 | `[MusicBot] Init failed: JSHandle@error` | `getDisplayMedia` throwing; error object not serialisable by Puppeteer console handler | Better logging: `err?.message \|\| String(err)` | `e17fab0` |
| 3 | `getDisplayMedia` throwing — cross-origin AudioContext approach used instead | Attempted `createMediaElementSource` on YouTube iframe's `<video>` across frame boundary — blocked by Web Audio CORS even with `--disable-web-security` | Reverted to `getDisplayMedia` (correct approach) | `d101adb` |
| 4 | `[MusicBot] Init failed: Could not start video source` | `getDisplayMedia({ video: { width:1, height:1 } })` — headless Chrome has no display to capture | Changed to `video: false` (audio-only getDisplayMedia works in headless) | `de053a0` |
| 5 | HMS SDK error logged as `JSHandle@object` | Puppeteer `console` handler only used `msg.text()` — object args come through as handles | Rewrote handler to `await arg.jsonValue()` for each arg | `52a6b94` |
| 6 | MP3 bot joins room but participants hear silence | `audio.play()` only triggered on explicit `botControl('play')` command; `AudioContext` still suspended at `addTrack` time; stream was live but empty | `audioCtx.resume()` + `audio.play()` now called before `addTrack` | `52a6b94` |
| 7 | Vercel branch preview URL serving stale build | Branch preview URL cached an older deployment; specific deployment URLs served correct build | Updated Railway `APP_URL` to point to specific deployment URL after each push | (env var, not code) |
| 8 | `invalid permission: display-capture` crashing `startBot()` | `overridePermissions(appUrl, ['microphone', 'display-capture'])` — Puppeteer doesn't support `display-capture` as a permission string | Removed `display-capture`; only `['microphone']` needed | `2504016` |
| 9 | `yt-dlp` blocked on Railway IPs | YouTube returns "Sign in to confirm you're not a bot" for all data-centre IPs | Replaced yt-dlp with YouTube IFrame Player in the browser | `5b137bc` |
| 10 | `ytdl-core` also blocked on Railway | Confirmed via `railway run node -e "require('ytdl-core')..."` → `FAILED: Could not extract functions` | Not used — confirmed Railway IPs blocked by YouTube | (test only, not committed) |

---

## Current state

### What works
- **MP3 path: end-to-end working**
  - Bot joins 100ms room as `Music` peer
  - `audio.play()` + `audioCtx.resume()` called before `addTrack` — live audio stream published
  - `botControl` exposed: play/pause/resume/seek/volume/status
  - ClassroomPage overlay transitions correctly: starting → playing → paused → stopped
  - Position polling updates seek slider every 2s

### What doesn't work
- **YouTube path: blocked on Railway IPs**
  - `getDisplayMedia({ audio: true, video: false })` is the correct call
  - `--use-fake-ui-for-media-stream` auto-approves, `--auto-select-tab-capture-source=NrithyaHolics` auto-selects tab
  - Not yet confirmed working — Railway hasn't served a YouTube test since `video: false` fix
  - ytdl-core confirmed blocked. yt-dlp also blocked. YouTube IFrame is the only viable playback approach.

### Active deployment
| Resource | Value |
|---|---|
| Vercel deployment (latest, commit `52a6b94`) | `https://nrithyaholics-online-class-l78tyrm2c-dejoy-mathais-projects.vercel.app` |
| Railway APP_URL (env var) | `https://nrithyaholics-online-class-l78tyrm2c-dejoy-mathais-projects.vercel.app` |
| Railway deployment ID | `1ccd6433-0d25-4eca-b67e-4e8d131d2768` |
| Railway service ID | `de46e1b6-1a21-46ab-bee6-bc7bf430ffb7` |
| Railway project ID | `b5cbee43-ca16-4756-ac70-4f8f18ad9c9e` |
| Supabase project | `vuxqimoqsbqsgvkashak` (Mumbai) |
| Branch | `music-bot` — **DO NOT merge to master until Phase 4 complete** |

---

## Known issues for Phase 4

### 1. YouTube audio capture unconfirmed on Railway
- `getDisplayMedia({ audio: true, video: false })` is deployed but not yet tested successfully
- If it fails, the fallback architecture would be: run a separate lightweight server outside Railway (e.g. a VPS or Fly.io) with a residential/non-datacenter IP, or use a YouTube audio proxy
- Alternative: accept YouTube is unsupported for now; MP3 upload covers the primary use case

### 2. HMS `addTrack` error (unread)
- `HMS-Store: received error from sdk` fires during `join` (before `addTrack`) — now readable via updated console handler
- Not yet confirmed if this causes audio publish failure; next Railway run will reveal the actual error text

### 3. No retry on bot failure
- If bot crashes after joining, `musicBotId` stays set and ClassroomPage thinks bot is alive
- No heartbeat / reconnect logic

### 4. `APP_URL` pinned to specific deployment
- Each new Vercel push requires manually updating `APP_URL` in Railway to the new deployment URL
- The branch preview URL lags (caches old build for several minutes); specific deployment URL is reliable
- Fix: switch to production URL (`online.nrithyaholics.in`) only after merge to master

---

## Phase 4 — Polish checklist (before merge)

- [ ] Confirm YouTube path working end-to-end on Railway (or decide to defer)
- [ ] Read actual HMS SDK error from logs (now readable) and fix if needed
- [ ] Error state in ClassroomPage overlay: show "⚠️ Bot failed" if `botError` set
- [ ] Retry button: if bot failed to start, allow re-triggering `handleStartMusic`
- [ ] Test on real class: host joins, starts MP3 bot, students hear music
- [ ] Confirm `stop-music-bot` cleans up correctly (bot `activeBots` map + DB status)
- [ ] Update `APP_URL` to `https://online.nrithyaholics.in` (production) before merge
- [ ] Update `CLAUDE.md` architecture section with music bot overview
- [ ] Merge `music-bot` → `master`

---

## Hard rule

**DO NOT merge `music-bot` to `master` until Phase 4 is tested on a real class.**
The overlay and bot code touch `ClassroomPage.jsx` which is used in every live session.
A broken merge would affect all students.

---

## Key files changed on this branch

| File | What changed |
|---|---|
| `frontend/src/pages/MusicBotPage.jsx` | New file — headless Puppeteer bot page |
| `frontend/src/pages/ChoreoPage.jsx` | Phase 2: music setup modal added |
| `frontend/src/pages/ClassroomPage.jsx` | Phase 3: floating music control overlay added |
| `frontend/src/App.jsx` | Early-exit for `#/music-bot` hash before auth |
| `frontend/package.json` | Added `@100mslive/hms-video-store` |
| `frontend/.npmrc` | `legacy-peer-deps=true` for Vercel build |
| `music-bot-server/index.js` | Express server: `/start`, `/stop`, `/control`, `/health` |
| `music-bot-server/bot.js` | Puppeteer orchestration; readable error logging |
| `music-bot-server/Dockerfile` | `node:20-slim` + Chrome + Puppeteer |
| `supabase/functions/start-music-bot/` | New edge function |
| `supabase/functions/stop-music-bot/` | New edge function |
| `supabase/functions/music-bot-control/` | New edge function |
| `supabase/functions/get-token/` | Updated: `is_music_bot` fast path |
