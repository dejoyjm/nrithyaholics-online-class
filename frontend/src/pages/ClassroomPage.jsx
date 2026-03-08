import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// How many seconds before token_expires_at to start showing the warning banner
const WARN_BEFORE_SECS = 10 * 60 // 10 minutes

export default function ClassroomPage({ sessionId, sessionData, user, profile, onLeave }) {
  const [status, setStatus] = useState('fetching') // fetching | too_early | ended | error | ready | left
  const [errorMsg, setErrorMsg] = useState('')
  const [opensAt, setOpensAt] = useState(null)
  const [countdown, setCountdown] = useState('')
  const [roomToken, setRoomToken] = useState(null)
  const [roomId, setRoomId] = useState(null)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState(null)
  const [tokenExpiresAt, setTokenExpiresAt] = useState(null)   // epoch secs — hard end
  const [sessionEndsAt, setSessionEndsAt] = useState(null)     // epoch secs — scheduled end (start of grace)

  // End-of-session banner state
  const [endBanner, setEndBanner] = useState(null) // null | { label, secsLeft, isGrace }

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

  // ── Auto-end timer + end-of-session banner ────────────────────
  useEffect(() => {
    if (status !== 'ready' || !tokenExpiresAt) return

    // Clear any existing timers
    if (endTimerRef.current) clearTimeout(endTimerRef.current)
    if (bannerTimerRef.current) clearInterval(bannerTimerRef.current)

    const now = Math.floor(Date.now() / 1000)
    const msUntilEnd = (tokenExpiresAt - now) * 1000

    // Hard auto-end when token_expires_at is reached
    if (msUntilEnd <= 0) {
      setStatus('ended')
      return
    }
    endTimerRef.current = setTimeout(() => setStatus('ended'), msUntilEnd)

    // Banner logic — runs every second once we're within WARN_BEFORE_SECS of the end
    bannerTimerRef.current = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000)
      const secsUntilEnd = tokenExpiresAt - nowSec

      if (secsUntilEnd <= 0) {
        clearInterval(bannerTimerRef.current)
        setEndBanner(null)
        return
      }

      // Only show banner within the warning window
      if (secsUntilEnd > WARN_BEFORE_SECS) {
        setEndBanner(null)
        return
      }

      // Determine if we're in grace period (after scheduled end, before token expiry)
      const isGrace = sessionEndsAt ? nowSec >= sessionEndsAt : false

      const mins = Math.floor(secsUntilEnd / 60)
      const secs = secsUntilEnd % 60
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`

      setEndBanner({
        timeStr,
        isGrace,
        label: isGrace
          ? `Grace period ending — call disconnects in ${timeStr}`
          : `Class ends in ${timeStr}`,
      })
    }, 1000)

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
    return (
      <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#faf7f2', textAlign: 'center' }}>Couldn't join classroom</div>
        <div style={{ fontSize: 14, color: '#a09890', textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>{errorMsg}</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button onClick={onLeave} style={{ background: 'transparent', border: '1px solid #3a2e2e', color: '#a09890', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            Go Back
          </button>
          <button onClick={fetchToken} style={{ background: '#c8430a', border: 'none', color: 'white', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            {isExpired ? '🔄 Get Fresh Token' : 'Try Again'}
          </button>
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
  const prebuiltUrl = `https://dejoy-videoconf-406.app.100ms.live/meeting/${roomId}?skip_preview=false&auth_token=${roomToken}&name=${encodeURIComponent(userName)}${muteParams}`

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

      {/* ── End-of-session warning banner ── */}
      {endBanner && (
        <div style={{
          background: endBanner.isGrace ? '#7f1d1d' : '#78350f',
          borderBottom: `1px solid ${endBanner.isGrace ? '#dc2626' : '#d97706'}`,
          padding: '8px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          flexShrink: 0,
          animation: endBanner.isGrace ? 'flashRed 1.5s infinite' : 'none',
        }}>
          <span style={{ fontSize: 16 }}>{endBanner.isGrace ? '🔴' : '⏱️'}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: endBanner.isGrace ? '#fca5a5' : '#fcd34d' }}>
            {endBanner.label}
          </span>
          {endBanner.isGrace && (
            <span style={{ fontSize: 12, color: '#f87171', marginLeft: 4 }}>
              — Save your work and wrap up
            </span>
          )}
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
        @keyframes flashRed { 0%, 100% { background: #7f1d1d; } 50% { background: #991b1b; } }
      `}</style>
    </div>
  )
}
