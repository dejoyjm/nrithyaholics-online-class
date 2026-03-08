import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function ClassroomPage({ sessionId, sessionData, user, profile, onLeave }) {
  const [status, setStatus] = useState('fetching') // fetching | too_early | ended | error | ready | left
  const [errorMsg, setErrorMsg] = useState('')
  const [opensAt, setOpensAt] = useState(null)
  const [countdown, setCountdown] = useState('')
  const [roomToken, setRoomToken] = useState(null)
  const [roomId, setRoomId] = useState(null)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState(null) // null until resolved — avoids premature guest assumption
  const iframeRef = useRef(null)
  const countdownRef = useRef(null)

  const session = sessionData

  useEffect(() => {
    fetchToken()
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [])

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

      // Set role BEFORE status='ready' so prebuiltUrl is built with correct role
      setRoomToken(data.token)
      setRoomId(data.room_id)
      setUserName(data.user_name)
      setUserRole(data.role)  // 'host' or 'guest'
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
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 24, fontWeight: 700, color: '#faf7f2', textAlign: 'center' }}>This class has ended</div>
        <div style={{ fontSize: 14, color: '#7a6e65', textAlign: 'center' }}>Check your profile for upcoming classes.</div>
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

  // ── LIVE — 100ms Prebuilt iframe ──────────────────────────────
  // userRole is 'host' or 'guest' — guaranteed set before status='ready'
  const isGuest = userRole === 'guest'

  // Guests join muted (mic + cam off). Host joins live (mic + cam on).
  const muteParams = isGuest ? '&audio=false&video=false' : '&audio=true&video=true'

  const prebuiltUrl = `https://dejoy-videoconf-406.app.100ms.live/meeting/${roomId}?skip_preview=false&auth_token=${roomToken}&name=${encodeURIComponent(userName)}${muteParams}`

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f0c0c', display: 'flex', flexDirection: 'column', zIndex: 9999 }}>
      <div style={{ background: '#1a1a1a', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #2a2a2a', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 900, color: '#faf7f2' }}>
            Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
          </div>
          <div style={{ width: 1, height: 16, background: '#3a3a3a' }} />
          <div style={{ fontSize: 13, color: '#a09890', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        <button onClick={() => setStatus('left')} style={{ background: '#dc2626', border: 'none', color: 'white', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Leave
        </button>
      </div>

      <iframe
        ref={iframeRef}
        src={prebuiltUrl}
        style={{ flex: 1, border: 'none', width: '100%' }}
        allow="camera; microphone; display-capture; fullscreen; clipboard-read; clipboard-write; screen-wake-lock; compute-pressure; autoplay; payment"
        allowFullScreen
        title="NrithyaHolics Classroom"
      />

      <style>{'@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } } @keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  )
}
