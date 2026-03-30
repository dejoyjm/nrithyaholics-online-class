# HANDOFF — Cloud Music Bot
**Date:** 21-Mar-2026 | **Priority:** P0 — Higher than SDK
**Branch:** `music-bot` (branches from `master`, merges to `master`)
**Why higher than SDK:** Music bot works WITH Prebuilt (no SDK needed).
Solves the #1 class quality problem NOW, not in 5-6 weeks.

---

## 🎯 What We're Building

A cloud-hosted headless browser that joins any NrithyaHolics classroom
as an audio-only peer and streams music directly into the 100ms room.

**Choreographer experience (entirely from mobile):**
1. Before class — open NrithyaHolics, go to session, tap "Set up music"
2. Paste YouTube URL or upload MP3 — done in 30 seconds
3. Join class normally from phone
4. Music control panel appears as a floating overlay above the classroom
5. Tap Play — cloud bot joins the room, students hear perfect music
6. Full transport controls: play/pause/seek/volume from phone
7. End class — bot closes automatically

**No second device. No laptop. Works for every choreographer on the platform forever.**

---

## 🏗️ Architecture

```
┌─────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│  Choreographer      │   │  NRH Backend         │   │  Music Bot Server    │
│  Mobile Phone       │   │  (Supabase Edge Fns) │   │  (Railway ~$6/month) │
│                     │   │                      │   │                      │
│ 1. Pick track       │──▶│ Save to sessions DB  │   │                      │
│    (YouTube/MP3)    │   │                      │   │                      │
│                     │   │                      │   │                      │
│ 2. Join class       │──▶│ ClassroomPage loads  │   │                      │
│                     │   │                      │   │                      │
│ 3. Tap ▶ Play       │──▶│ start-music-bot fn   │──▶│ Launch Puppeteer     │
│                     │   │ Issues music token   │   │ Open music-bot page  │
│                     │   │ Calls bot server     │   │ Join 100ms room      │
│                     │   │ Returns bot_id       │   │ Play track           │
│                     │   │                      │   │ Stream audio ────────┼──▶ Students hear 🎵
│ 4. Tap ⏸ Pause     │──▶│ music-bot-control fn │──▶│ Pause audio          │
│ 5. Seek to 2:30     │──▶│ music-bot-control fn │──▶│ Seek to 2:30         │
│ 6. Vol up           │──▶│ music-bot-control fn │──▶│ Set volume           │
│ 7. End class        │──▶│ stop-music-bot fn    │──▶│ Close browser        │
└─────────────────────┘   └──────────────────────┘   └──────────────────────┘
```

**Key insight:** The music bot is just another peer in the 100ms room.
Prebuilt plays ALL audio tracks automatically — students hear it with zero changes.
The bot is invisible to students (audio only, no video tile).

---

## 🗄️ DB Changes

Run in Supabase SQL Editor before starting:

```sql
-- Store prepared music on sessions
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS music_track_url    text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS music_track_type   text DEFAULT NULL,
  -- 'youtube' | 'mp3'
  ADD COLUMN IF NOT EXISTS music_track_title  text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS music_track_thumb  text DEFAULT NULL,
  -- thumbnail URL for display in UI
  ADD COLUMN IF NOT EXISTS music_bot_id       text DEFAULT NULL,
  -- active Puppeteer bot instance ID, null when not running
  ADD COLUMN IF NOT EXISTS music_bot_status   text DEFAULT NULL;
  -- null | 'starting' | 'playing' | 'paused' | 'stopped'

-- Supabase secret needed (set via CLI):
-- supabase secrets set MUSIC_BOT_SERVER_URL=https://your-railway-app.railway.app
-- supabase secrets set MUSIC_BOT_SERVER_SECRET=your-secret-key
```

---

## 📦 Components to Build

| Component | Where | What it does |
|-----------|-------|-------------|
| "Set up Music" UI | `ChoreoPage.jsx` | Pre-class track picker |
| Music overlay | `ClassroomPage.jsx` | Floating controls above iframe |
| `start-music-bot` | Edge function | Launches bot, returns bot_id |
| `stop-music-bot` | Edge function | Kills bot cleanly |
| `music-bot-control` | Edge function | Play/pause/seek/volume commands |
| `get-token` update | Edge function | Issues `music` role tokens |
| Music bot server | Railway (Node.js) | Puppeteer orchestration |
| Music bot page | Frontend route | What the bot browser opens |
| `music` role | 100ms dashboard | Audio-only role, 5 mins |

---

## 🎵 Part 1 — "Set Up Music" in ChoreoPage

### Where it lives
In `ChoreoPage.jsx`, on each upcoming session card, add a "🎵 Set up music" button.
Opens a modal/drawer for that session.

### UI
```
┌─────────────────────────────────────────┐
│  🎵 Music for: 90s Bollywood - Bumro    │
├─────────────────────────────────────────┤
│                                         │
│  Add a YouTube link:                    │
│  ┌─────────────────────────────────┐    │
│  │ https://youtube.com/watch?v=... │    │
│  └─────────────────────────────────┘    │
│  [Fetch Track Info]                     │
│                                         │
│  ── or ──                               │
│                                         │
│  Upload MP3:                            │
│  [📁 Choose file]  bumbro.mp3           │
│                                         │
│  ─────────────────────────────────────  │
│  ✅ Track ready:                        │
│  🎵 Bumbro - Mission Kashmir  5:09      │
│  [thumbnail if YouTube]                 │
│                                         │
│  [💾 Save for this session]             │
│  [✕ Cancel]                             │
└─────────────────────────────────────────┘
```

### YouTube URL handling
When choreo pastes YouTube URL, call YouTube oEmbed API to get title + thumbnail:
```
GET https://www.youtube.com/oembed?url=YOUTUBE_URL&format=json
Returns: { title, thumbnail_url, author_name }
```
No API key needed — oEmbed is public.

### MP3 Upload
Upload to Supabase Storage bucket `music-tracks`:
```
Path: {user_id}/{session_id}/track.mp3
Public URL saved to sessions.music_track_url
```

### Save to DB
```js
await supabase.from('sessions').update({
  music_track_url:   trackUrl,
  music_track_type:  trackType,   // 'youtube' | 'mp3'
  music_track_title: trackTitle,
  music_track_thumb: trackThumb,
}).eq('id', session.id)
```

---

## 🎛️ Part 2 — Music Control Overlay in ClassroomPage

### What it is
A floating panel sitting **above** the Prebuilt iframe. Only visible to the HOST (choreographer). Students see nothing — they just hear the music.

### When it shows
- User is host (`userRole === 'host'`)
- Session has `music_track_url` set
- Classroom is in `ready` or `live` state

### UI
```
┌─────────────────────────────────────────┐  ← absolute positioned, top of screen
│  🎵 Bumbro - Mission Kashmir            │     above iframe, draggable
│  ████████████░░░░░░░  1:23 / 5:09       │
│  [⏮]  [▶ PLAY]  [⏭]   Vol: ████░░ 70% │
│                              [✕ close]  │
└─────────────────────────────────────────┘
```

When bot is starting: shows "⏳ Starting music..."
When playing: shows "🔴 LIVE" indicator
When paused: shows "⏸ Paused"
When stopped: shows "▶ Start Music" button

### State
```jsx
const [musicBotId, setMusicBotId] = useState(null)
const [musicBotStatus, setMusicBotStatus] = useState(null)
// null | 'starting' | 'playing' | 'paused' | 'stopped'
const [musicPosition, setMusicPosition] = useState(0)
// current playback position in seconds, polled every 2s
```

### Positioning (above iframe)
```jsx
// In ClassroomPage render, when status === 'ready':
{isHost && session?.music_track_url && (
  <div style={{
    position: 'absolute',
    top: 60,        // below timer banner
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 50,     // above iframe
    background: 'rgba(15,12,12,0.92)',
    borderRadius: 12,
    padding: '10px 16px',
    border: '1px solid rgba(200,67,10,0.4)',
    minWidth: 320,
  }}>
    <MusicControls
      session={session}
      botId={musicBotId}
      botStatus={musicBotStatus}
      onStart={handleStartMusic}
      onPause={handlePauseMusic}
      onResume={handleResumeMusic}
      onSeek={handleSeekMusic}
      onVolume={handleVolumeMusic}
      onStop={handleStopMusic}
    />
  </div>
)}
```

---

## ⚙️ Part 3 — Edge Functions

### `supabase/functions/start-music-bot/index.ts`

Called when choreographer taps ▶ Play.

```typescript
serve(async (req) => {
  const { session_id } = await req.json()

  // Auth check — must be the session's choreographer or admin
  const { data: { user } } = await supabase.auth.getUser(token)
  const { data: session } = await supabase
    .from('sessions').select('*').eq('id', session_id).single()

  if (session.choreographer_id !== user.id && !isAdmin) {
    return 403
  }

  // Get a music role token from get-token logic
  const musicToken = await getMusicRoleToken(session.room_id, user.id)

  // Call music bot server
  const botRes = await fetch(`${BOT_SERVER_URL}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Secret': BOT_SERVER_SECRET,
    },
    body: JSON.stringify({
      room_id:     session.room_id,
      token:       musicToken,
      track_url:   session.music_track_url,
      track_type:  session.music_track_type,
      session_id:  session_id,
    })
  })

  const { bot_id } = await botRes.json()

  // Save bot_id to session
  await supabase.from('sessions').update({
    music_bot_id:     bot_id,
    music_bot_status: 'starting',
  }).eq('id', session_id)

  return { bot_id }
})
```

### `supabase/functions/music-bot-control/index.ts`

Called for play/pause/seek/volume/stop.

```typescript
serve(async (req) => {
  const { session_id, action, value } = await req.json()
  // action: 'play' | 'pause' | 'resume' | 'seek' | 'volume' | 'stop'
  // value: seconds for seek, 0-100 for volume

  // Auth check same as above

  const { data: session } = await supabase
    .from('sessions').select('music_bot_id').eq('id', session_id).single()

  if (!session.music_bot_id) return 400 'No active bot'

  const botRes = await fetch(`${BOT_SERVER_URL}/control`, {
    method: 'POST',
    headers: { 'X-Secret': BOT_SERVER_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bot_id: session.music_bot_id,
      action,
      value,
    })
  })

  const result = await botRes.json()

  // Update status in DB
  if (action === 'pause') {
    await supabase.from('sessions')
      .update({ music_bot_status: 'paused' }).eq('id', session_id)
  } else if (action === 'resume' || action === 'play') {
    await supabase.from('sessions')
      .update({ music_bot_status: 'playing' }).eq('id', session_id)
  }

  return result
})
```

### `supabase/functions/stop-music-bot/index.ts`

Called when class ends or choreo stops music.

```typescript
serve(async (req) => {
  const { session_id } = await req.json()

  const { data: session } = await supabase
    .from('sessions').select('music_bot_id').eq('id', session_id).single()

  if (session.music_bot_id) {
    await fetch(`${BOT_SERVER_URL}/stop`, {
      method: 'POST',
      headers: { 'X-Secret': BOT_SERVER_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: session.music_bot_id })
    })

    await supabase.from('sessions').update({
      music_bot_id:     null,
      music_bot_status: null,
    }).eq('id', session_id)
  }

  return { ok: true }
})
```

### `get-token` update for music role

Add to `supabase/functions/get-token/index.ts`:

```typescript
// At the top of serve():
const body = await req.json()
const { session_id, is_music_bot } = body

// Role determination:
const hmsRole = is_music_bot ? 'music'
  : (isChoreo || isAdmin) ? 'host'
  : 'guest'

// If music bot — skip ALL gates except auth + choreo check:
if (is_music_bot) {
  if (session.choreographer_id !== user.id && !isAdmin) {
    return 403 'Not authorised'
  }
  // Skip: time gate, booking check, device check
  const token = await getRoomToken(roomId, 'music-bot', 'music', 'Music', 0, farFuture)
  return { token, room_id: roomId, role: 'music' }
}
```

---

## 🖥️ Part 4 — Music Bot Server (Railway)

A Node.js Express server running Puppeteer. Deployed to Railway (~$6/month).

### File structure
```
music-bot-server/
  index.js          ← Express server
  bot.js            ← Puppeteer bot logic
  package.json
  Dockerfile        ← for Railway deployment
```

### `index.js`
```javascript
const express = require('express')
const { startBot, controlBot, stopBot } = require('./bot')
const app = express()
app.use(express.json())

// Auth middleware
app.use((req, res, next) => {
  if (req.headers['x-secret'] !== process.env.BOT_SERVER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
})

app.post('/start', async (req, res) => {
  try {
    const { room_id, token, track_url, track_type, session_id } = req.body
    const bot_id = await startBot({ room_id, token, track_url, track_type, session_id })
    res.json({ bot_id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/control', async (req, res) => {
  try {
    const { bot_id, action, value } = req.body
    const result = await controlBot(bot_id, action, value)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/stop', async (req, res) => {
  try {
    const { bot_id } = req.body
    await stopBot(bot_id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/health', (_, res) => res.json({ ok: true }))

app.listen(3000, () => console.log('Music bot server on port 3000'))
```

### `bot.js`
```javascript
const puppeteer = require('puppeteer')
const { v4: uuid } = require('uuid')

const activeBots = new Map() // bot_id → { browser, page }

async function startBot({ room_id, token, track_url, track_type, session_id }) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-web-security',
    ]
  })

  const page = await browser.newPage()

  // Grant microphone permission
  const context = browser.defaultBrowserContext()
  await context.overridePermissions(process.env.APP_URL, ['microphone'])

  // Grant audio context permission
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'mediaDevices', { writable: true })
  })

  // Navigate to music bot page
  const botUrl = `${process.env.APP_URL}/music-bot` +
    `?token=${encodeURIComponent(token)}` +
    `&track_url=${encodeURIComponent(track_url)}` +
    `&track_type=${track_type}` +
    `&session_id=${session_id}`

  await page.goto(botUrl, { waitUntil: 'networkidle0' })

  // Wait for bot to join room (page sets window.botReady = true)
  await page.waitForFunction('window.botReady === true', { timeout: 30000 })

  const bot_id = uuid()
  activeBots.set(bot_id, { browser, page })

  console.log(`Bot ${bot_id} started for room ${room_id}`)
  return bot_id
}

async function controlBot(bot_id, action, value) {
  const bot = activeBots.get(bot_id)
  if (!bot) throw new Error('Bot not found: ' + bot_id)

  // Send command to page via evaluate
  const result = await bot.page.evaluate(
    (action, value) => window.botControl(action, value),
    action, value
  )
  return result
}

async function stopBot(bot_id) {
  const bot = activeBots.get(bot_id)
  if (!bot) return

  await bot.browser.close()
  activeBots.delete(bot_id)
  console.log(`Bot ${bot_id} stopped`)
}

module.exports = { startBot, controlBot, stopBot }
```

### `Dockerfile`
```dockerfile
FROM ghcr.io/puppeteer/puppeteer:21.0.0

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

EXPOSE 3000
CMD ["node", "index.js"]
```

### Railway deployment
```bash
# In music-bot-server/
railway login
railway new music-bot-server
railway up

# Set env vars in Railway dashboard:
BOT_SERVER_SECRET=<random-32-char-string>
APP_URL=https://online.nrithyaholics.in
```

---

## 🌐 Part 5 — Music Bot Page (Frontend)

A special page at route `/#/music-bot` (or `/music-bot` as a separate route).
This is what the Puppeteer browser opens. Invisible to users — only accessed by the bot.

### What it does
1. Reads URL params: `?token=`, `?track_url=`, `?track_type=`, `?session_id=`
2. Joins 100ms room using the token (music role)
3. Plays the track via Web Audio API
4. Captures audio and publishes to 100ms room
5. Exposes `window.botControl(action, value)` for Puppeteer to call
6. Sets `window.botReady = true` when joined and ready

### Implementation
```jsx
// frontend/src/pages/MusicBotPage.jsx

import { useEffect, useRef } from 'react'
import { HMSReactiveStore, HMSSDKBundle } from '@100mslive/hms-video-store'
// Note: this page uses the raw SDK store, not React SDK
// because it's a headless page with no UI

export default function MusicBotPage() {
  const audioRef = useRef(null)
  const audioCtxRef = useRef(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const trackUrl = params.get('track_url')
    const trackType = params.get('track_type')

    async function init() {
      // 1. Set up audio element
      const audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.src = trackUrl
      audioRef.current = audio

      // 2. Set up Web Audio API pipeline
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaElementSource(audio)
      const destination = audioCtx.createMediaStreamDestination()
      source.connect(destination)
      // Note: do NOT connect to audioCtx.destination
      // We do NOT want the bot server speaker to play it
      // We ONLY want to stream it into 100ms

      // 3. Join 100ms room
      const hms = new HMSReactiveStore()
      const hmsActions = hms.getHMSActions()

      await hmsActions.join({
        authToken: token,
        userName: 'Music',
        audioTrack: destination.stream.getAudioTracks()[0],
        // Inject our custom audio track directly
      })

      // 4. Expose control interface to Puppeteer
      window.botControl = async (action, value) => {
        switch (action) {
          case 'play':
            await audioCtx.resume()
            await audio.play()
            return { ok: true }
          case 'pause':
            audio.pause()
            return { ok: true }
          case 'resume':
            await audio.play()
            return { ok: true }
          case 'seek':
            audio.currentTime = value
            return { ok: true }
          case 'volume':
            audio.volume = value / 100
            return { ok: true }
          case 'status':
            return {
              currentTime: audio.currentTime,
              duration: audio.duration,
              paused: audio.paused,
              volume: audio.volume * 100,
            }
          default:
            return { error: 'Unknown action' }
        }
      }

      // 5. Signal ready to Puppeteer
      window.botReady = true
      console.log('Music bot ready')
    }

    init().catch(console.error)
  }, [])

  // Invisible page — no UI needed
  return (
    <div style={{ background: '#000', minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center', color: '#333' }}>
      🎵 NrithyaHolics Music Bot
    </div>
  )
}
```

### Note on YouTube playback in headless Chrome
YouTube works in headless Chrome with Puppeteer. The bot page can embed a YouTube player via iframe or the YouTube IFrame API. Use `audioOnly: false` in the YouTube player (we need the audio stream) but mute the visual output.

Alternative: use `yt-dlp` on the bot server to get a direct audio stream URL from the YouTube URL, then pass that URL to the audio element. This is more reliable than the YouTube player approach.

```javascript
// In bot server, before launching Puppeteer:
const { execSync } = require('child_process')
const audioUrl = execSync(
  `yt-dlp -f bestaudio -g "${youtubeUrl}"`
).toString().trim()
// Pass audioUrl instead of youtube URL to the bot page
```

This approach:
- No YouTube iframe needed
- Direct audio stream URL — plays reliably in headless browser
- No ad interruptions
- Works for YouTube Music, regular YouTube

---

## 🎵 Part 6 — 100ms Dashboard: Add `music` Role

**Do this NOW — 5 minutes:**

1. Go to `dashboard.100ms.live/templates/69aca87c6236da36a7d8c593`
2. Click **Roles** tab
3. Click **Add a role**
4. Name: `music`
5. Publish Strategy:
   - Can share audio: ✅ ON
   - Can share video: ❌ OFF
   - Can share screen: ❌ OFF
6. Subscribe Strategy:
   - Subscribe to: `host`, `guest` (so bot hears the room — not strictly needed but good practice)
7. Permissions: none
8. Save

---

## 📊 Playback Position Polling

The music overlay in ClassroomPage needs to show current position (progress bar).

Every 2 seconds, frontend calls `music-bot-control` with `action: 'status'`:
```js
useEffect(() => {
  if (musicBotStatus !== 'playing') return
  const interval = setInterval(async () => {
    const res = await callEdgeFn('music-bot-control', {
      session_id: sessionId,
      action: 'status',
    })
    setMusicPosition(res.currentTime)
    setMusicDuration(res.duration)
  }, 2000)
  return () => clearInterval(interval)
}, [musicBotStatus])
```

---

## 🔒 Security

**Bot server never exposed publicly except via Supabase edge functions.**

```
Frontend → Supabase Edge Function → Bot Server
                                    (protected by X-Secret header)
```

Frontend never calls bot server directly.
Bot server URL and secret stored in Supabase secrets:
```bash
supabase secrets set MUSIC_BOT_SERVER_URL=https://xxx.railway.app
supabase secrets set MUSIC_BOT_SERVER_SECRET=your-32-char-secret
```

**Music role token:** Only choreographer of the session (or admin) can trigger `start-music-bot`. Edge function verifies this before calling bot server.

---

## 📅 Build Phases

### Phase 1 — Infrastructure (2-3 days)
- Add `music` role in 100ms dashboard ✅ (5 mins)
- DB migration (music columns on sessions)
- Deploy music bot server to Railway
- `get-token` music role support
- `start-music-bot` edge function
- `stop-music-bot` edge function
- `music-bot-control` edge function
- Deploy all edge functions

**Test:** Manually call `start-music-bot` from Postman/curl with a real session. Bot joins room. Play music in room using 100ms dashboard preview. Students in test room hear music. ✅

### Phase 2 — Music Preparation UI (2-3 days)
- "Set up music" button on ChoreoPage session cards
- YouTube URL input + oEmbed metadata fetch
- MP3 upload to Supabase Storage
- Save track to sessions DB
- Show saved track with title + thumbnail

**Test:** Nayana picks a YouTube track for a session. Refreshes page. Track is still there. ✅

### Phase 3 — Classroom Music Controls (2-3 days)
- `MusicControls` component
- Floating overlay in `ClassroomPage.jsx` (above iframe, host only)
- Play/pause/seek/volume wired to edge functions
- 2-second position polling
- Auto-stop on session end

**Test:** Full end-to-end. Nayana joins session on phone. Taps Play. Bot starts. Students (Jisha on another device) hear music. Nayana pauses — students hear silence. Nayana seeks to 2:30 — students hear from 2:30. Session ends — music stops. ✅

### Phase 4 — Polish (1-2 days)
- Error handling (bot failed to start, network issues)
- "Retry" button if bot fails
- Visual indicator for students that music is playing (optional)
- Auto-restart bot if it crashes mid-session
- Bot server health monitoring

---

## ✅ Definition of Done

- [ ] `music` role created in 100ms dashboard
- [ ] DB columns added to sessions table
- [ ] Bot server deployed to Railway and responding to /health
- [ ] `start-music-bot` edge function deployed
- [ ] `stop-music-bot` edge function deployed
- [ ] `music-bot-control` edge function deployed
- [ ] `get-token` issues music role tokens correctly
- [ ] YouTube URL → oEmbed metadata fetch working
- [ ] MP3 upload to Supabase Storage working
- [ ] "Set up music" UI visible in ChoreoPage for upcoming sessions
- [ ] Music control overlay visible to host only in ClassroomPage
- [ ] Play starts bot, students hear music (tested on real devices)
- [ ] Pause stops audio, students hear silence
- [ ] Resume continues from paused position
- [ ] Seek works with < 3 second lag
- [ ] Volume control works
- [ ] Bot stops automatically when session ends
- [ ] Choreographer can do everything from mobile only — no second device

---

## 🚀 How to Start

**Step 1 — 100ms dashboard (do NOW, 5 mins):**
Add `music` role as described in Part 6 above.

**Step 2 — DB migration:**
```sql
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS music_track_url    text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS music_track_type   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS music_track_title  text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS music_track_thumb  text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS music_bot_id       text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS music_bot_status   text DEFAULT NULL;
```

**Step 3 — Create branch:**
```bash
git checkout master
git checkout -b music-bot
```

**Step 4 — First Claude Code message:**
```
Read HANDOFF_MUSIC_BOT.md in full before starting.

We are building a cloud music bot on the music-bot branch.
This branch comes from master and will merge back to master.

Rules:
- Inline styles only — no CSS files, no Tailwind
- No TypeScript in frontend (.jsx only)
- Edge functions in TypeScript (.ts) are fine
- get-token/index.ts already exists — we are adding music role support
- ClassroomPage.jsx gets a floating music control overlay (minimal changes)
- ChoreoPage.jsx gets "Set up music" button on session cards

Start with Phase 1 — Infrastructure:

1. Update supabase/functions/get-token/index.ts to support is_music_bot flag
   and issue 'music' role tokens (see HANDOFF_MUSIC_BOT.md Part 3)

2. Create supabase/functions/start-music-bot/index.ts

3. Create supabase/functions/stop-music-bot/index.ts

4. Create supabase/functions/music-bot-control/index.ts

5. Create music-bot-server/ directory with index.js, bot.js, package.json, Dockerfile

Deploy all 3 new edge functions with --no-verify-jwt after creating.
Do NOT touch ClassroomPage.jsx or ChoreoPage.jsx yet — that's Phase 2 and 3.
```

---

## 🔑 Credentials

```
Supabase:           vuxqimoqsbqsgvkashak (Mumbai)
Supabase Anon Key:  sb_publishable_uIUbVLySwkY4SQXjObq4Rw_UM41h1Lo
100ms Template:     dejoy-videoconf-406
100ms Template ID:  69aca87c6236da36a7d8c593
App URL:            https://online.nrithyaholics.in
Repo:               dejoyjm/nrithyaholics-online-class
Production branch:  master
Music bot branch:   music-bot
Railway project:    music-bot-server (new — to be created)
Resend from:        bookings@nrithyaholics.in
```

---

## 🌿 Branch Summary

```
master          ← production, always deployable, Prebuilt running
music-bot       ← this sprint, P0, merges to master when done
sdk-classroom   ← parallel, lower priority, long-term
```

Music bot and SDK are completely independent.
Music bot works with Prebuilt — no SDK dependency.
SDK can later add its own music controls that call the same edge functions.

**Music bot done = Nayana teaches from one phone with perfect music.
That's the goal. Everything else is secondary. 🎯**