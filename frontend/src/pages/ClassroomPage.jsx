import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function ClassroomPage({ sessionId, sessionData, user, profile, onLeave }) {
  const [status, setStatus] = useState('fetching')
  const [errorMsg, setErrorMsg] = useState('')
  const [roomToken, setRoomToken] = useState(null)
  const [roomId, setRoomId] = useState(null)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('guest')
  const iframeRef = useRef(null)

  const session = sessionData
  const isHost = profile?.is_admin || session?.choreographer_id === user?.id

  useEffect(() => {
    fetchToken()
  }, [])

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
      if (!res.ok || !data.token) {
        setStatus('error')
        setErrorMsg(data.error || 'Could not get room access. Please try again.')
        return
      }

      setRoomToken(data.token)
      setRoomId(data.room_id)
      setUserName(data.user_name)
      setUserRole(data.role)
      setStatus('ready')
    } catch (err) {
      console.error('Token fetch error:', err)
      setStatus('error')
      setErrorMsg('Failed to connect. Please check your connection and try again.')
    }
  }

  if (status === 'fetching') {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        {session?.cover_photo_url && (
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${session.cover_photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.1 }} />
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

  if (status === 'error') {
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
            Try Again
          </button>
        </div>
      </div>
    )
  }

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

  // Live — 100ms Prebuilt iframe
  const prebuiltUrl = `https://dejoy-videoconf-406.app.100ms.live/meeting/${roomId}?skip_preview=false&auth_token=${roomToken}&name=${encodeURIComponent(userName)}`

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
        allow="camera; microphone; display-capture; fullscreen; clipboard-read; clipboard-write"
        allowFullScreen
        title="NrithyaHolics Classroom"
      />

      <style>{'@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } } @keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  )
}
