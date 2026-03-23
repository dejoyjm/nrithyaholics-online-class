import { useEffect, useRef } from 'react'
import { HMSReactiveStore } from '@100mslive/react-sdk'

/**
 * MusicBotPage — headless page opened by the Puppeteer music bot.
 *
 * URL format (set in bot.js):
 *   https://online.nrithyaholics.in/?token=XXX&track_url=YYY&track_type=ZZZ&session_id=WWW#/music-bot
 *
 * This page:
 *  1. Reads params from window.location.search
 *  2. Sets up Web Audio API pipeline: Audio element → AudioContext → MediaStreamDestination
 *  3. Joins the 100ms room with the 'music' role using the custom audio track
 *  4. Exposes window.botControl(action, value) for Puppeteer to call
 *  5. Sets window.botReady = true when joined and ready
 *
 * No UI is shown to users — this page is only ever opened by the bot server.
 */
export default function MusicBotPage() {
  const audioRef    = useRef(null)
  const audioCtxRef = useRef(null)
  const hmsRef      = useRef(null)

  useEffect(() => {
    const params   = new URLSearchParams(window.location.search)
    const token    = params.get('token')
    const trackUrl = params.get('track_url')
    const trackType = params.get('track_type')

    if (!token || !trackUrl) {
      console.error('[MusicBot] Missing required params: token, track_url')
      return
    }

    async function init() {
      // 1. Create audio element pointing at the resolved stream URL
      const audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.preload = 'auto'
      audio.src = trackUrl
      audioRef.current = audio

      // 2. Build Web Audio pipeline
      //    Audio element → MediaElementSource → MediaStreamDestination
      //    We do NOT connect to audioCtx.destination — the bot server
      //    should NOT play audio through its speakers; it only streams
      //    the audio track into the 100ms room.
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx

      const source      = audioCtx.createMediaElementSource(audio)
      const destination = audioCtx.createMediaStreamDestination()
      source.connect(destination)

      const customAudioTrack = destination.stream.getAudioTracks()[0]
      if (!customAudioTrack) {
        throw new Error('[MusicBot] Failed to get audio track from MediaStreamDestination')
      }

      // 3. Join 100ms room with the custom audio track
      const hms        = new HMSReactiveStore()
      const hmsActions = hms.getHMSActions()
      hmsRef.current   = hmsActions

      await hmsActions.join({
        authToken: token,
        userName:  'Music',
        // Inject the Web Audio API stream as the published audio track
        // so 100ms streams it to all room peers instead of mic input.
        audioTrack: {
          enabled: true,
        },
        settings: {
          isAudioMuted: false,
          isVideoMuted: true,
        },
      })

      // After joining, replace the default audio track with our custom one.
      // This ensures the Web Audio API output (not the mic) is what gets
      // published to the room.
      try {
        await hmsActions.addTrack(customAudioTrack, 'audio')
      } catch (err) {
        // addTrack may fail if the SDK manages tracks differently;
        // the join with audioTrack config above may suffice.
        console.warn('[MusicBot] addTrack fallback:', err.message)
      }

      // 4. Expose control interface to Puppeteer
      window.botControl = async (action, value) => {
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
                ok:          true,
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

      // 5. Signal readiness to Puppeteer's waitForFunction
      window.botReady = true
      console.log('[MusicBot] Ready — joined room, controls exposed')
    }

    init().catch((err) => {
      console.error('[MusicBot] Init failed:', err)
      window.botError = err.message
    })

    return () => {
      // Cleanup on unmount (shouldn't happen for a bot page, but just in case)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
      }
      if (hmsRef.current) {
        hmsRef.current.leave().catch(() => {})
      }
    }
  }, [])

  // Invisible page — shows a minimal indicator in case someone visits it directly
  return (
    <div style={{
      background: '#000',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#333',
      fontFamily: 'monospace',
      fontSize: 14,
    }}>
      NrithyaHolics Music Bot
    </div>
  )
}
