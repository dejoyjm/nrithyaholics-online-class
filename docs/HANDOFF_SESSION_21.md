# HANDOFF — Session 21 (Final)
**Date:** 24-Mar-2026 | **Branch:** `master` | **Status:** Music bot sprint complete — MP3 fully working, YouTube deferred

---

## Music bot sprint summary (Sessions 19–21)

The `music-bot` branch is merged to master. MP3 audio is end-to-end working in production. YouTube was tested thoroughly and is deferred — Railway has no virtual audio hardware, making `getDisplayMedia` unavailable regardless of stealth plugin.

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
- Modal: MP3 upload to Supabase Storage + YouTube URL input (oEmbed preview) — YouTube input currently disabled
- Saves `music_track_url`, `music_track_type`, `music_track_title`, `music_track_thumb` to sessions row

### Phase 3 — Floating music control overlay in ClassroomPage (Session 19)

- Host-only floating panel: play/pause/resume, seek slider, volume slider, stop
- Collapsed pill mode when minimised — tap to expand
- Position polling every 2s when `musicBotStatus === 'playing'`
- Auto-stop on session end; leave button calls `handleStopMusic()` if bot is active

### Phase 4 — Polish + YouTube investigation (Sessions 20–21)

| Task | Result | Commit |
|---|---|---|
| Draggable overlay + collapsed pill with tap-to-expand | Done | `0bd10e2` |
| Skip buttons: ±15s and ±30s in expanded transport row | Done | `0bd10e2` |
| puppeteer-extra + stealth plugin; realistic Linux user agent | Done | `54ca6f2` |
| Disable YouTube in MusicSetupModal — "coming soon" notice | Done | `4e3dda1` |
| Suppress HMS DeviceNotAvailable (3002) from Railway logs | Done | `58fd6c8` |
| YouTube stealth test — temporarily re-enabled for testing | Reverted | `c6e8e93` → reverted |
| YouTube end-to-end test on Railway | **Failed** — no virtual audio hardware | see below |
| YouTube re-disabled | Done | this session |

---

## All bugs fixed across the sprint

| # | Bug | Root cause | Fix | Commit |
|---|---|---|---|---|
| 1 | UI stuck on "⏳ Starting music..." forever | `handleStartMusic()` never transitioned to `'playing'` | `setMusicBotStatus('playing')` after receiving `bot_id` | `e17fab0` |
| 2 | `Init failed: JSHandle@error` | Error object not serialisable by Puppeteer `msg.text()` | `err?.message \|\| String(err)` in catch | `e17fab0` |
| 3 | Cross-origin AudioContext on YouTube iframe | `createMediaElementSource` on iframe `<video>` blocked by Web Audio CORS | Reverted to `getDisplayMedia` | `d101adb` |
| 4 | `Init failed: Could not start video source` | `getDisplayMedia({ video: { width:1, height:1 } })` — headless has no display | Changed to `video: false` | `de053a0` |
| 5 | HMS SDK errors logged as `JSHandle@object` | Puppeteer `msg.text()` can't stringify Error args | `await arg.jsonValue().catch(() => arg.toString())` per arg | `52a6b94` |
| 6 | MP3 bot joins but participants hear silence | `AudioContext` suspended + `audio.play()` not called before `addTrack` | `await audioCtx.resume()` + `await audio.play()` before `addTrack` | `52a6b94` |
| 7 | Vercel branch preview serving stale build | Branch preview URL caches old deployment for several minutes | Pin Railway `APP_URL` to specific deployment URL after each push | (env var) |
| 8 | `invalid permission: display-capture` crashing startBot | Puppeteer `overridePermissions` doesn't support `'display-capture'` | Removed; only `['microphone']` needed | `2504016` |
| 9 | `yt-dlp` blocked on Railway IPs | YouTube returns "Sign in to confirm you're not a bot" for data-centre IPs | Replaced with YouTube IFrame Player in browser | `5b137bc` |
| 10 | `ytdl-core` also blocked on Railway | Confirmed via `railway run` | Not used | (test only) |
| 11 | `botReady` 45s timeout | `window.botReady = true` set after full async init | Moved to top of `init()` before async work | `5b137bc` |
| 12 | `waitUntil: 'networkidle0'` hanging | YouTube pages never reach networkidle0 | Changed to `'load'` | `5b137bc` |
| 13 | HMS DeviceNotAvailable (3002) polluting Railway logs | HMS SDK logs to `console.error` on every bot join (no real mic) | Intercept `console.error` in MusicBotPage; suppress code 3002 non-terminal | `58fd6c8` |
| 14 | YouTube `getDisplayMedia` "Requested device not found" | Railway containers have no virtual audio hardware — `getDisplayMedia` fails regardless of Chrome flags | Root cause confirmed; YouTube deferred | (no fix — infrastructure limitation) |

---

## Architecture: how the MP3 music bot works

```
ClassroomPage (host)
  └─ handleStartMusic()
       └─ calls start-music-bot edge fn
            └─ POST https://music-bot-server.railway.app/start
                 └─ bot.js: launches Puppeteer Chrome (stealth plugin)
                      └─ navigates to https://online.nrithyaholics.in/?...#/music-bot
                           └─ MusicBotPage.jsx init():
                                └─ MP3 path:
                                     Audio element → AudioContext.createMediaElementSource
                                     → MediaStreamDestination → getAudioTracks()[0]
                                     → audioCtx.resume() + audio.play()  ← must be before addTrack
                                     → hmsActions.addTrack(customAudioTrack, 'audio')
                                     → publishes live audio stream to 100ms room

Controls (play/pause/resume/seek/volume):
  ClassroomPage → music-bot-control edge fn → Railway /control → bot.js → window.botControl(cmd)

Stop:
  ClassroomPage → stop-music-bot edge fn → Railway /stop → browser.close() + activeBots.delete()
```

**Key invariants:**
- `window.botReady = true` set at top of `init()` — bot.js waits on this before sending controls
- `audioCtx.resume()` + `audio.play()` MUST be called before `addTrack` or stream is silence
- `['microphone']` is the only permission that works in Puppeteer's `overridePermissions`
- HMS DeviceNotAvailable (code 3002, isTerminal: false) fires on every join — suppressed in MusicBotPage
- Stealth plugin patches `navigator.webdriver` and HeadlessChrome strings

---

## YouTube — why it doesn't work on Railway

YouTube audio via `getDisplayMedia` requires the OS to have a virtual audio capture device (e.g. a loopback device like PulseAudio or a virtual sink). Railway containers run a minimal Linux environment with no audio hardware and no virtual audio subsystem.

**What was confirmed working:** YouTube IFrame Player loads and plays fine (stealth plugin bypasses bot detection). The failure is specifically at `getDisplayMedia({ audio: true, video: false })` — it throws "Requested device not found" because there is no audio capture device available.

**`--use-fake-ui-for-media-stream`** only auto-approves the permission dialog; it does not create a fake audio device for capture. **`--auto-select-tab-capture-source=NrithyaHolics`** selects the tab to capture, but capture still fails if there is no audio device.

**Infrastructure solutions to enable YouTube (future):**
1. Add PulseAudio virtual sink to the Dockerfile (`pulseaudio --start`, `pactl load-module module-virtual-sink`)
2. Move bot server to a provider that supports audio hardware (or use a VPS with ALSA/PulseAudio)
3. Use a YouTube audio proxy service that fetches audio server-side (no browser needed)

**For now:** YouTube input is disabled in MusicSetupModal with "coming soon" notice. MP3 upload covers the primary use case.

---

## Current state

### What works (production)
- **MP3 path: end-to-end working**
  - Bot joins 100ms room as `Music` peer
  - Live audio stream published; ClassroomPage overlay transitions correctly
  - Play/pause/resume/seek/volume/stop all functional
  - Position polling updates seek slider every 2s
  - HMS DeviceNotAvailable noise suppressed from Railway logs

### What is deferred
- **YouTube path: infrastructure limitation on Railway**
  - YouTube IFrame loads (stealth plugin works)
  - `getDisplayMedia` fails — no virtual audio device on Railway
  - UI disabled with "coming soon" notice
  - Fix requires Dockerfile changes or different cloud provider

---

## Active deployment

| Resource | Value |
|---|---|
| Frontend (Vercel) | `https://online.nrithyaholics.in` |
| Railway APP_URL | `https://online.nrithyaholics.in` |
| Railway service ID | `de46e1b6-1a21-46ab-bee6-bc7bf430ffb7` |
| Railway project ID | `b5cbee43-ca16-4756-ac70-4f8f18ad9c9e` |
| Supabase project | `vuxqimoqsbqsgvkashak` (Mumbai) |
| Branch | `master` |

---

## Known limitations and future work

### 1. YouTube audio (infrastructure blocker)
See above. Dockerfile solution: add PulseAudio virtual sink. Estimated effort: 1–2 hours to test and validate.

### 2. No retry on bot failure
If bot crashes after joining, `musicBotId` stays set and ClassroomPage thinks bot is alive. Workaround: host clicks Stop then Play again.

### 3. No error state in overlay
If `start-music-bot` returns an error, the overlay doesn't show a failure message — it just stays hidden. The host sees nothing, with no indication of what went wrong.

### 4. No heartbeat / reconnect
Bot has no liveness check. If Railway restarts the process, the bot disappears silently.

---

## Key files

| File | What changed |
|---|---|
| `frontend/src/pages/MusicBotPage.jsx` | New — headless Puppeteer bot page; DeviceNotAvailable suppression |
| `frontend/src/pages/ClassroomPage.jsx` | Phase 3+4: floating music overlay, drag, skip buttons |
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
