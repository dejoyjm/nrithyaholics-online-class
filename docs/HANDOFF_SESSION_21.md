# HANDOFF — Session 21 (Final)
**Date:** 24-Mar-2026 | **Branch:** `master` (merged from `music-bot`) | **Status:** Music bot sprint complete — merged to production

---

## Music bot sprint summary (Sessions 19–21)

The `music-bot` branch is **merged to master** as of this session. All Phases 1–4 are complete. Railway `APP_URL` is set to `https://online.nrithyaholics.in`.

---

## What was built (Phases 1–4)

### Phase 1 — Infrastructure (Session 19)

| Component | What was built |
|---|---|
| `supabase/functions/get-token/` | Updated: `is_music_bot` fast-path, 6-hour JWT, `music` role, no time-gate |
| `supabase/functions/start-music-bot/` | New: calls Railway `/start`, stores `music_bot_id` + `music_bot_status` in DB |
| `supabase/functions/stop-music-bot/` | New: calls Railway `/stop`, clears bot fields in DB |
| `supabase/functions/music-bot-control/` | New: proxies play/pause/resume/seek/volume/status to Railway bot |
| `music-bot-server/index.js` | Express server on Railway: `/start`, `/stop`, `/control`, `/health` |
| `music-bot-server/bot.js` | Puppeteer orchestration: launch Chrome, navigate to MusicBotPage, wait for botReady, wire controls |
| `music-bot-server/Dockerfile` | `node:20-slim` + Chrome + Puppeteer |
| `frontend/src/pages/MusicBotPage.jsx` | Headless page opened by bot: AudioContext pipeline (MP3) + YouTube IFrame + getDisplayMedia |
| `frontend/src/App.jsx` | Early-exit for `#/music-bot` hash — skips auth, renders MusicBotPage immediately |
| `frontend/package.json` | Added `@100mslive/hms-video-store` |
| `frontend/.npmrc` | `legacy-peer-deps=true` for Vercel |
| DB | 6 `music_*` columns on `sessions`: `music_track_url`, `music_track_type`, `music_track_title`, `music_track_thumb`, `music_bot_id`, `music_bot_status` |
| Supabase Storage | `music-tracks` bucket; path `{user_id}/{session_id}/track.mp3` |

### Phase 2 — Music setup UI in ChoreoPage (Session 19)

- "🎵 Set up music" button on each upcoming session card
- Modal: MP3 upload to Supabase Storage + YouTube URL (oEmbed preview)
- Saves `music_track_url`, `music_track_type`, `music_track_title`, `music_track_thumb` to sessions row

### Phase 3 — Floating music control overlay in ClassroomPage (Session 19)

- Host-only floating panel (bottom-right): play/pause/resume, seek slider, volume slider, stop
- Collapsed pill mode when minimised
- Position polling every 2s when `musicBotStatus === 'playing'`
- Auto-stop on session end; leave button calls `handleStopMusic()` if bot is active

### Phase 4 — Polish (Session 21)

| Task | Commit |
|---|---|
| Disable YouTube input in MusicSetupModal — "coming soon" notice | `4e3dda1` |
| Draggable overlay + collapsed pill with tap-to-expand | `0bd10e2` |
| Skip buttons: ±15s and ±30s in expanded transport row | `0bd10e2` |
| puppeteer-extra + stealth plugin; realistic Linux user agent | `54ca6f2` |
| APP_URL production comment in bot.js | `54ca6f2` |
| Merge `music-bot` → `master` | this session |

---

## All bugs fixed across the sprint

| # | Bug | Root cause | Fix | Commit |
|---|---|---|---|---|
| 1 | UI stuck on "⏳ Starting music..." forever | `handleStartMusic()` set `'starting'` but never transitioned to `'playing'` | Added `setMusicBotStatus('playing')` after receiving `bot_id` | `e17fab0` |
| 2 | `[MusicBot] Init failed: JSHandle@error` | Error object not serialisable by Puppeteer `msg.text()` | Catch logs `err?.message \|\| String(err)` | `e17fab0` |
| 3 | Cross-origin AudioContext on YouTube iframe | `createMediaElementSource` on iframe `<video>` blocked by Web Audio CORS | Reverted to `getDisplayMedia` | `d101adb` |
| 4 | `Init failed: Could not start video source` | `getDisplayMedia({ video: { width:1, height:1 } })` — headless Chrome has no display | Changed to `video: false` | `de053a0` |
| 5 | HMS SDK errors logged as `JSHandle@object` | Puppeteer `msg.text()` can't stringify Error args | Rewrote handler: `await arg.jsonValue().catch(() => arg.toString())` per arg | `52a6b94` |
| 6 | MP3 bot joins but participants hear silence | `AudioContext` suspended + `audio.play()` not called before `addTrack` | `await audioCtx.resume()` + `await audio.play()` before `addTrack` | `52a6b94` |
| 7 | Vercel branch preview serving stale build | Branch preview URL caches old deployment for several minutes | Pin Railway `APP_URL` to specific deployment URL after each push | (env var) |
| 8 | `invalid permission: display-capture` crashing startBot | Puppeteer `overridePermissions` doesn't support `'display-capture'` string | Removed from permissions list; only `['microphone']` needed | `2504016` |
| 9 | `yt-dlp` blocked on Railway IPs | YouTube returns "Sign in to confirm you're not a bot" for all data-centre IPs | Replaced with YouTube IFrame Player in browser | `5b137bc` |
| 10 | `ytdl-core` also blocked on Railway | Confirmed via `railway run node -e "require('ytdl-core')..."` → `FAILED` | Not used; Railway IPs blocked by YouTube | (test only) |
| 11 | `botReady` 45s timeout | `window.botReady = true` was set after full async init (too late) | Moved to top of `init()` before any async work | `5b137bc` |
| 12 | `waitUntil: 'networkidle0'` hanging | YouTube pages never reach networkidle0 | Changed to `'load'` | `5b137bc` |

---

## Architecture: how the music bot works

```
ClassroomPage (host)
  └─ handleStartMusic()
       └─ calls start-music-bot edge fn
            └─ POST https://music-bot-server.railway.app/start
                 └─ bot.js: launches Puppeteer Chrome
                      └─ navigates to https://online.nrithyaholics.in#/music-bot?...params
                           └─ MusicBotPage.jsx runs init():
                                ├─ MP3 path: Audio element → AudioContext.createMediaElementSource
                                │            → MediaStreamDestination → getAudioTracks()[0]
                                │            → hmsActions.addTrack (publishes to 100ms room)
                                └─ YouTube path: YT IFrame Player + getDisplayMedia({ audio:true, video:false })
                                                 → tab audio stream → hmsActions.addTrack

Controls (play/pause/resume/seek/volume):
  ClassroomPage → music-bot-control edge fn → Railway /control → bot.js → window.botControl(cmd)
```

**Key invariants:**
- `window.botReady = true` set at top of `init()` — bot.js waits on this before sending controls
- `audioCtx.resume()` + `audio.play()` MUST be called before `addTrack` or stream is silence
- `video: false` is required in headless Chrome (no display to capture)
- `['microphone']` is the only permission that works in Puppeteer's `overridePermissions`
- Stealth plugin patches `navigator.webdriver` and HeadlessChrome strings to reduce YouTube bot detection

---

## Current state

### What works (confirmed)
- **MP3 path: end-to-end working**
  - Bot joins 100ms room as `Music` peer
  - Live audio stream published; classroomPage overlay transitions correctly
  - Play/pause/resume/seek/volume/stop all functional
  - Position polling updates seek slider every 2s

### What is unconfirmed
- **YouTube path: unconfirmed on Railway**
  - `getDisplayMedia({ audio: true, video: false })` + stealth plugin deployed
  - `--auto-select-tab-capture-source=NrithyaHolics` was removed (was a bot signal); if `getDisplayMedia` fails without it, add it back — it is not mutually exclusive with stealth plugin
  - If Railway IPs are still bot-detected by YouTube, options: defer YouTube entirely (MP3 covers primary use case) or move bot server to non-datacenter IP (Fly.io, VPS)
  - YouTube input is disabled in UI with "coming soon" notice — safe to ship

---

## Active deployment

| Resource | Value |
|---|---|
| Frontend (Vercel) | `https://online.nrithyaholics.in` |
| Railway APP_URL | `https://online.nrithyaholics.in` |
| Railway service ID | `de46e1b6-1a21-46ab-bee6-bc7bf430ffb7` |
| Railway project ID | `b5cbee43-ca16-4756-ac70-4f8f18ad9c9e` |
| Supabase project | `vuxqimoqsbqsgvkashak` (Mumbai) |
| Branch | `master` (music-bot merged) |

---

## Known limitations and future work

### 1. YouTube audio unconfirmed on Railway
- See above. MP3 is the primary path and works end-to-end.

### 2. No retry on bot failure
- If bot crashes after joining, `musicBotId` stays set and ClassroomPage thinks bot is alive
- No heartbeat / reconnect logic
- Workaround: host clicks Stop, then Play again

### 3. No error state in overlay
- If `start-music-bot` returns an error, the overlay doesn't show a failure message
- `musicBotStatus` just stays `null` (overlay hidden)

### 4. APP_URL hardcoded fallback in bot.js
- `process.env.APP_URL || 'https://online.nrithyaholics.in'` — correct default now that we're on master
- If ever deploying a staging branch, remember to update the Railway env var

---

## Key files

| File | What changed |
|---|---|
| `frontend/src/pages/MusicBotPage.jsx` | New — headless Puppeteer bot page |
| `frontend/src/pages/ClassroomPage.jsx` | Phase 3+4: floating music control overlay, drag, skip buttons |
| `frontend/src/pages/ChoreoPage.jsx` | Phase 2+4: music setup modal; YouTube input disabled |
| `frontend/src/App.jsx` | Early-exit for `#/music-bot` hash |
| `frontend/package.json` | Added `@100mslive/hms-video-store` |
| `frontend/.npmrc` | `legacy-peer-deps=true` |
| `music-bot-server/index.js` | Express server: `/start`, `/stop`, `/control`, `/health` |
| `music-bot-server/bot.js` | Puppeteer orchestration + stealth plugin |
| `music-bot-server/Dockerfile` | `node:20-slim` + Chrome + Puppeteer |
| `supabase/functions/start-music-bot/` | New edge function |
| `supabase/functions/stop-music-bot/` | New edge function |
| `supabase/functions/music-bot-control/` | New edge function |
| `supabase/functions/get-token/` | Updated: `is_music_bot` fast path |

---

## Commits this sprint (music-bot branch)

| Commit | Description |
|---|---|
| `e17fab0` | fix: ClassroomPage state transition starting→playing; better bot error logging |
| `d101adb` | fix: revert to getDisplayMedia (cross-origin AudioContext blocked by CORS) |
| `de053a0` | fix: getDisplayMedia video:false — headless Chrome has no display |
| `52a6b94` | fix: HMS error logging readable; MP3 audioCtx.resume + audio.play before addTrack |
| `2504016` | fix: remove display-capture from overridePermissions |
| `5b137bc` | feat: YouTube IFrame Player; botReady at top of init; waitUntil load |
| `4e3dda1` | feat: disable YouTube input — coming soon notice |
| `0bd10e2` | feat: draggable overlay + skip buttons ±15s/±30s + collapsed pill |
| `54ca6f2` | feat: stealth plugin; realistic user agent; APP_URL merge note |
