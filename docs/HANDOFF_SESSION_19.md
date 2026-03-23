# HANDOFF — Session 19
**Date:** 23-Mar-2026 | **Branch:** `music-bot` | **Phase:** 1 complete → Phase 2 next

---

## What was built (Phase 1 — Music Bot Infrastructure)

### Edge functions
- **`get-token`** updated — added `is_music_bot` fast path: skips time gate, booking check, and device check; issues `music` role token (6-hour window); choreo/admin only
- **`start-music-bot`** (new) — auth check → generate music JWT inline → call Railway bot server `/start` → save `bot_id` + `music_bot_status='starting'` to sessions
- **`stop-music-bot`** (new) — call bot server `/stop` → clear `music_bot_id` + `music_bot_status` from sessions (non-blocking on server error)
- **`music-bot-control`** (new) — handles play/pause/resume/seek/volume/status/stop; forwards to bot server; syncs `music_bot_status` in DB on state-changing actions
- All 4 edge functions deployed with `--no-verify-jwt`

### Bot server (`music-bot-server/` at repo root)
- Express server with `/start`, `/stop`, `/control`, `/health` endpoints
- All routes protected by `X-Secret` header (shared secret with Supabase functions)
- `bot.js`: Puppeteer orchestration with `activeBots` Map; runs `yt-dlp` to extract direct audio stream URL from YouTube before launching browser (avoids ads/interstitials, more reliable than YouTube iframe)
- `Dockerfile`: `node:20-slim` base + installs Google Chrome stable + yt-dlp binary (switched from `ghcr.io/puppeteer/puppeteer:21.0.0` due to Railway build timeout on 1.5GB image)

### Frontend
- **`MusicBotPage.jsx`** (new) — headless page opened by Puppeteer; reads `?token`, `?track_url`, `?track_type`, `?session_id` from `window.location.search`; Web Audio API pipeline (Audio element → AudioContext → MediaStreamDestination); joins 100ms room with `music` role; exposes `window.botControl(action, value)` for Puppeteer; sets `window.botReady = true` when joined
- **`App.jsx`** — added early-exit for `#/music-bot` hash before loading spinner and all auth logic; bypasses all auth/session state for the bot page
- **`frontend/.npmrc`** — added `legacy-peer-deps=true` for Vercel build (React 19 peer dep conflict with hms-video-store)
- **`@100mslive/hms-video-store`** — added to `frontend/package.json` (used in MusicBotPage for raw SDK access without React hooks)

---

## Infrastructure deployed

| Resource | Value |
|---|---|
| Railway bot server URL | `https://music-bot-server-production.up.railway.app` |
| Railway project ID | `b5cbee43-ca16-4756-ac70-4f8f18ad9c9e` |
| Railway service ID | `de46e1b6-1a21-46ab-bee6-bc7bf430ffb7` |
| Railway region | US West (California) — no Mumbai/Singapore available at time of setup |
| Supabase secrets set | `MUSIC_BOT_SERVER_URL`, `MUSIC_BOT_SERVER_SECRET` |
| Vercel preview URL | `nrithyaholics-online-class-git-music-bot-dejoy-mathais-projects.vercel.app` |

---

## Pre-flight completed before coding

- 100ms `music` role created in dashboard (audio only, subscribes to host + guest)
- DB migration run: 6 `music_*` columns added to `sessions` table (`music_track_url`, `music_track_type`, `music_track_title`, `music_track_thumb`, `music_bot_id`, `music_bot_status`)
- Supabase Storage bucket `music-tracks` created (public, RLS policies set)
- `music-bot` branch created from `master` and pushed
- Railway CLI installed and authenticated (`dejoyjm@gmail.com`)
- Supabase CLI updated to v2.78.1 and linked to `vuxqimoqsbqsgvkashak`

---

## Verified working

- `GET /health` → `{"ok":true}` on Railway
- `#/music-bot` route renders black page with "NrithyaHolics Music Bot" (not the home page)
- `MusicBotPage` correctly validates params (shows console error when `token`/`track_url` missing)
- Vercel preview build passing (13s build time)

---

## Issues encountered and resolved

| Issue | Fix |
|---|---|
| `package-lock.json` missing from `music-bot-server/` | Ran `npm install` locally to generate it |
| Puppeteer tried to download Chrome during `npm ci` | Set `PUPPETEER_SKIP_DOWNLOAD=true` env var in Railway |
| Railway build timeout on `ghcr.io/puppeteer/puppeteer:21.0.0` (1.5GB image) | Switched to `node:20-slim` + install Chrome directly via apt-get |
| `curl` missing from Dockerfile apt-get list | Added `curl` to the install list |
| `@100mslive/hms-video-store` not in `frontend/package.json` | Added via `npm install --legacy-peer-deps` |
| `.npmrc` BOM encoding issue on Windows | Used PowerShell file writer instead of bash redirect |
| React 19 peer dependency conflict with hms-video-store | Resolved via `.npmrc` `legacy-peer-deps=true` |

---

## What's next — Phase 2

Build "Set up music" UI in `ChoreoPage.jsx`.

### Tasks
1. Add "🎵 Set up music" button on each upcoming session card in `ChoreoPage`
2. Open a modal for that session with:
   - YouTube URL input + "Fetch Track Info" button → calls YouTube oEmbed API (`youtube.com/oembed?url=...&format=json`) — no API key needed
   - Shows fetched title + thumbnail
   - "── or ──" divider
   - MP3 upload → Supabase Storage `music-tracks` bucket at `{user_id}/{session_id}/track.mp3` → public URL
3. Save track to sessions DB (`music_track_url`, `music_track_type`, `music_track_title`, `music_track_thumb`)
4. Show saved track with title + thumbnail on the session card

### Rules for Phase 2
- Inline styles only — no CSS files, no Tailwind
- No TypeScript in frontend (`.jsx` only)
- Do NOT touch `ClassroomPage.jsx` yet — that is Phase 3
- Read `HANDOFF_MUSIC_BOT.md` Part 1 for exact UI spec before starting

---

## Key credentials

| Resource | Value |
|---|---|
| Supabase project | `vuxqimoqsbqsgvkashak` (Mumbai) |
| Railway bot server | `https://music-bot-server-production.up.railway.app` |
| 100ms template | `dejoy-videoconf-406` |
| App URL | `https://online.nrithyaholics.in` |
| Branch | `music-bot` — **DO NOT merge to master until Phase 3 complete** |
