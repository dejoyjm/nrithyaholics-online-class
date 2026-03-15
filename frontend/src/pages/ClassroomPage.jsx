import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// How many seconds before scheduled end (sessionEndsAt) to start showing the countdown
const WARN_BEFORE_SECS = 10 * 60  // 10 minutes
// How many seconds before hard disconnect (tokenExpiresAt) to show the "auto-disconnect soon" phase
const CRITICAL_BEFORE_SECS = 5 * 60  // 5 minutes

export default function ClassroomPage({ sessionId, sessionData, user, profile, onLeave }) {
  const [status, setStatus] = useState('fetching') // fetching | too_early | ended | error | ready | left
  const [errorMsg, setErrorMsg] = useState('')
  const [opensAt, setOpensAt] = useState(null)
  const [countdown, setCountdown] = useState('')
  const [roomToken, setRoomToken] = useState(null)
  const [roomId, setRoomId] = useState(null)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState(null)
  const [tokenExpiresAt, setTokenExpiresAt] = useState(null)   // epoch secs — hard end (grace end)
  const [sessionEndsAt, setSessionEndsAt] = useState(null)     // epoch secs — scheduled end (grace starts)

  // Banner state
  // phase: 'calm' | 'countdown' | 'overtime' | 'critical'
  const [banner, setBanner] = useState(null)

  const iframeRef = useRef(null)
  const countdownRef = useRef(null)
  const endTimerRef = useRef(null)
  const bannerTimerRef = useRef(null)

  const session = sessionData

  useEffect(() => {
    fetchToken()
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (endTimerRef.current) clearTimeout(endTimerRef.current)
      if (bannerTimerRef.current) clearInterval(bannerTimerRef.current)
    }
  }, [])

  // ── Countdown for too_early state ─────────────────────────────
  useEffect(() => {
    if (status === 'too_early' && opensAt) {
      if (countdownRef.current) clearInterval(countdownRef.current)
      countdownRef.current = setInterval(() => {
        const secsLeft = Math.max(0, opensAt - Math.floor(Date.now() / 1000))
        if (secsLeft === 0) {
          clearInterval(countdownRef.current)
          fetchToken()
          return
        }
        const m = Math.floor(secsLeft / 60)
        const s = secsLeft % 60
        setCountdown(`${m}:${s.toString().padStart(2, '0')}`)
      }, 1000)
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [status, opensAt])

  // ── Auto-end timer + 4-phase banner ──────────────────────────
  useEffect(() => {
    if (status !== 'ready' || !tokenExpiresAt || !sessionEndsAt) return

    if (endTimerRef.current) clearTimeout(endTimerRef.current)
    if (bannerTimerRef.current) clearInterval(bannerTimerRef.current)

    const now = Math.floor(Date.now() / 1000)
    const msUntilHardEnd = (tokenExpiresAt - now) * 1000

    // Hard auto-end when token_expires_at is reached
    if (msUntilHardEnd <= 0) {
      setStatus('ended')
      return
    }
    endTimerRef.current = setTimeout(() => setStatus('ended'), msUntilHardEnd)

    // Compute the scheduled end time string once (e.g. "3:30 PM")
    const scheduledEndStr = new Date(sessionEndsAt * 1000).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true
    })

    // Banner tick — runs every second from join
    bannerTimerRef.current = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000)
      const secsUntilHardEnd = tokenExpiresAt - nowSec
      const secsUntilScheduledEnd = sessionEndsAt - nowSec
      const secsOvertime = nowSec - sessionEndsAt  // positive once past scheduled end

      if (secsUntilHardEnd <= 0) {
        clearInterval(bannerTimerRef.current)
        setBanner(null)
        return
      }

      const fmt = (secs) => {
        const m = Math.floor(Math.abs(secs) / 60)
        const s = Math.abs(secs) % 60
        return `${m}:${s.toString().padStart(2, '0')}`
      }

      // PHASE 4 — Critical: within 5 mins of hard disconnect (blinking red)
      if (secsUntilHardEnd <= CRITICAL_BEFORE_SECS) {
        setBanner({
          phase: 'critical',
          text: `Auto-disconnect in ${fmt(secsUntilHardEnd)}`,
        })
      }
      // PHASE 3 — Overtime: past scheduled end, not yet in critical window
      else if (secsOvertime > 0) {
        setBanner({
          phase: 'overtime',
          text: `Exceeded scheduled time by ${fmt(secsOvertime)}`,
        })
      }
      // PHASE 2 — Countdown: within 10 mins of scheduled end
      else if (secsUntilScheduledEnd <= WARN_BEFORE_SECS) {
        setBanner({
          phase: 'countdown',
          text: `${fmt(secsUntilScheduledEnd)} remaining in class`,
        })
      }
      // PHASE 1 — Calm: always visible from join
      else {
        setBanner({
          phase: 'calm',
          text: `Class runs until ${scheduledEndStr}`,
        })
      }
    }, 1000)

    // Set initial calm banner immediately (don't wait 1 sec for first tick)
    setBanner({
      phase: 'calm',
      text: `Class runs until ${scheduledEndStr}`,
    })

    return () => {
      if (endTimerRef.current) clearTimeout(endTimerRef.current)
      if (bannerTimerRef.current) clearInterval(bannerTimerRef.current)
    }
  }, [status, tokenExpiresAt, sessionEndsAt])

  async function fetchToken() {
    setStatus('fetching')
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
        body: JSON.stringify({ session_id: sessionId }),
      })

      const data = await res.json()

      if (data.error === 'too_early') {
        setOpensAt(data.opens_at)
        setStatus('too_early')
        return
      }
      if (data.error === 'session_ended') {
        setStatus('ended')
        return
      }
      if (data.error === 'already_joined') {
        setStatus('error')
        setErrorMsg('You are already in this class on another device or tab. Please leave that session first, then try again.')
        return
      }
      if (!res.ok || !data.token) {
        setStatus('error')
        setErrorMsg(data.error || 'Could not get room access. Please try again.')
        return
      }

      setRoomToken(data.token)
      setRoomId(data.room_id)
      setUserName(data.user_name)
      setUserRole(data.role)
      setTokenExpiresAt(data.token_expires_at)   // hard disconnect epoch
      setSessionEndsAt(data.session_ends_at)     // scheduled end epoch (grace starts here)
      setStatus('ready')
    } catch (err) {
      console.error('Token fetch error:', err)
      setStatus('error')
      setErrorMsg('Failed to connect. Please check your connection and try again.')
    }
  }

  // ── FETCHING ──────────────────────────────────────────────────
  if (status === 'fetching') {
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
          <div style={{ width: 44, height: 44, border: '3px solid #c8430a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 14, color: '#7a6e65' }}>Setting up your classroom...</div>
        </div>
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    )
  }

  // ── TOO EARLY ─────────────────────────────────────────────────
  if (status === 'too_early') {
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
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    )
  }

  // ── SESSION ENDED ─────────────────────────────────────────────
  if (status === 'ended') {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <div style={{ fontSize: 56 }}>🎭</div>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 24, fontWeight: 700, color: '#faf7f2', textAlign: 'center' }}>
          This class has ended
        </div>
        <div style={{ fontSize: 14, color: '#7a6e65', textAlign: 'center' }}>Hope you enjoyed the session!</div>
        <button onClick={onLeave} style={{ marginTop: 8, background: '#c8430a', border: 'none', color: 'white', padding: '12px 28px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          Back to Sessions
        </button>
      </div>
    )
  }

  // ── ERROR ─────────────────────────────────────────────────────
  if (status === 'error') {
    const isExpired = errorMsg.toLowerCase().includes('expired') || errorMsg.toLowerCase().includes('token')
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
            <button onClick={fetchToken} style={{ background: '#c8430a', border: 'none', color: 'white', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              {isExpired ? '🔄 Get Fresh Token' : 'Try Again'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── LEFT ──────────────────────────────────────────────────────
  if (status === 'left') {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 56 }}>👋</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#faf7f2', fontFamily: 'Georgia, serif' }}>You've left the class</div>
        <div style={{ fontSize: 14, color: '#7a6e65' }}>Hope you enjoyed the session!</div>
        <button onClick={onLeave} style={{ marginTop: 16, background: '#c8430a', border: 'none', color: 'white', padding: '12px 28px', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
          Back to Sessions
        </button>
      </div>
    )
  }

  // ── LIVE ──────────────────────────────────────────────────────
  const isGuest = userRole === 'guest'
  const muteParams = isGuest ? '&audio=false&video=false' : '&audio=true&video=true'
  const prebuiltUrl = `https://dejoy-videoconf-406.app.100ms.live/meeting/${roomId}?skip_preview=false&auth_token=...`

  // Banner styles per phase
  const bannerStyles = {
    calm: {
      bg: '#1a2535',
      border: '#2a3a55',
      color: '#93c5fd',
      icon: '🕐',
      blink: false,
    },
    countdown: {
      bg: '#2d1f00',
      border: '#d97706',
      color: '#fcd34d',
      icon: '⏱️',
      blink: false,
    },
    overtime: {
      bg: '#2d1500',
      border: '#ea580c',
      color: '#fb923c',
      icon: '⏰',
      blink: false,
    },
    critical: {
      bg: '#2d0000',
      border: '#dc2626',
      color: '#fca5a5',
      icon: '🔴',
      blink: true,
    },
  }

  const bs = banner ? bannerStyles[banner.phase] : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f0c0c', display: 'flex', flexDirection: 'column', zIndex: 9999 }}>

      {/* ── Top bar ── */}
      <div style={{ background: '#1a1a1a', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #2a2a2a', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 900, color: '#faf7f2' }}>
            Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
          </div>
          <div style={{ width: 1, height: 16, background: '#3a3a3a' }} />
          <div style={{ fontSize: 13, color: '#a09890', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session?.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>LIVE</span>
          </div>
          {userRole === 'host' && (
            <span style={{ fontSize: 11, background: '#c8430a22', color: '#c8430a', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>🎭 HOST</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setStatus('left')}
            style={{ background: '#dc2626', border: 'none', color: 'white', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Leave
          </button>
        </div>
      </div>

      {/* ── Session time banner — always visible ── */}
      {banner && bs && (
        <div style={{
          background: bs.bg,
          borderBottom: `1px solid ${bs.border}`,
          padding: '6px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          flexShrink: 0,
          animation: bs.blink ? 'flashBanner 1.2s infinite' : 'none',
        }}>
          <span style={{ fontSize: 14 }}>{bs.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: bs.color, letterSpacing: 0.3 }}>
            {banner.text}
          </span>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={prebuiltUrl}
        style={{ flex: 1, border: 'none', width: '100%' }}
        allow="camera; microphone; display-capture; fullscreen; clipboard-read; clipboard-write; screen-wake-lock; compute-pressure; autoplay; payment"
        allowFullScreen
        title="NrithyaHolics Classroom"
      />

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes flashBanner { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
      `}</style>
    </div>
  )
}
