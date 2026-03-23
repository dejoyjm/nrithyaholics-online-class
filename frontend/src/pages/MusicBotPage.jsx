import { useEffect, useRef } from 'react'
import { HMSReactiveStore } from '@100mslive/react-sdk'

/**
 * MusicBotPage — headless page opened by the Puppeteer music bot.
 *
 * URL format (set in bot.js):
 *   https://<app>/?token=XXX&track_url=YYY&track_type=ZZZ&session_id=WWW#/music-bot
 *
 * For track_type === 'mp3':
 *   Uses an <audio> element + Web Audio API pipeline (same as before).
 *
 * For track_type === 'youtube':
 *   Uses YouTube IFrame Player API for playback control.
 *   Captures tab audio via navigator.mediaDevices.getDisplayMedia().
 *   Puppeteer is launched with --auto-select-tab-capture-source=NrithyaHolics
 *   so Chrome auto-selects this tab without a picker dialog.
 *
 * No UI is shown to users — this page is only ever opened by the bot server.
 */
export default function MusicBotPage() {
  const hmsRef = useRef(null)

  useEffect(() => {
    const params    = new URLSearchParams(window.location.search)
    const token     = params.get('token')
    const trackUrl  = params.get('track_url')
    const trackType = params.get('track_type')

    if (!token || !trackUrl) {
      console.error('[MusicBot] Missing required params: token, track_url')
      return
    }

    console.log(`[MusicBot] Starting — type=${trackType}`)

    // ── MP3 path ─────────────────────────────────────────────────
    async function initMp3() {
      const audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.preload = 'auto'
      audio.src = trackUrl

      const audioCtx   = new AudioContext()
      const source     = audioCtx.createMediaElementSource(audio)
      const destination = audioCtx.createMediaStreamDestination()
      source.connect(destination)

      const customAudioTrack = destination.stream.getAudioTracks()[0]
      if (!customAudioTrack) throw new Error('[MusicBot] No audio track from MediaStreamDestination')

      const botControl = async (action, value) => {
        try {
          switch (action) {
            case 'play':
              if (audioCtx.state === 'suspended') await audioCtx.resume()
              await audio.play()
              return { ok: true, action: 'play' }
            case 'pause':
              audio.pause()
              return { ok: true, action: 'pause' }
            case 'resume':
              if (audioCtx.state === 'suspended') await audioCtx.resume()
              await audio.play()
              return { ok: true, action: 'resume' }
            case 'seek':
              audio.currentTime = Number(value)
              return { ok: true, action: 'seek', currentTime: audio.currentTime }
            case 'volume':
              audio.volume = Math.max(0, Math.min(100, Number(value))) / 100
              return { ok: true, action: 'volume', volume: audio.volume * 100 }
            case 'status':
              return {
                ok: true,
                currentTime: audio.currentTime,
                duration:    audio.duration || 0,
                paused:      audio.paused,
                volume:      Math.round(audio.volume * 100),
                ended:       audio.ended,
              }
            default:
              return { error: 'Unknown action: ' + action }
          }
        } catch (err) {
          return { error: err.message }
        }
      }

      return {
        customAudioTrack,
        botControl,
        cleanup: () => {
          audio.pause()
          audio.src = ''
          audioCtx.close()
        },
      }
    }

    // ── YouTube path ──────────────────────────────────────────────
    async function initYouTube() {
      // Set document title so --auto-select-tab-capture-source=NrithyaHolics matches
      document.title = 'NrithyaHolics'

      // Extract video ID from YouTube URL
      function extractVideoId(url) {
        const m = url.match(/[?&]v=([^&#]+)/) || url.match(/youtu\.be\/([^?&#]+)/)
        return m ? m[1] : null
      }
      const videoId = extractVideoId(trackUrl)
      if (!videoId) throw new Error('[MusicBot] Could not extract YouTube video ID from: ' + trackUrl)

      console.log('[MusicBot] Loading YouTube IFrame API for videoId:', videoId)

      // Load YouTube IFrame Player API — set callback BEFORE appending script
      await new Promise((resolve) => {
        window.onYouTubeIframeAPIReady = resolve
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(tag)
      })

      // Create a hidden player div
      const playerDiv = document.createElement('div')
      playerDiv.id = 'yt-player'
      playerDiv.style.cssText = 'position:fixed;bottom:0;right:0;width:1px;height:1px;opacity:0.01;pointer-events:none'
      document.body.appendChild(playerDiv)

      // Create YouTube player and wait for onReady
      const player = await new Promise((resolve, reject) => {
        new window.YT.Player('yt-player', {
          height: '1',
          width:  '1',
          videoId,
          playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1 },
          events: {
            onReady: (e) => {
              e.target.setVolume(70)
              e.target.playVideo()
              resolve(e.target)
            },
            onError: (e) => reject(new Error('[MusicBot] YouTube player error code: ' + e.data)),
          },
        })
      })

      console.log('[MusicBot] YouTube player ready, capturing audio via AudioContext...')

      // Puppeteer launches with --disable-web-security, so we can reach into the
      // cross-origin YouTube iframe and grab its <video> element directly.
      // Web Audio API: createMediaElementSource(<video>) → MediaStreamDestination → track.
      const audioCtx = new AudioContext()
      const destination = audioCtx.createMediaStreamDestination()

      // YT.Player wraps a div; the actual iframe is a child of that div.
      const ytContainer = document.getElementById('yt-player')
      const ytIframe = ytContainer ? ytContainer.querySelector('iframe') : null
      if (!ytIframe) throw new Error('[MusicBot] YouTube iframe element not found in DOM')

      const videoEl = ytIframe.contentDocument && ytIframe.contentDocument.querySelector('video')
      if (!videoEl) throw new Error('[MusicBot] YouTube <video> not found inside iframe (--disable-web-security required)')

      const source = audioCtx.createMediaElementSource(videoEl)
      source.connect(destination)
      if (audioCtx.state === 'suspended') await audioCtx.resume()

      const customAudioTrack = destination.stream.getAudioTracks()[0]
      if (!customAudioTrack) throw new Error('[MusicBot] No audio track from AudioContext destination')

      console.log('[MusicBot] AudioContext pipeline connected to YouTube video element')

      const botControl = async (action, value) => {
        try {
          switch (action) {
            case 'play':
              player.playVideo()
              return { ok: true, action: 'play' }
            case 'pause':
              player.pauseVideo()
              return { ok: true, action: 'pause' }
            case 'resume':
              player.playVideo()
              return { ok: true, action: 'resume' }
            case 'seek':
              player.seekTo(Number(value), true) // true = allow seeking ahead of buffer
              return { ok: true, action: 'seek', currentTime: player.getCurrentTime() }
            case 'volume':
              player.setVolume(Number(value)) // YouTube IFrame API takes 0–100 directly
              return { ok: true, action: 'volume', volume: player.getVolume() }
            case 'status':
              return {
                ok:          true,
                currentTime: player.getCurrentTime(),
                duration:    player.getDuration(),
                paused:      player.getPlayerState() !== 1, // 1 = YT.PlayerState.PLAYING
                volume:      player.getVolume(),
                ended:       player.getPlayerState() === 0, // 0 = YT.PlayerState.ENDED
              }
            default:
              return { error: 'Unknown action: ' + action }
          }
        } catch (err) {
          return { error: err.message }
        }
      }

      return {
        customAudioTrack,
        botControl,
        cleanup: () => {
          try { audioCtx.close() } catch (_) {}
          try { player.destroy() } catch (_) {}
        },
      }
    }

    // ── Common: join 100ms + expose controls + signal ready ───────
    let doCleanup = () => {}

    async function init() {
      // Signal readiness immediately — params are validated and init is underway.
      // The bot server only needs to know the page is alive, not that 100ms has
      // fully connected. window.botControl is wired up once the player is ready.
      window.botReady = true
      console.log('[MusicBot] botReady set — page alive, async init continuing')

      const { customAudioTrack, botControl, cleanup } = trackType === 'youtube'
        ? await initYouTube()
        : await initMp3()

      doCleanup = cleanup

      // Join 100ms room
      console.log('[MusicBot] joining 100ms room...')
      const hms        = new HMSReactiveStore()
      const hmsActions = hms.getHMSActions()
      hmsRef.current   = hmsActions

      await hmsActions.join({
        authToken: token,
        userName:  'Music',
        audioTrack: { enabled: true },
        settings:  { isAudioMuted: false, isVideoMuted: true },
      })

      console.log('[MusicBot] joined 100ms room, adding audio track...')

      // Replace the default (fake) mic track with our custom audio source
      try {
        await hmsActions.addTrack(customAudioTrack, 'audio')
      } catch (err) {
        console.warn('[MusicBot] addTrack fallback:', err.message)
      }

      window.botControl = botControl
      console.log('[MusicBot] controls ready — audio publishing to room')
    }

    init().catch((err) => {
      console.error('[MusicBot] Init failed:', err?.message || String(err))
      window.botError = err?.message || String(err)
    })

    return () => {
      doCleanup()
      if (hmsRef.current) hmsRef.current.leave().catch(() => {})
    }
  }, [])

  return (
    <div style={{
      background: '#000', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#333', fontFamily: 'monospace', fontSize: 14,
    }}>
      NrithyaHolics Music Bot
    </div>
  )
}
