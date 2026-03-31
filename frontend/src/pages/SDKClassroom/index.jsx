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

function SDKClassroomInner({ sessionId, sessionData, onLeave }) {
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
  const [viewMode, setViewMode] = useState('class')  // 'class' | 'self'
  const [mirrored, setMirrored] = useState(true)

  // ── Week 3: recording state ───────────────────────────────────
  const [recordingState, setRecordingState]         = useState('idle') // 'idle'|'recording'|'paused'|'stopped'
  const [recordingId, setRecordingId]               = useState(null)
  const [performanceMode, setPerformanceMode]       = useState(false)
  const [performanceCountdown, setPerformanceCountdown] = useState(null) // null | 3 | 2 | 1
  const [perfRecordingId, setPerfRecordingId]       = useState(null)

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

  // Self-view overlay: remote guests only (local is the full-screen video)
  const overlayPeers = guestPeers.filter(p => !p.isLocal)

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
        isAudioMuted: userRole === 'guest',
        isVideoMuted: userRole === 'guest',
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
    if (!isHost || !isConnected || recordingStartedRef.current) return
    recordingStartedRef.current = true
    callRecordingControl('start').then(data => {
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
    try { await hmsActions.leave() } catch { /* leave can throw if already disconnected */ }
    sessionStorage.setItem(`nrh_left_${sessionId}`, Date.now().toString())
    setStatus('left')
  }

  async function handleEndSession() {
    clearTimeout(endTimerRef.current)
    clearInterval(bannerTimerRef.current)
    try { await hmsActions.endRoom(false, 'Session ended by host') } catch { /* endRoom throws if room already ended */ }
    sessionStorage.setItem(`nrh_left_${sessionId}`, Date.now().toString())
    setStatus('left')
  }

  // ── Recording helpers ─────────────────────────────────────────
  async function pauseRecording() {
    if (!recordingId) return
    const data = await callRecordingControl('pause', { recording_id: recordingId })
    if (data.success) setRecordingState('paused')
  }

  async function resumeRecording() {
    if (!recordingId) return
    const data = await callRecordingControl('resume', { recording_id: recordingId })
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
        callRecordingControl('start', { recording_type: 'performance' }).then(data => {
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
          : isHost && viewMode === 'self'
          // ════════════════════════════════════════════════
          // SELF-VIEW MODE (host only)
          // Full-screen local video + draggable guest overlay
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
                    GUESTS ({overlayPeers.length})
                  </div>
                  {overlayPeers.length === 0 ? (
                    <div style={{ width: stripTileW, padding: '10px 8px', textAlign: 'center', color: '#7a6e65', fontSize: 12 }}>
                      No guests yet
                    </div>
                  ) : (
                    overlayPeers.map(peer => (
                      <div key={peer.id} style={{ width: stripTileW, height: stripTileH, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                        <PeerTile peer={peer} />
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
// Public export — wraps inner component with HMSRoomProvider
// ─────────────────────────────────────────────────────────────────

export default function SDKClassroom(props) {
  return (
    <HMSRoomProvider>
      <SDKClassroomInner {...props} />
    </HMSRoomProvider>
  )
}
