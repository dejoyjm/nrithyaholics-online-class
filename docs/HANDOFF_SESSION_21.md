# HANDOFF — Session 21
**Date:** 24-Mar-2026 | **Branch:** `master` | **Status:** MP3 music bot complete ✅ — YouTube deferred indefinitely

---

## Summary

The music bot sprint is complete for the MP3 path. `master` is production-ready. YouTube audio capture is blocked by infrastructure limitations confirmed as of March 2026 and is deferred to a future sprint. Two final polish items shipped in Session 21: volume boost (GainNode 3x) and a force-reset button.

---

## What works in production (MP3 path)

- Choreographer uploads MP3 in ChoreoPage music setup modal → saved to Supabase Storage
- Host joins classroom → starts music from floating overlay
- Railway bot server launches headless Chrome, navigates to `MusicBotPage.jsx`
- Bot joins 100ms room as `Music` peer, publishes MP3 audio via AudioContext + GainNode pipeline
- Students hear music live in the classroom
- Host controls: play / pause / resume / seek (±15s, ±30s) / volume / stop / force reset
- Overlay is draggable; collapses to pill; auto-stops on session end

---

## Session 21 — What was added

### 1. Volume boost — GainNode 3.0x (commit `a9710e1`)

**Problem:** MP3 audio was audible but too quiet relative to the instructor's mic in the 100ms room.

**Fix:** Inserted a `GainNode` with `gain.value = 3.0` into the `initMp3()` pipeline:

```
Audio() → AudioContext.createMediaElementSource
→ GainNode (gain=3.0) → MediaStreamDestination → getAudioTracks()[0]
```

Volume slider in ClassroomPage overlay maps `(slider_value / 100) * 3.0` to `gainNode.gain.value`, so 100% slider = 3.0 gain and the reported percentage stays human-readable.

**Status:** Shipped. Gain value 3.0 is a first estimate — may need tuning after a real class test.

### 2. Force reset button — ⚠️ Reset bot (commit `a9710e1`)

**Problem:** If the bot crashes or Railway restarts mid-session, the overlay stays stuck in "playing" state with no way to recover without a page refresh.

**Fix:** Small `⚠️ Reset bot` button always visible in the expanded overlay (top-right of content area, above main controls). On click:
1. `window.confirm()` — "Reset the music bot? This will stop it and clear all state."
2. Calls `stop-music-bot` edge fn (best-effort; errors swallowed)
3. Waits 2 seconds
4. Clears all music state: `musicBotStatus → null`, `musicBotId → null`, `position → 0`, `duration → 0`, `volume → 70`
5. UI returns to "▶ Start Music"

---

## YouTube path — definitively blocked as of March 2026

Three approaches were confirmed blocked:

| Approach | Result |
|---|---|
| `yt-dlp` from Railway | "Sign in to confirm you're not a bot" — Railway datacenter IPs flagged |
| `ytdl-core` from Railway | `FAILED: Could not extract functions` — same IP block |
| `cobalt.tools` API (`POST /api/json`) | `railway run node -e "fetch('https://cobalt.tools/api/json', ...)"` returned no output — blocked or rate-limited |

Additionally, `getDisplayMedia({ audio: true, video: false })` fails on Railway because there is no virtual audio hardware in the container.

**Decision:** YouTube deferred indefinitely. Choreographers use MP3 upload. The YouTube input in MusicSetupModal is disabled; a cobalt.tools helper link lets choreographers download MP3s manually.

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
| 7 | Vercel branch preview serving stale build | Pin Railway `APP_URL` to production URL | (env var) |
| 8 | `invalid permission: display-capture` | Remove from `overridePermissions` | `2504016` |
| 9 | `yt-dlp` blocked on Railway | Switched to YouTube IFrame Player | `5b137bc` |
| 10 | `botReady` 45s timeout | Moved `window.botReady = true` to top of `init()` | `5b137bc` |
| 11 | `waitUntil: networkidle0` hanging | Changed to `'load'` | `5b137bc` |
| 12 | HMS DeviceNotAvailable (3002) log noise | `console.error` intercept in MusicBotPage | `58fd6c8` |
| 13 | `getDisplayMedia` "Requested device not found" | Root cause confirmed (no audio HW on Railway); YouTube deferred | — |
| 14 | Volume too quiet in room | GainNode 3.0x boost in MP3 pipeline | `a9710e1` |
| 15 | No recovery path if bot crashes mid-session | ⚠️ Reset bot button clears all state + calls stop-music-bot | `a9710e1` |

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
                                     Audio() → createMediaElementSource
                                     → GainNode (gain=3.0)
                                     → MediaStreamDestination → getAudioTracks()[0]
                                     → audioCtx.resume() + audio.play()  ← before addTrack
                                     → hmsActions.addTrack('audio')
                                     → live audio stream in 100ms room

Controls: ClassroomPage → music-bot-control edge fn → Railway /control → window.botControl(cmd)
Stop:     ClassroomPage → stop-music-bot edge fn    → Railway /stop   → browser.close()
Reset:    handleForceReset() → stop-music-bot (best-effort) → 2s wait → clear all state
```

**Key invariants:**
- `window.botReady = true` at top of `init()` (bot.js waits on this)
- `audioCtx.resume()` + `audio.play()` MUST precede `addTrack` — else silence
- HMS DeviceNotAvailable (3002, isTerminal: false) suppressed via `console.error` intercept
- `['microphone']` is the only valid permission string for `overridePermissions`
- Volume slider maps `(value/100) * 3.0` to `gainNode.gain.value` — never `audio.volume`

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

## Known issues — needs testing

| Issue | Context | How to test |
|---|---|---|
| Progress bar stays 0:00 | Observed on office laptop — likely corporate WebRTC blocking preventing bot control responses | Test on home network or phone hotspot |
| Volume 3.0x gain — may need tuning | 3.0 is a first estimate; could be too loud or still too quiet depending on track | Test in a real class; adjust `gainNode.gain.value = 3.0` in `MusicBotPage.jsx` and re-deploy |

---

## Next priorities (platform)

1. **Booking confirmation email self-healing fallback** — webhook path sometimes misses; need a fallback that checks for unconfirmed bookings and sends email
2. **Session cancellation + refund workflow** — choreographer cancels → trigger Razorpay refund API → notify booked students
3. **Auto-cancel 24hrs before if min_seats not met** — scheduled job compares `bookings` count vs `min_seats`; cancels + refunds if threshold not reached
4. **Revenue share visibility for choreographers** — dashboard showing earnings per session, payout status

---

## Music bot future research

| Approach | Notes |
|---|---|
| **SoundCloud API** | Has embeddable streams and a proper API; worth exploring as an alternative to YouTube for music-only use cases |
| **Wait for cobalt.tools / yt-dlp** | YouTube vs scraper arms race — may stabilise; worth retesting in a future sprint |
| **Residential proxy** | Route bot through a non-datacenter IP; yt-dlp/ytdl-core would likely work; adds latency and cost |
| **ALSA snd_aloop loopback** | `snd_aloop` kernel module creates a real loopback device Chrome can capture; requires privileged container or custom base image on Railway |
| **Different cloud provider** | Fly.io, Render, or a VPS with ALSA/PulseAudio; some support audio hardware passthrough |

---

## Key files

| File | What changed |
|---|---|
| `frontend/src/pages/MusicBotPage.jsx` | New — headless bot page; MP3 AudioContext + GainNode pipeline; DeviceNotAvailable suppression |
| `frontend/src/pages/ClassroomPage.jsx` | Floating music overlay (host-only); drag; skip buttons; position polling; force reset |
| `frontend/src/pages/ChoreoPage.jsx` | Music setup modal; YouTube disabled with cobalt.tools helper link |
| `frontend/src/App.jsx` | Early-exit for `#/music-bot` hash |
| `music-bot-server/index.js` | Express: `/start`, `/stop`, `/control`, `/health` |
| `music-bot-server/bot.js` | Puppeteer launch; stealth plugin; console forwarding |
| `music-bot-server/Dockerfile` | `node:20-slim` + Chrome; no pulseaudio |
| `supabase/functions/start-music-bot/` | Edge fn: auth check, room token, calls Railway `/start` |
| `supabase/functions/stop-music-bot/` | Edge fn: calls Railway `/stop`, clears DB fields |
| `supabase/functions/music-bot-control/` | Edge fn: proxies play/pause/seek/volume/status |
| `supabase/functions/get-token/` | Updated: `is_music_bot` fast path, 6-hour JWT, `music` role |
