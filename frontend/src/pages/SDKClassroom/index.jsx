import { useState, useEffect, useRef } from 'react'
import {
  HMSRoomProvider,
  useHMSActions,
  useHMSStore,
  useVideo,
  selectPeers,
  selectLocalPeer,
  selectIsConnectedToRoom,
  selectPeerScreenSharing,
  selectScreenShareByPeerID,
  selectVideoTrackByPeerID,
} from '@100mslive/react-sdk'
import { supabase } from '../../lib/supabase'
import PeerTile from './PeerTile'
import Controls from './Controls'
import RecordingBanner from './RecordingBanner'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const WARN_BEFORE_SECS = 10 * 60   // 10 minutes
const CRITICAL_BEFORE_SECS = 5 * 60 // 5 minutes

// ─────────────────────────────────────────────────────────────────
// Status screens
// ─────────────────────────────────────────────────────────────────

function FetchingScreen({ session }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      {session?.cover_photo_url && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${session.cover_photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.08 }} />
      )}
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 900, color: '#faf7f2', marginBottom: 8 }}>
          Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
        </div>
        <div style={{ fontSize: 15, color: '#a09890', marginBottom: 32 }}>{session?.title}</div>
        <div style={{ width: 44, height: 44, border: '3px solid #c8430a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'nhSpin 1s linear infinite', margin: '0 auto 16px' }} />
        <div style={{ fontSize: 14, color: '#7a6e65' }}>Setting up your classroom...</div>
      </div>
      <style>{'@keyframes nhSpin { to { transform: rotate(360deg); } }'}</style>
    </div>
  )
}

function TooEarlyScreen({ session, countdown, onLeave }) {
  const scheduledTime = session?.scheduled_at
    ? new Date(session.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    : ''
  const scheduledDate = session?.scheduled_at
    ? new Date(session.scheduled_at).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
    : ''
  return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
      {session?.cover_photo_url && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${session.cover_photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.06 }} />
      )}
      <div style={{ position: 'relative', textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>⏰</div>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 24, fontWeight: 800, color: '#faf7f2', marginBottom: 8 }}>
          Class hasn't started yet
        </div>
        <div style={{ fontSize: 14, color: '#a09890', marginBottom: 24, lineHeight: 1.6 }}>
          <strong style={{ color: '#faf7f2' }}>{session?.title}</strong><br />
          {scheduledDate} at {scheduledTime}
        </div>
        {countdown && (
          <div style={{ fontSize: 48, fontWeight: 800, color: '#c8430a', fontFamily: 'Georgia, serif', marginBottom: 8, letterSpacing: 2 }}>
            {countdown}
          </div>
        )}
        <div style={{ fontSize: 13, color: '#7a6e65', marginBottom: 32 }}>
          You'll be let in before the class starts
        </div>
        <button onClick={onLeave} style={{ background: 'transparent', border: '1px solid #3a2e2e', color: '#a09890', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
          Go Back
        </button>
      </div>
    </div>
  )
}

function BetweenPartsScreen({ session, nextPartNumber, countdown, onLeave }) {
  const completedPart = nextPartNumber != null ? nextPartNumber - 1 : null
  return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
      {session?.cover_photo_url && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${session.cover_photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.06 }} />
      )}
      <div style={{ position: 'relative', textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 24, fontWeight: 800, color: '#faf7f2', marginBottom: 8 }}>
          {completedPart != null ? `Part ${completedPart} Complete` : 'Part Complete'}
        </div>
        <div style={{ fontSize: 14, color: '#a09890', marginBottom: 24, lineHeight: 1.6 }}>
          {nextPartNumber != null ? `Part ${nextPartNumber} starts in` : 'Next part starts in'}
        </div>
        {countdown && (
          <div style={{ fontSize: 48, fontWeight: 800, color: '#c8430a', fontFamily: 'Georgia, serif', marginBottom: 8, letterSpacing: 2 }}>
            {countdown}
          </div>
        )}
        <div style={{ fontSize: 13, color: '#7a6e65', marginBottom: 32 }}>
          You'll be let back in automatically when the window opens
        </div>
        <button onClick={onLeave} style={{ background: 'transparent', border: '1px solid #3a2e2e', color: '#a09890', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
          ← Back to session
        </button>
      </div>
    </div>
  )
}

function EndedScreen({ sessionId, onLeave }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
      <div style={{ fontSize: 56 }}>🎭</div>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 24, fontWeight: 700, color: '#faf7f2', textAlign: 'center' }}>
        This class has ended
      </div>
      <div style={{ fontSize: 14, color: '#7a6e65', textAlign: 'center' }}>Hope you enjoyed the session!</div>
      <button
        onClick={() => { sessionStorage.setItem(`nrh_left_${sessionId}`, Date.now().toString()); onLeave() }}
        style={{ marginTop: 8, background: '#c8430a', border: 'none', color: 'white', padding: '12px 28px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
      >
        Back to Sessions
      </button>
    </div>
  )
}

function ErrorScreen({ errorMsg, onLeave, onRetry }) {
  const isAlreadyJoined = errorMsg.toLowerCase().includes('another device')
  return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
      <div style={{ fontSize: 48 }}>{isAlreadyJoined ? '📱' : '⚠️'}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#faf7f2', textAlign: 'center' }}>
        {isAlreadyJoined ? 'Already in class on another device' : "Couldn't join classroom"}
      </div>
      <div style={{ fontSize: 14, color: '#a09890', textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>{errorMsg}</div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button onClick={onLeave} style={{ background: 'transparent', border: '1px solid #3a2e2e', color: '#a09890', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
          Go Back
        </button>
        {!isAlreadyJoined && (
          <button onClick={onRetry} style={{ background: '#c8430a', border: 'none', color: 'white', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            Try Again
          </button>
        )}
      </div>
    </div>
  )
}

function LeftScreen({ sessionId, onLeave }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ fontSize: 56 }}>👋</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#faf7f2', fontFamily: 'Georgia, serif' }}>You've left the class</div>
      <div style={{ fontSize: 14, color: '#7a6e65' }}>Hope you enjoyed the session!</div>
      <button
        onClick={() => { sessionStorage.setItem(`nrh_left_${sessionId}`, Date.now().toString()); onLeave() }}
        style={{ marginTop: 16, background: '#c8430a', border: 'none', color: 'white', padding: '12px 28px', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}
      >
        Back to Sessions
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Banner styles
// ─────────────────────────────────────────────────────────────────

const BANNER_STYLES = {
  calm:      { bg: '#1a2535', border: '#2a3a55', color: '#93c5fd', icon: '🕐', blink: false },
  countdown: { bg: '#2d1f00', border: '#d97706', color: '#fcd34d', icon: '⏱️', blink: false },
  overtime:  { bg: '#2d1500', border: '#ea580c', color: '#fb923c', icon: '⏰', blink: false },
  critical:  { bg: '#2d0000', border: '#dc2626', color: '#fca5a5', icon: '🔴', blink: true  },
}

// ─────────────────────────────────────────────────────────────────
// DraggableOverlay — for self-view guest grid
// Initial position: bottom-right corner. Follows pointer drag.
// ─────────────────────────────────────────────────────────────────

function DraggableOverlay({ children }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)   // null = use CSS right/bottom default
  const origin = useRef(null)

  function onPointerDown(e) {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    origin.current = { mouseX: e.clientX, mouseY: e.clientY, elemLeft: rect.left, elemTop: rect.top }
    ref.current.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    if (!origin.current) return
    setPos({
      left: origin.current.elemLeft + (e.clientX - origin.current.mouseX),
      top:  origin.current.elemTop  + (e.clientY - origin.current.mouseY),
    })
  }

  function onPointerUp() { origin.current = null }

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        ...(pos ? { left: pos.left, top: pos.top } : { right: 12, bottom: 8 }),
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'none',
        zIndex: 10,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// HostPlaceholder — top zone when no host has joined yet
// ─────────────────────────────────────────────────────────────────

function HostPlaceholder() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: '#c8430a11', border: '2px dashed #c8430a44',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34,
      }}>
        🎭
      </div>
      <div style={{ fontSize: 14, color: '#7a6e65', textAlign: 'center' }}>
        Waiting for instructor to join...
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Inner component — must be a child of HMSRoomProvider
// ─────────────────────────────────────────────────────────────────

function SDKClassroomInner({ sessionId, session: sessionData, onLeave }) {
  // ── HMS store selectors ──────────────────────────────────────
  const hmsActions        = useHMSActions()
  const peers             = useHMSStore(selectPeers)
  const localPeer         = useHMSStore(selectLocalPeer)
  const isConnected       = useHMSStore(selectIsConnectedToRoom)
  const screenSharePeer   = useHMSStore(selectPeerScreenSharing)
  const screenShareTrack  = useHMSStore(selectScreenShareByPeerID(screenSharePeer?.id))
  const localVideoTrack   = useHMSStore(selectVideoTrackByPeerID(localPeer?.id))

  // ── Video refs ───────────────────────────────────────────────
  // selfVideoRef: plain ref — attached manually via hmsActions.attachVideo so
  //   the attach fires AFTER the element mounts (useVideo only re-fires on trackId
  //   change, not on element mount, so it can't handle conditional rendering).
  // screenShareRef: uses useVideo — screen share track ID changes when sharing
  //   starts, so useVideo's trackId-dep effect fires at the right time.
  const selfVideoRef                  = useRef(null)
  const { videoRef: screenShareRef }  = useVideo({ trackId: screenShareTrack?.id })

  // ── Token / join state ───────────────────────────────────────
  const [status, setStatus]           = useState('fetching')
  const [errorMsg, setErrorMsg]       = useState('')
  const [opensAt, setOpensAt]         = useState(null)
  const [countdown, setCountdown]     = useState('')
  const [nextPartNumber, setNextPartNumber] = useState(null)
  const [roomToken, setRoomToken]     = useState(null)
  const [userRole, setUserRole]       = useState(null)
  const [userName, setUserName]       = useState('')
  const [tokenExpiresAt, setTokenExpiresAt] = useState(null)
  const [sessionEndsAt, setSessionEndsAt]   = useState(null)

  // ── Banner state ─────────────────────────────────────────────
  const [banner, setBanner] = useState(null)

  // ── Week 2: layout state ─────────────────────────────────────
  const [viewMode, setViewMode] = useState('self')  // 'class' | 'gallery' | 'self'
  const [mirrored, setMirrored] = useState(true)

  // ── Week 3: recording state ───────────────────────────────────
  const [recordingState, setRecordingState]         = useState('idle') // 'idle'|'recording'|'paused'|'stopped'
  const [recordingId, setRecordingId]               = useState(null)
  const [performanceMode, setPerformanceMode]       = useState(false)
  const [performanceCountdown, setPerformanceCountdown] = useState(null) // null | 3 | 2 | 1
  const [perfRecordingId, setPerfRecordingId]       = useState(null)

  // ── Week 4: music bot state ───────────────────────────────────
  const [musicBotStatus, setMusicBotStatus] = useState(null) // null | 'starting' | 'playing' | 'paused' | 'stopped'
  const [musicBotId, setMusicBotId]         = useState(null)
  const [musicPosition, setMusicPosition]   = useState(0)
  const [musicDuration, setMusicDuration]   = useState(0)
  const [musicVolume, setMusicVolume]       = useState(70)
  const [overlayPos, setOverlayPos]         = useState({ x: null, y: null })
  const [hoveredPeerId, setHoveredPeerId]   = useState(null)

  // ── Tab audio state ───────────────────────────────────────────
  const [tabAudioStream, setTabAudioStream] = useState(null)
  const [tabAudioTrack, setTabAudioTrack]   = useState(null)
  const [tabAudioSharing, setTabAudioSharing] = useState(false)

  const joinedRef           = useRef(false)
  const countdownRef        = useRef(null)
  const endTimerRef         = useRef(null)
  const bannerTimerRef      = useRef(null)
  const recordingStartedRef = useRef(false)

  const session = sessionData
  const isHost  = userRole === 'host'

  // ── Layout helpers ───────────────────────────────────────────
  const isMobile   = window.innerWidth < 768
  const stripTileW = isMobile ? 120 : 160
  const stripTileH = isMobile ? 90  : 120

  // Peer categories
  const hostPeer   = peers.find(p => p.roleName === 'host')
  const guestPeers = peers.filter(p => p.roleName !== 'host')

  // Strip: local guest first, then others
  const stripPeers = [
    ...guestPeers.filter(p => p.isLocal),
    ...guestPeers.filter(p => !p.isLocal),
  ]

  // Self-view overlay: all remote peers (host + guests), local is the full-screen video
  const overlayPeers = peers.filter(p => !p.isLocal)

  // Screen share PiP
  const hasScreenShare    = !!(screenSharePeer && screenShareTrack?.enabled)
  const localVideoOn      = !!(localVideoTrack?.enabled)
  const localInitials     = localPeer?.name
    ? localPeer.name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  // ── Initial token fetch + cleanup ────────────────────────────
  useEffect(() => {
    fetchToken()
    return () => {
      clearInterval(countdownRef.current)
      clearTimeout(endTimerRef.current)
      clearInterval(bannerTimerRef.current)
    }
  }, [])

  // ── Countdown timer for too_early / between_parts ────────────
  useEffect(() => {
    if ((status !== 'too_early' && status !== 'between_parts') || !opensAt) return
    clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      const secsLeft = Math.max(0, opensAt - Math.floor(Date.now() / 1000))
      if (secsLeft === 0) { clearInterval(countdownRef.current); fetchToken(); return }
      const hrs  = Math.floor(secsLeft / 3600)
      const mins = Math.floor((secsLeft % 3600) / 60)
      const secs = secsLeft % 60
      if (hrs > 0) setCountdown(`${hrs}h ${mins}m ${secs}s`)
      else setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(countdownRef.current)
  }, [status, opensAt])

  // ── Join room once token is ready ────────────────────────────
  useEffect(() => {
    if (status !== 'ready' || !roomToken || joinedRef.current) return
    joinedRef.current = true
    hmsActions.join({
      authToken: roomToken,
      userName,
      settings: {
        isAudioMuted: true,
        isVideoMuted: false,
      },
    }).catch((err) => {
      console.error('HMS join error:', err)
      setStatus('error')
      setErrorMsg('Failed to join the room. Please try again.')
    })
  }, [status, roomToken])

  // ── 4-phase timer banner (starts once connected) ─────────────
  useEffect(() => {
    if (!isConnected || !tokenExpiresAt || !sessionEndsAt) return

    clearTimeout(endTimerRef.current)
    clearInterval(bannerTimerRef.current)

    const now = Math.floor(Date.now() / 1000)
    const msUntilHardEnd = (tokenExpiresAt - now) * 1000
    if (msUntilHardEnd <= 0) { handleLeave(); return }

    endTimerRef.current = setTimeout(() => handleLeave(), msUntilHardEnd)

    const scheduledEndStr = new Date(sessionEndsAt * 1000).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
    const fmt = (secs) => {
      const m = Math.floor(Math.abs(secs) / 60)
      const s = Math.abs(secs) % 60
      return `${m}:${s.toString().padStart(2, '0')}`
    }
    const tick = () => {
      const nowSec = Math.floor(Date.now() / 1000)
      const secsUntilHardEnd      = tokenExpiresAt - nowSec
      const secsUntilScheduledEnd = sessionEndsAt - nowSec
      const secsOvertime          = nowSec - sessionEndsAt
      if (secsUntilHardEnd <= 0) { clearInterval(bannerTimerRef.current); setBanner(null); return }
      if      (secsUntilHardEnd      <= CRITICAL_BEFORE_SECS) setBanner({ phase: 'critical',  text: `Auto-disconnect in ${fmt(secsUntilHardEnd)}` })
      else if (secsOvertime          >  0)                    setBanner({ phase: 'overtime',   text: `Exceeded scheduled time by ${fmt(secsOvertime)}` })
      else if (secsUntilScheduledEnd <= WARN_BEFORE_SECS)     setBanner({ phase: 'countdown',  text: `${fmt(secsUntilScheduledEnd)} remaining in class` })
      else                                                     setBanner({ phase: 'calm',       text: `Class runs until ${scheduledEndStr}` })
    }
    tick()
    bannerTimerRef.current = setInterval(tick, 1000)
    return () => { clearTimeout(endTimerRef.current); clearInterval(bannerTimerRef.current) }
  }, [isConnected, tokenExpiresAt, sessionEndsAt])

  // ── Self-view video attach / detach ───────────────────────────
  // useVideo can't handle a conditionally-rendered element because its internal
  // effect only re-fires on trackId change, not on element mount. We attach
  // manually here so the effect fires after React has painted the self-view
  // video element into the DOM (selfVideoRef.current is live in useEffect).
  const localVideoTrackId = localPeer?.videoTrack
  useEffect(() => {
    if (viewMode !== 'self' || !selfVideoRef.current || !localVideoTrackId) return
    hmsActions.attachVideo(localVideoTrackId, selfVideoRef.current)
    return () => {
      hmsActions.detachVideo(localVideoTrackId, selfVideoRef.current)
    }
  }, [viewMode, localVideoTrackId])

  // ── Recording API helper ─────────────────────────────────────
  // Defined before the auto-start useEffect that calls it.
  async function callRecordingControl(action, options = {}) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/recording-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ session_id: sessionId, action, ...options }),
      })
      return await res.json()
    } catch { return { success: false } }
  }

  // ── Auto-start recording when host connects ───────────────────
  useEffect(() => {
    console.log('[recording-debug] effect ran:', { isHost, isConnected, started: recordingStartedRef.current })
    if (!isHost || !isConnected || recordingStartedRef.current) return
    recordingStartedRef.current = true
    callRecordingControl('start', { recorder_role: 'recorder-host' }).then(data => {
      if (data.success) {
        // Normal path: start succeeded, recording_id returned
        setRecordingId(data.recording_id)   // may be null if 100ms omits it
        setRecordingState('recording')
      } else if (data.error?.toLowerCase().includes('already started')) {
        // 409 on rejoin: Beam is already recording from the previous connection.
        // We don't have the recording_id, so pause is a no-op (guard in pauseRecording).
        setRecordingState('recording')
      }
    })
  }, [isHost, isConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore music bot state on host rejoin ────────────────────
  useEffect(() => {
    if (!isHost || !isConnected) return
    supabase
      .from('sessions')
      .select('music_bot_id, music_bot_status')
      .eq('id', sessionId)
      .single()
      .then(({ data }) => {
        if (data?.music_bot_status === 'playing' || data?.music_bot_status === 'starting') {
          setMusicBotId(data.music_bot_id)
          setMusicBotStatus(data.music_bot_status)
        }
      })
  }, [isHost, isConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-stop music when session ends ────────────────────────
  useEffect(() => {
    if (status === 'left' && musicBotId) {
      handleStopMusic()
    }
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Music position polling (every 2s while playing) ──────────
  useEffect(() => {
    if (musicBotStatus !== 'playing') return
    const interval = setInterval(async () => {
      const result = await callMusicControl('status')
      if (result && !result.error) {
        setMusicPosition(result.currentTime || 0)
        setMusicDuration(result.duration || 0)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [musicBotStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Token fetch ───────────────────────────────────────────────
  async function fetchToken() {
    setStatus('fetching')
    joinedRef.current = false
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      const token = authSession?.access_token

      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          session_id: sessionId,
          recently_left: (() => {
            const leftAt = sessionStorage.getItem(`nrh_left_${sessionId}`)
            return leftAt ? (Date.now() - parseInt(leftAt)) < 90000 : false
          })(),
        }),
      })

      const data = await res.json()

      if (data.error === 'too_early')     { setOpensAt(data.opens_at); setStatus('too_early'); return }
      if (data.error === 'between_parts') { setNextPartNumber(data.next_part); setOpensAt(data.opens_at); setStatus('between_parts'); return }
      if (data.error === 'session_ended') { setStatus('ended'); return }
      if (data.error === 'already_joined') {
        setStatus('error')
        setErrorMsg('You appear to be in this class on another device or browser tab. Please close the other session first, then tap "Try Again" below. If you just left, wait 30 seconds before rejoining.')
        return
      }
      if (!res.ok || !data.token) { setStatus('error'); setErrorMsg(data.error || 'Could not get room access. Please try again.'); return }

      console.log('SDKClassroom: token received, joining room', { role: data.role, room_id: data.room_id })
      setRoomToken(data.token)
      setUserName(data.user_name)
      setUserRole(data.role)
      setTokenExpiresAt(data.token_expires_at)
      setSessionEndsAt(data.session_ends_at)
      setStatus('ready')
    } catch (err) {
      console.error('Token fetch error:', err)
      setStatus('error')
      setErrorMsg('Failed to connect. Please check your connection and try again.')
    }
  }

  // ── Leave / end ───────────────────────────────────────────────
  async function handleLeave() {
    clearTimeout(endTimerRef.current)
    clearInterval(bannerTimerRef.current)
    if (tabAudioSharing) await handleStopTabAudio()
    try { await hmsActions.leave() } catch { /* leave can throw if already disconnected */ }
    sessionStorage.setItem(`nrh_left_${sessionId}`, Date.now().toString())
    setStatus('left')
  }

  async function handleEndSession() {
    clearTimeout(endTimerRef.current)
    clearInterval(bannerTimerRef.current)
    if (tabAudioSharing) await handleStopTabAudio()
    try { await callRecordingControl('stop') } catch { /* ignore */ }
    if (perfRecordingId) {
      try { await callRecordingControl('stop', { recording_id: perfRecordingId }) } catch { /* ignore */ }
    }
    try { await hmsActions.endRoom(false, 'Session ended by host') } catch { }
    sessionStorage.setItem(`nrh_left_${sessionId}`, Date.now().toString())
    setStatus('left')
  }

  // ── Music bot helpers ─────────────────────────────────────────
  async function getMusicAuthToken() {
    const { data: { session: authSession } } = await supabase.auth.getSession()
    return authSession?.access_token
  }

  async function callMusicControl(action, value) {
    const token = await getMusicAuthToken()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/music-bot-control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_id: sessionId, action, value }),
    })
    return res.json()
  }

  async function handleStartMusic() {
    setMusicBotStatus('starting')
    try {
      const token = await getMusicAuthToken()
      // Stop any existing bot first — prevents double bot if host rejoins
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/stop-music-bot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ session_id: sessionId }),
        })
      } catch { /* ignore — bot may not exist */ }
      // Now start fresh
      const res = await fetch(`${SUPABASE_URL}/functions/v1/start-music-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId }),
      })
      const data = await res.json()
      if (data.bot_id) {
        setMusicBotId(data.bot_id)
        setMusicBotStatus('playing')
      }
    } catch (err) {
      console.error('Failed to start music bot:', err)
      setMusicBotStatus(null)
    }
  }

  async function handlePauseMusic() {
    await callMusicControl('pause')
    setMusicBotStatus('paused')
  }

  async function handleResumeMusic() {
    await callMusicControl('resume')
    setMusicBotStatus('playing')
  }

  async function handleSeekMusic(seconds) {
    await callMusicControl('seek', seconds)
    setMusicPosition(seconds)
  }

  async function handleVolumeMusic(vol) {
    await callMusicControl('volume', vol)
    setMusicVolume(vol)
  }

  async function handleStopMusic() {
    try {
      const token = await getMusicAuthToken()
      await fetch(`${SUPABASE_URL}/functions/v1/stop-music-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId }),
      })
    } catch (err) {
      console.error('Failed to stop music bot:', err)
    }
    setMusicBotStatus('stopped')
    setMusicBotId(null)
  }

  // ── Tab audio helpers ─────────────────────────────────────────
  async function handleStartTabAudio() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: false })
      const audioTrack = stream.getAudioTracks()[0]
      if (!audioTrack) {
        alert('No audio track found. Make sure to select a tab and enable "Share tab audio".')
        return
      }
      await hmsActions.addTrack(audioTrack, 'audio')
      setTabAudioStream(stream)
      setTabAudioTrack(audioTrack)
      setTabAudioSharing(true)
      audioTrack.onended = () => handleStopTabAudio()
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('Tab audio error:', err)
      }
    }
  }

  async function handleStopTabAudio() {
    if (tabAudioTrack) {
      try { await hmsActions.removeTrack(tabAudioTrack.id) } catch {}
      tabAudioTrack.stop()
    }
    if (tabAudioStream) {
      tabAudioStream.getTracks().forEach(t => t.stop())
    }
    setTabAudioStream(null)
    setTabAudioTrack(null)
    setTabAudioSharing(false)
  }

  async function handleForceReset() {
    if (!window.confirm('Reset the music bot? This will stop it and clear all state.')) return
    try {
      const token = await getMusicAuthToken()
      await fetch(`${SUPABASE_URL}/functions/v1/stop-music-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId }),
      })
    } catch (err) {
      console.error('Force reset error:', err)
    }
    await new Promise(r => setTimeout(r, 2000))
    setMusicBotStatus(null)
    setMusicBotId(null)
    setMusicPosition(0)
    setMusicDuration(0)
    setMusicVolume(70)
  }

  // ── Recording helpers ─────────────────────────────────────────
  // recordingId may be null (100ms sometimes omits it in start response).
  // Always call the edge function — it looks up the active recording by room_id server-side.
  async function pauseRecording() {
    const opts = recordingId ? { recording_id: recordingId } : {}
    const data = await callRecordingControl('pause', opts)
    if (data.success) setRecordingState('paused')
  }

  async function resumeRecording() {
    const opts = recordingId ? { recording_id: recordingId } : {}
    const data = await callRecordingControl('resume', opts)
    if (data.success) setRecordingState('recording')
  }

  function startPerformanceMode() {
    setPerformanceCountdown(3)
    let count = 3
    const timer = setInterval(() => {
      count -= 1
      if (count <= 0) {
        clearInterval(timer)
        setPerformanceCountdown(null)
        setPerformanceMode(true)
        callRecordingControl('start', { recorder_role: 'recorder-all' }).then(data => {
          if (data.recording_id) setPerfRecordingId(data.recording_id)
        })
      } else {
        setPerformanceCountdown(count)
      }
    }, 1000)
  }

  async function stopPerformanceMode() {
    setPerformanceMode(false)
    if (perfRecordingId) {
      await callRecordingControl('stop', { recording_id: perfRecordingId })
    }
    setPerfRecordingId(null)
  }

  // ── Status screens ────────────────────────────────────────────
  if (status === 'fetching')      return <FetchingScreen session={session} />
  if (status === 'too_early')    return <TooEarlyScreen session={session} countdown={countdown} onLeave={onLeave} />
  if (status === 'between_parts') return <BetweenPartsScreen session={session} nextPartNumber={nextPartNumber} countdown={countdown} onLeave={onLeave} />
  if (status === 'ended')        return <EndedScreen sessionId={sessionId} onLeave={onLeave} />
  if (status === 'error')     return <ErrorScreen errorMsg={errorMsg} onLeave={onLeave} onRetry={fetchToken} />
  if (status === 'left')      return <LeftScreen sessionId={sessionId} onLeave={onLeave} />

  // ── Live room view ────────────────────────────────────────────
  const bs = banner ? BANNER_STYLES[banner.phase] : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f0c0c', display: 'flex', flexDirection: 'column', zIndex: 9999 }}>

      {/* ── Top bar ─────────────────────────────────────── */}
      <div style={{
        background: '#1a1a1a',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #2a2a2a',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 900, color: '#faf7f2' }}>
            Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
          </div>
          <div style={{ width: 1, height: 16, background: '#3a3a3a' }} />
          <div style={{ fontSize: 13, color: '#a09890', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session?.title}
          </div>
          {isConnected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'nhPulse 2s infinite' }} />
              <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>LIVE</span>
            </div>
          )}
          {isHost && (
            <span style={{ fontSize: 11, background: '#c8430a22', color: '#c8430a', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>🎭 HOST</span>
          )}
          {isHost && recordingState === 'recording' && (
            <span style={{ fontSize: 11, background: '#dc262622', color: '#fca5a5', padding: '2px 8px', borderRadius: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626', display: 'inline-block', animation: 'nhPulse 1.5s infinite' }} />
              REC
            </span>
          )}
        </div>
        {peers.length > 0 && (
          <span style={{ fontSize: 12, color: '#7a6e65' }}>{peers.length} in room</span>
        )}
      </div>

      {/* ── 4-phase timer banner ─────────────────────────── */}
      {banner && bs && (
        <div style={{
          background: bs.bg,
          borderBottom: `1px solid ${bs.border}`,
          padding: '6px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          flexShrink: 0,
          animation: bs.blink ? 'nhFlash 1.2s infinite' : 'none',
        }}>
          <span style={{ fontSize: 14 }}>{bs.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: bs.color, letterSpacing: 0.3 }}>
            {banner.text}
          </span>
        </div>
      )}

      {/* ── Recording paused banner ──────────────────────── */}
      <RecordingBanner recordingState={recordingState} onResume={resumeRecording} />

      {/* ── Connecting spinner ───────────────────────────── */}
      {!isConnected && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{ width: 44, height: 44, border: '3px solid #c8430a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'nhSpin 1s linear infinite' }} />
          <div style={{ fontSize: 14, color: '#7a6e65' }}>Joining room...</div>
        </div>
      )}

      {/* ── Content area ─────────────────────────────────── */}
      {isConnected && (
        performanceMode
          // ════════════════════════════════════════════════
          // PERFORMANCE MODE — equal grid of all peers
          // ════════════════════════════════════════════════
          ? (
            <div style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 160 : 220}px, 1fr))`,
              gap: 8,
              padding: 8,
              overflow: 'auto',
              alignContent: 'start',
            }}>
              {peers.map(peer => (
                <div key={peer.id} style={{ aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden' }}>
                  <PeerTile peer={peer} mirrored={mirrored} />
                </div>
              ))}
            </div>
          )
          : viewMode === 'gallery'
          // ════════════════════════════════════════════════
          // GALLERY MODE — equal grid of all peers
          // ════════════════════════════════════════════════
          ? (() => {
            const n = peers.length
            const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3
            return (
              <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: 8,
                padding: 8,
                overflow: 'auto',
                alignContent: 'start',
              }}>
                {peers.map(peer => (
                  <div
                    key={peer.id}
                    style={{ aspectRatio: '9/16', borderRadius: 10, overflow: 'hidden', position: 'relative' }}
                    onMouseEnter={() => setHoveredPeerId(peer.id)}
                    onMouseLeave={() => setHoveredPeerId(null)}
                  >
                    <PeerTile peer={peer} mirrored={mirrored} />
                    {isHost && !peer.isLocal && hoveredPeerId === peer.id && (
                      <button
                        onClick={() => hmsActions.removePeer(peer.id, 'Removed by host')}
                        style={{ position: 'absolute', top: 8, right: 8, fontSize: 11, padding: '2px 6px', background: '#450a0a', color: '#fca5a5', border: 'none', borderRadius: 4, cursor: 'pointer', zIndex: 10 }}
                      >
                        ❌
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          })()
          : viewMode === 'self'
          // ════════════════════════════════════════════════
          // SELF-VIEW MODE — full-screen local video + draggable remote overlay
          // ════════════════════════════════════════════════
          ? (
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0a0808' }}>

              {/* Full-screen local video */}
              <video
                ref={selfVideoRef}
                autoPlay
                muted
                playsInline
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: mirrored ? 'scaleX(-1)' : 'none',
                  display: localVideoOn ? 'block' : 'none',
                }}
              />

              {/* Avatar fallback when camera is off */}
              {!localVideoOn && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <div style={{
                    width: 96, height: 96, borderRadius: '50%',
                    background: '#c8430a22', border: '2px solid #c8430a55',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 36, fontWeight: 700, color: '#c8430a', fontFamily: 'Georgia, serif',
                  }}>
                    {localInitials}
                  </div>
                  <div style={{ fontSize: 14, color: '#a09890' }}>Camera is off</div>
                </div>
              )}

              {/* Self-view label */}
              <div style={{ position: 'absolute', top: 12, left: 12, fontSize: 11, color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.5)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                YOU — {mirrored ? 'mirrored' : 'unmirrored'}
              </div>

              {/* Draggable guest grid overlay */}
              <DraggableOverlay>
                <div style={{
                  background: 'rgba(0,0,0,0.78)',
                  borderRadius: 12,
                  padding: 8,
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  maxHeight: isMobile ? 220 : 300,
                  overflowY: 'auto',
                }}>
                  <div style={{ fontSize: 10, color: '#7a6e65', textAlign: 'center', fontWeight: 700, letterSpacing: 0.5, paddingBottom: 2 }}>
                    PARTICIPANTS ({overlayPeers.length})
                  </div>
                  {overlayPeers.length === 0 ? (
                    <div style={{ width: stripTileW, padding: '10px 8px', textAlign: 'center', color: '#7a6e65', fontSize: 12 }}>
                      No guests yet
                    </div>
                  ) : (
                    overlayPeers.map(peer => (
                      <div key={peer.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
                        <div style={{ width: stripTileW, height: stripTileH, borderRadius: 8, overflow: 'hidden' }}>
                          <PeerTile peer={peer} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 2 }}>
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: 11, color: '#faf7f2', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: stripTileW - 40 }}>
                              {peer.name}
                            </div>
                            <div style={{ fontSize: 10, color: '#7a6e65' }}>
                              {peer.roleName}
                            </div>
                          </div>
                          {isHost && !peer.isLocal && (
                            <button
                              onClick={() => hmsActions.removePeer(peer.id, 'Removed by host')}
                              style={{ fontSize: 11, padding: '2px 6px', background: '#450a0a', color: '#fca5a5', border: 'none', borderRadius: 4, cursor: 'pointer', marginLeft: 6, flexShrink: 0 }}
                            >
                              ❌
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </DraggableOverlay>
            </div>
          )
          // ════════════════════════════════════════════════
          // CLASS VIEW (default for everyone)
          // Two-zone: host large on top, guests in bottom strip
          // ════════════════════════════════════════════════
          : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

              {/* TOP ZONE — host tile, always prominent */}
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
                {/* key=viewMode forces PeerTile to fully remount on every mode switch,
                    giving useVideo a clean lifecycle after selfVideoRef cleanup */}
                <div key={viewMode} style={{ position: 'absolute', inset: 0 }}>
                  {hostPeer
                    ? <PeerTile peer={hostPeer} mirrored={mirrored} />
                    : <HostPlaceholder />
                  }
                </div>

                {/* Screen share PiP — corner overlay, never replaces host tile */}
                {hasScreenShare && (
                  <div style={{
                    position: 'absolute',
                    bottom: 12,
                    right: 12,
                    width: isMobile ? 140 : 200,
                    height: isMobile ? 79 : 112,
                    background: '#000',
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid #3a3a3a',
                    zIndex: 5,
                  }}>
                    <video
                      ref={screenShareRef}
                      autoPlay
                      muted
                      playsInline
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                    <div style={{ position: 'absolute', bottom: 4, left: 6, fontSize: 9, color: '#a09890', fontWeight: 600 }}>
                      📺 {screenSharePeer?.name}
                    </div>
                  </div>
                )}
              </div>

              {/* BOTTOM STRIP — guest peers, horizontal scroll */}
              <div style={{
                height: stripTileH + 16,
                background: '#111',
                borderTop: '1px solid #2a2a2a',
                display: 'flex',
                alignItems: 'center',
                padding: '8px',
                gap: 8,
                overflowX: 'auto',
                overflowY: 'hidden',
                flexShrink: 0,
                scrollbarWidth: 'thin',
                scrollbarColor: '#3a3a3a #111',
              }}>
                {stripPeers.length === 0 ? (
                  <div style={{ color: '#7a6e65', fontSize: 13, width: '100%', textAlign: 'center' }}>
                    Waiting for guests to join...
                  </div>
                ) : (
                  stripPeers.map(peer => (
                    <div
                      key={peer.id}
                      style={{ width: stripTileW, height: stripTileH, flexShrink: 0, borderRadius: 8, overflow: 'hidden' }}
                    >
                      <PeerTile peer={peer} mirrored={mirrored} />
                    </div>
                  ))
                )}
              </div>
            </div>
          )
      )}

      {/* ── Music bot overlay — host only ────────────────── */}
      {isHost && isConnected && (
        <MusicControls
          session={session}
          botStatus={musicBotStatus}
          position={musicPosition}
          duration={musicDuration}
          volume={musicVolume}
          onStart={handleStartMusic}
          onPause={handlePauseMusic}
          onResume={handleResumeMusic}
          onSeek={handleSeekMusic}
          onVolume={handleVolumeMusic}
          onStop={handleStopMusic}
          onReset={handleForceReset}
          pos={overlayPos}
          onDrag={setOverlayPos}
        />
      )}

      {/* ── Tab audio overlay — host + desktop only ──────── */}
      {isHost && isConnected && !isMobile && typeof navigator.mediaDevices?.getDisplayMedia === 'function' && (
        <div style={{
          position: 'absolute',
          top: 60,
          right: 16,
          background: 'rgba(15,12,12,0.92)',
          border: '1px solid rgba(200,67,10,0.4)',
          borderRadius: 12,
          padding: '10px 16px',
          zIndex: 100,
          minWidth: 220,
        }}>
          {tabAudioSharing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', display: 'inline-block', animation: 'nhPulse 1.5s infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5' }}>Tab Audio Live</span>
              </div>
              <div style={{ fontSize: 11, color: '#7a6e65' }}>Students can hear your tab audio</div>
              <button
                onClick={handleStopTabAudio}
                style={{ fontSize: 12, padding: '5px 12px', background: '#450a0a', color: '#fca5a5', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, alignSelf: 'flex-start' }}
              >
                ⏹ Stop Sharing
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={handleStartTabAudio}
                style={{ fontSize: 12, padding: '6px 12px', background: '#1a1410', color: '#faf7f2', border: '1px solid rgba(200,67,10,0.5)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, alignSelf: 'flex-start' }}
              >
                🎵 Share Tab Audio
              </button>
              <div style={{ fontSize: 11, color: '#7a6e65' }}>Desktop only — share audio from any browser tab</div>
            </div>
          )}
        </div>
      )}

      {/* ── Controls bar ────────────────────────────────── */}
      {isConnected && (
        <Controls
          isHost={isHost}
          onLeave={handleLeave}
          onEnd={handleEndSession}
          viewMode={viewMode}
          setViewMode={setViewMode}
          mirrored={mirrored}
          setMirrored={setMirrored}
          recordingState={recordingState}
          onPauseRec={pauseRecording}
          performanceMode={performanceMode}
          onStartPerformance={startPerformanceMode}
          onStopPerformance={stopPerformanceMode}
        />
      )}

      {/* ── Performance countdown overlay ────────────────── */}
      {performanceCountdown !== null && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          gap: 20,
        }}>
          <div style={{ fontSize: 13, color: '#d97706', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
            🎬 Performance Mode Starting
          </div>
          <div style={{ fontSize: 100, fontWeight: 900, color: '#faf7f2', fontFamily: 'Georgia, serif', lineHeight: 1 }}>
            {performanceCountdown}
          </div>
          <div style={{ fontSize: 13, color: '#7a6e65' }}>
            Recording will start automatically
          </div>
        </div>
      )}

      <style>{`
        @keyframes nhSpin  { to { transform: rotate(360deg); } }
        @keyframes nhFlash { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes nhPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// MusicControls — floating draggable overlay (host only)
// Copied verbatim from ClassroomPage.jsx, fetch calls use Supabase edge functions
// ─────────────────────────────────────────────────────────────────

function MusicControls({ session, botStatus, position, duration, volume, onStart, onPause, onResume, onSeek, onVolume, onStop, onReset, pos, onDrag }) {
  const [expanded, setExpanded] = useState(true)
  const overlayRef = useRef(null)

  function fmtTime(secs) {
    if (!secs || isNaN(secs)) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const progressPct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0
  const title = session?.music_track_title || 'Music'
  const truncTitle = title.length > 26 ? title.slice(0, 26) + '…' : title

  const posStyle = pos.x !== null
    ? { position: 'absolute', left: pos.x, top: pos.y, transform: 'none' }
    : { position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)' }

  function handleDragHandleDown(e) {
    e.preventDefault()
    const el = overlayRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const startX = e.touches ? e.touches[0].clientX : e.clientX
    const startY = e.touches ? e.touches[0].clientY : e.clientY
    const originX = rect.left
    const originY = rect.top
    function onMove(ev) {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY
      onDrag({ x: originX + (cx - startX), y: originY + (cy - startY) })
    }
    function onEnd() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
  }

  function handlePillDown(e) {
    const el = overlayRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const startX = e.touches ? e.touches[0].clientX : e.clientX
    const startY = e.touches ? e.touches[0].clientY : e.clientY
    const originX = rect.left
    const originY = rect.top
    let moved = false
    function onMove(ev) {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY
      if (!moved && (Math.abs(cx - startX) > 5 || Math.abs(cy - startY) > 5)) moved = true
      if (moved) onDrag({ x: originX + (cx - startX), y: originY + (cy - startY) })
    }
    function onEnd() {
      if (!moved) setExpanded(true)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
  }

  function handleProgressClick(e) {
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSeek(Math.floor(pct * duration))
  }

  // ── Collapsed pill ──────────────────────────────────────────
  if (!expanded) {
    return (
      <div
        ref={overlayRef}
        onMouseDown={handlePillDown}
        onTouchStart={handlePillDown}
        style={{
          ...posStyle,
          zIndex: 50, background: 'rgba(15,12,12,0.92)', border: '1px solid rgba(200,67,10,0.4)',
          borderRadius: 20, padding: '6px 14px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          color: '#faf7f2', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        🎵 {truncTitle} · {fmtTime(position)}
        {botStatus === 'playing' && (
          <span style={{ color: '#22c55e', fontSize: 10, fontWeight: 700 }}>● LIVE</span>
        )}
      </div>
    )
  }

  // ── Expanded full controls ───────────────────────────────────
  return (
    <div
      ref={overlayRef}
      style={{
        ...posStyle,
        zIndex: 50, background: 'rgba(15,12,12,0.92)',
        borderRadius: 12, border: '1px solid rgba(200,67,10,0.4)',
        minWidth: 300, maxWidth: 360, userSelect: 'none',
      }}
    >
      {/* Drag handle strip */}
      <div
        onMouseDown={handleDragHandleDown}
        onTouchStart={handleDragHandleDown}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 0 2px', cursor: 'grab', color: '#4a3e3e', fontSize: 14, letterSpacing: 3 }}
      >
        ⠿⠿⠿
      </div>

      {/* Content area */}
      <div style={{ padding: '4px 16px 14px' }}>

        {/* Header: title + collapse */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#faf7f2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
            🎵 {truncTitle}
          </div>
          <button
            onClick={() => setExpanded(false)}
            style={{ background: 'none', border: 'none', color: '#a09890', fontSize: 14, cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1 }}
            title="Collapse to pill"
          >✕</button>
        </div>

        {/* Not started / stopped */}
        {(!botStatus || botStatus === 'stopped') && (
          <button
            onClick={onStart}
            style={{ width: '100%', background: '#c8430a', border: 'none', borderRadius: 8, padding: '10px', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            ▶ Start Music
          </button>
        )}

        {/* Starting */}
        {botStatus === 'starting' && (
          <div style={{ textAlign: 'center', color: '#a09890', fontSize: 13, padding: '8px 0' }}>
            ⏳ Starting music...
          </div>
        )}

        {/* Force reset — always visible in expanded view */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            onClick={onReset}
            style={{ background: 'none', border: 'none', color: '#6b5050', fontSize: 10, cursor: 'pointer', padding: '2px 0' }}
            title="Force stop bot and reset UI"
          >⚠️ Reset bot</button>
        </div>

        {/* Playing / paused */}
        {(botStatus === 'playing' || botStatus === 'paused') && (
          <>
            {/* Progress bar */}
            <div
              onClick={handleProgressClick}
              style={{ height: 6, background: '#3a2e2e', borderRadius: 3, marginBottom: 4, cursor: 'pointer' }}
            >
              <div style={{ height: '100%', width: `${progressPct}%`, background: '#c8430a', borderRadius: 3, transition: 'width 0.5s linear' }} />
            </div>
            {/* Time labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#7a6e65', marginBottom: 10 }}>
              <span>{fmtTime(position)}</span>
              <span>{fmtTime(duration)}</span>
            </div>

            {/* Skip + transport controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10, justifyContent: 'center' }}>
              <button
                onClick={() => onSeek(Math.max(0, position - 30))}
                style={{ background: '#2a2020', border: '1px solid #3a2e2e', borderRadius: 6, padding: '6px 8px', color: '#a09890', fontSize: 11, cursor: 'pointer' }}
                title="Back 30s"
              >⏮ 30</button>
              <button
                onClick={() => onSeek(Math.max(0, position - 15))}
                style={{ background: '#2a2020', border: '1px solid #3a2e2e', borderRadius: 6, padding: '6px 8px', color: '#a09890', fontSize: 11, cursor: 'pointer' }}
                title="Back 15s"
              >⏪ 15</button>
              {botStatus === 'playing' ? (
                <button
                  onClick={onPause}
                  style={{ background: '#2a2020', border: '1px solid #3a2e2e', borderRadius: 8, padding: '8px 16px', color: '#faf7f2', fontSize: 16, cursor: 'pointer' }}
                >⏸</button>
              ) : (
                <button
                  onClick={onResume}
                  style={{ background: '#c8430a', border: 'none', borderRadius: 8, padding: '8px 16px', color: 'white', fontSize: 16, cursor: 'pointer' }}
                >▶</button>
              )}
              <button
                onClick={() => onSeek(Math.min(duration || 0, position + 15))}
                style={{ background: '#2a2020', border: '1px solid #3a2e2e', borderRadius: 6, padding: '6px 8px', color: '#a09890', fontSize: 11, cursor: 'pointer' }}
                title="Forward 15s"
              >15 ⏩</button>
              <button
                onClick={() => onSeek(Math.min(duration || 0, position + 30))}
                style={{ background: '#2a2020', border: '1px solid #3a2e2e', borderRadius: 6, padding: '6px 8px', color: '#a09890', fontSize: 11, cursor: 'pointer' }}
                title="Forward 30s"
              >30 ⏭</button>
            </div>

            {/* Volume + status + stop */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {botStatus === 'playing' ? (
                <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700, background: 'rgba(34,197,94,0.1)', padding: '2px 6px', borderRadius: 10, whiteSpace: 'nowrap', flexShrink: 0 }}>🔴 LIVE</span>
              ) : (
                <span style={{ fontSize: 10, color: '#a09890', flexShrink: 0 }}>⏸</span>
              )}
              <span style={{ fontSize: 12, color: '#7a6e65', flexShrink: 0 }}>🔊</span>
              <input
                type="range" min="0" max="100" value={volume}
                onChange={e => onVolume(Number(e.target.value))}
                onMouseDown={e => e.stopPropagation()}
                style={{ flex: 1, accentColor: '#c8430a', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 11, color: '#7a6e65', width: 28, textAlign: 'right', flexShrink: 0 }}>{volume}%</span>
              <button
                onClick={onStop}
                style={{ background: '#2a2020', border: '1px solid #3a2e2e', borderRadius: 6, padding: '5px 8px', color: '#a09890', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                title="Stop music"
              >■</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Public export — wraps inner component with HMSRoomProvider
// ─────────────────────────────────────────────────────────────────

export default function SDKClassroom(props) {
  return (
    <HMSRoomProvider>
      <SDKClassroomInner {...props} />
    </HMSRoomProvider>
  )
}
