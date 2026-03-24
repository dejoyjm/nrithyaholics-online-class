# HANDOFF — Session 21 (Final)
**Date:** 24-Mar-2026 | **Branch:** `master` | **Status:** MP3 music bot production-ready ✅ — YouTube deferred

---

## Summary

The music bot sprint is complete for the MP3 path. `master` is production-ready. YouTube audio capture is blocked by two separate infrastructure limitations and is deferred to a future sprint.

---

## What works in production (MP3 path)

- Choreographer sets up music in ChoreoPage → uploads MP3 to Supabase Storage
- Host joins classroom → starts music bot from floating overlay
- Railway bot server launches headless Chrome, navigates to `MusicBotPage.jsx`
- Bot joins 100ms room as `Music` peer, publishes MP3 audio via AudioContext pipeline
- Students hear music live in the classroom
- Host controls: play / pause / resume / seek (±15s, ±30s) / volume / stop
- Overlay is draggable; collapses to pill; auto-stops on session end

---

## What is deferred (YouTube path)

Two separate blockers were confirmed through testing:

### Blocker 1 — Railway IPs flagged by YouTube
`yt-dlp` and `ytdl-core` both return "Sign in to confirm you're not a bot" from Railway's data-centre IPs. Confirmed via `railway run node -e "require('ytdl-core')..."` → `FAILED: Could not extract functions`.

The YouTube IFrame Player loads fine (stealth plugin helps), but server-side YouTube audio download is impossible from Railway IPs.

### Blocker 2 — `getDisplayMedia` has no audio device on Railway
Railway containers have no virtual audio hardware. `getDisplayMedia({ audio: true, video: false })` throws "Requested device not found" regardless of Chrome flags.

Pulseaudio was attempted:
- System mode (`--system`) — socket restricted to `pulse-access` group; root not in it
- User mode with `PULSE_DAEMON_NO_ROOT_CHECK=1` — pulseaudio started, VirtualSink loaded (confirmed via module index `17` in logs), but `getDisplayMedia` still fails because Chrome requires a real capture device, not just a sink

### Research directions for YouTube (future sprint)

| Approach | Notes |
|---|---|
| **(a) Residential IP proxy** | Route bot through a proxy with non-datacenter IP. yt-dlp/ytdl-core would work from residential IPs. Adds latency and cost. |
| **(b) Different cloud provider** | Fly.io, Render, or a VPS with ALSA/PulseAudio properly wired. Some providers support audio hardware passthrough. |
| **(c) Client-side extraction** | cobalt.tools (open source) extracts YouTube audio in-browser without server-side download. Could use a self-hosted instance. |
| **(d) Virtual audio loopback via ALSA** | `snd_aloop` kernel module creates a real loopback device that Chrome's `getDisplayMedia` can capture. Requires privileged container or custom base image. |

For now: YouTube input in MusicSetupModal is disabled with a helper link to [cobalt.tools](https://cobalt.tools) for manual MP3 download.

---

## All bugs fixed across the sprint

| # | Bug | Fix | Commit |
|---|---|---|---|
| 1 | UI stuck on "⏳ Starting music..." | `setMusicBotStatus('playing')` after receiving `bot_id` | `e17fab0` |
| 2 | `Init failed: JSHandle@error` | `err?.message \|\| String(err)` in catch | `e17fab0` |
| 3 | Cross-origin AudioContext on YouTube iframe | Reverted to `getDisplayMedia` | `d101adb` |
| 4 | `Init failed: Could not start video source` | `getDisplayMedia({ video: false })` | `de053a0` |
| 5 | HMS SDK errors logged as `JSHandle@object` | `await arg.jsonValue().catch(...)` per arg | `52a6b94` |
| 6 | MP3 bot publishes silence | `audioCtx.resume()` + `audio.play()` before `addTrack` | `52a6b94` |
| 7 | Vercel branch preview serving stale build | Pin Railway `APP_URL` to specific deployment URL | (env var) |
| 8 | `invalid permission: display-capture` | Remove from `overridePermissions` | `2504016` |
| 9 | `yt-dlp` blocked on Railway | Switched to YouTube IFrame Player | `5b137bc` |
| 10 | `botReady` 45s timeout | Moved `window.botReady = true` to top of `init()` | `5b137bc` |
| 11 | `waitUntil: networkidle0` hanging | Changed to `'load'` | `5b137bc` |
| 12 | HMS DeviceNotAvailable (3002) log noise | `console.error` intercept in MusicBotPage | `58fd6c8` |
| 13 | `getDisplayMedia` "Requested device not found" | Root cause confirmed (no audio HW on Railway); YouTube deferred | — |

---

## Architecture: MP3 bot

```
ClassroomPage (host only)
  └─ handleStartMusic()
       └─ POST start-music-bot edge fn
            └─ POST https://music-bot-server-production.up.railway.app/start
                 └─ bot.js launches Puppeteer Chrome (stealth plugin)
                      └─ navigates to https://online.nrithyaholics.in/?...#/music-bot
                           └─ MusicBotPage.jsx init():
                                └─ initMp3():
                                     Audio() → AudioContext.createMediaElementSource
                                     → MediaStreamDestination → getAudioTracks()[0]
                                     → audioCtx.resume() + audio.play()  ← before addTrack
                                     → hmsActions.addTrack('audio')
                                     → live audio stream in 100ms room

Controls: ClassroomPage → music-bot-control edge fn → Railway /control → window.botControl(cmd)
Stop:     ClassroomPage → stop-music-bot edge fn    → Railway /stop   → browser.close()
```

**Key invariants:**
- `window.botReady = true` at top of `init()` (bot.js waits on this)
- `audioCtx.resume()` + `audio.play()` MUST precede `addTrack` — else silence
- HMS DeviceNotAvailable (3002, isTerminal: false) suppressed via `console.error` intercept
- `['microphone']` is the only valid permission string for `overridePermissions`

---

## Active deployment

| Resource | Value |
|---|---|
| Frontend | `https://online.nrithyaholics.in` (Vercel) |
| Railway bot server | `https://music-bot-server-production.up.railway.app` |
| Railway service ID | `de46e1b6-1a21-46ab-bee6-bc7bf430ffb7` |
| Railway project ID | `b5cbee43-ca16-4756-ac70-4f8f18ad9c9e` |
| Railway APP_URL env var | `https://online.nrithyaholics.in` |
| Supabase project | `vuxqimoqsbqsgvkashak` (Mumbai) |
| Branch | `master` |

---

## Known limitations

| Issue | Impact | Workaround |
|---|---|---|
| YouTube blocked | Choreographers must use MP3 | cobalt.tools link in UI |
| No bot liveness check | If Railway restarts mid-session, host sees stale "playing" state | Host clicks Stop → Play |
| No error state in overlay | If start fails, overlay stays hidden with no message | — |
| MP3 must be re-uploaded per session | No reuse across sessions | Future: track library |

---

## Key files

| File | What changed |
|---|---|
| `frontend/src/pages/MusicBotPage.jsx` | New — headless bot page; MP3 AudioContext pipeline; DeviceNotAvailable suppression |
| `frontend/src/pages/ClassroomPage.jsx` | Floating music overlay (host-only); drag; skip buttons; position polling |
| `frontend/src/pages/ChoreoPage.jsx` | Music setup modal; YouTube disabled with cobalt.tools helper link |
| `frontend/src/App.jsx` | Early-exit for `#/music-bot` hash |
| `music-bot-server/index.js` | Express: `/start`, `/stop`, `/control`, `/health` |
| `music-bot-server/bot.js` | Puppeteer launch; stealth plugin; console forwarding |
| `music-bot-server/Dockerfile` | `node:20-slim` + Chrome; no pulseaudio |
| `supabase/functions/start-music-bot/` | Edge fn: auth check, room token, calls Railway `/start` |
| `supabase/functions/stop-music-bot/` | Edge fn: calls Railway `/stop`, clears DB fields |
| `supabase/functions/music-bot-control/` | Edge fn: proxies play/pause/seek/volume/status |
| `supabase/functions/get-token/` | Updated: `is_music_bot` fast path, 6-hour JWT, `music` role |
