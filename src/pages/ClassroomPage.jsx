import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// ── Load 100ms SDK from CDN ──────────────────────────────────
function loadHMSScript() {
  return new Promise((resolve, reject) => {
    if (window.HMS) { resolve(true); return }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/@100mslive/hms-video-store@0.10.14/dist/index.umd.js'
    script.onload = () => resolve(true)
    script.onerror = () => reject(new Error('Failed to load 100ms SDK'))
    document.head.appendChild(script)
  })
}

export default function ClassroomPage({ sessionId, sessionData, user, profile, onLeave }) {
  const [status, setStatus] = useState('loading') // loading | joining | lobby | live | left | error
  const [errorMsg, setErrorMsg] = useState('')
  const [peers, setPeers] = useState([])
  const [isAudioOn, setIsAudioOn] = useState(true)
  const [isVideoOn, setIsVideoOn] = useState(true)
  const [isMirrored, setIsMirrored] = useState(true)
  const [participantCount, setParticipantCount] = useState(0)
  const [sessionTimer, setSessionTimer] = useState(0)
  const [hmsReady, setHmsReady] = useState(false)
  const [sdkError, setSdkError] = useState(false)

  const hmsStoreRef = useRef(null)
  const hmsActionsRef = useRef(null)
  const timerRef = useRef(null)
  const joinedAtRef = useRef(null)

  const isHost = profile?.is_admin || session?.choreographer_id === user?.id
  const session = sessionData

  // ── Init 100ms ─────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        await loadHMSScript()
        if (!window.HMSReactiveStore) {
          setSdkError(true)
          setStatus('error')
          setErrorMsg('Video SDK failed to load. Please refresh the page.')
          return
        }
        const hmsManager = new window.HMSReactiveStore()
        hmsStoreRef.current = hmsManager.getStore()
        hmsActionsRef.current = hmsManager.getActions()
        setHmsReady(true)
      } catch (e) {
        setSdkError(true)
        setStatus('error')
        setErrorMsg('Could not load video SDK. Check your connection and refresh.')
      }
    }
    init()
    return () => {
      if (hmsActionsRef.current) {
        try { hmsActionsRef.current.leave() } catch (e) {}
      }
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // ── Get token and join ──────────────────────────────────────
  useEffect(() => {
    if (!hmsReady) return
    joinRoom()
  }, [hmsReady])

  async function joinRoom() {
    setStatus('joining')
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

      // Subscribe to HMS store updates
      const unsubPeers = hmsStoreRef.current.subscribe((peers) => {
        setPeers([...peers])
        setParticipantCount(peers.length)
      }, window.HMS?.selectPeers || (() => []))

      const unsubConnection = hmsStoreRef.current.subscribe((roomState) => {
        if (roomState === 'Connected') {
          setStatus('live')
          joinedAtRef.current = Date.now()
          startTimer()
        } else if (roomState === 'Disconnected' || roomState === 'Failed') {
          setStatus('left')
        }
      }, window.HMS?.selectRoomState || (() => 'Disconnected'))

      // Join the room
      await hmsActionsRef.current.join({
        userName: data.user_name,
        authToken: data.token,
        settings: {
          isAudioMuted: false,
          isVideoMuted: false,
        },
      })

    } catch (err) {
      console.error('Join error:', err)
      setStatus('error')
      setErrorMsg('Failed to join the room. Please try again.')
    }
  }

  function startTimer() {
    timerRef.current = setInterval(() => {
      if (joinedAtRef.current) {
        setSessionTimer(Math.floor((Date.now() - joinedAtRef.current) / 1000))
      }
    }, 1000)
  }

  function formatTimer(secs) {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  async function toggleAudio() {
    if (!hmsActionsRef.current) return
    await hmsActionsRef.current.setLocalAudioEnabled(!isAudioOn)
    setIsAudioOn(!isAudioOn)
  }

  async function toggleVideo() {
    if (!hmsActionsRef.current) return
    await hmsActionsRef.current.setLocalVideoEnabled(!isVideoOn)
    setIsVideoOn(!isVideoOn)
  }

  async function leaveRoom() {
    if (hmsActionsRef.current) {
      try { await hmsActionsRef.current.leave() } catch (e) {}
    }
    if (timerRef.current) clearInterval(timerRef.current)
    onLeave()
  }

  // ── Render: Loading ─────────────────────────────────────────
  if (status === 'loading' || status === 'joining') {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        {session?.cover_photo_url && (
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${session.cover_photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.15 }} />
        )}
        <div style={{ position: 'relative', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 900, color: '#faf7f2', marginBottom: 8 }}>
            Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
          </div>
          <div style={{ fontSize: 16, color: '#a09890', marginBottom: 32 }}>{session?.title}</div>
          <div style={{ width: 48, height: 48, border: '3px solid #c8430a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 14, color: '#7a6e65' }}>
            {status === 'loading' ? 'Preparing your classroom...' : 'Joining the session...'}
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Render: Error ───────────────────────────────────────────
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
          <button onClick={() => { setStatus('loading'); setHmsReady(false); setTimeout(() => setHmsReady(true), 100) }}
            style={{ background: '#c8430a', border: 'none', color: 'white', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // ── Render: Left ────────────────────────────────────────────
  if (status === 'left') {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 56 }}>👋</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#faf7f2', fontFamily: 'Georgia, serif' }}>You've left the class</div>
        <div style={{ fontSize: 14, color: '#7a6e65' }}>Hope you enjoyed the session!</div>
        <button onClick={onLeave}
          style={{ marginTop: 16, background: '#c8430a', border: 'none', color: 'white', padding: '12px 28px', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
          Back to Sessions
        </button>
      </div>
    )
  }

  // ── Render: Live Classroom ──────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#111', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ background: '#1a1a1a', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #2a2a2a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 900, color: '#faf7f2' }}>
            Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
          </div>
          <div style={{ width: 1, height: 16, background: '#3a3a3a' }} />
          <div style={{ fontSize: 13, color: '#a09890', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session?.title}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Live indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>LIVE</span>
          </div>
          {/* Timer */}
          <div style={{ fontSize: 13, color: '#faf7f2', fontVariantNumeric: 'tabular-nums', background: '#2a2a2a', padding: '4px 10px', borderRadius: 6 }}>
            {formatTimer(sessionTimer)}
          </div>
          {/* Participant count */}
          <div style={{ fontSize: 13, color: '#a09890' }}>
            👥 {participantCount}
          </div>
        </div>
      </div>

      {/* Video grid */}
      <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
        <HMSVideoGrid
          peers={peers}
          hmsActions={hmsActionsRef.current}
          hmsStore={hmsStoreRef.current}
          isMirrored={isMirrored}
          isHost={isHost}
          userId={user?.id}
        />
      </div>

      {/* Bottom controls */}
      <div style={{ background: '#1a1a1a', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, borderTop: '1px solid #2a2a2a' }}>
        {/* Mic */}
        <ControlBtn
          on={isAudioOn}
          onClick={toggleAudio}
          onIcon='🎙️'
          offIcon='🔇'
          label={isAudioOn ? 'Mute' : 'Unmute'}
        />
        {/* Camera */}
        <ControlBtn
          on={isVideoOn}
          onClick={toggleVideo}
          onIcon='📹'
          offIcon='📷'
          label={isVideoOn ? 'Stop Video' : 'Start Video'}
        />
        {/* Mirror (self view) */}
        <ControlBtn
          on={isMirrored}
          onClick={() => setIsMirrored(!isMirrored)}
          onIcon='↔️'
          offIcon='↔️'
          label='Mirror'
          subtle
        />
        {/* Host: Mute All */}
        {isHost && (
          <ControlBtn
            on={true}
            onClick={async () => {
              if (!hmsActionsRef.current) return
              for (const peer of peers) {
                if (!peer.isLocal) {
                  try { await hmsActionsRef.current.setRemoteTrackEnabled(peer.audioTrack, false) } catch (e) {}
                }
              }
            }}
            onIcon='🔕'
            offIcon='🔕'
            label='Mute All'
            subtle
          />
        )}
        {/* Leave */}
        <button onClick={leaveRoom}
          style={{ background: '#dc2626', border: 'none', color: 'white', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginLeft: 8 }}>
          Leave
        </button>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ── Control Button ─────────────────────────────────────────
function ControlBtn({ on, onClick, onIcon, offIcon, label, subtle }) {
  return (
    <button onClick={onClick}
      style={{
        background: subtle ? '#2a2a2a' : (on ? '#2a2a2a' : '#3a1a1a'),
        border: `1px solid ${on ? '#3a3a3a' : '#7a2020'}`,
        color: on ? '#faf7f2' : '#ff6b6b',
        padding: '10px 16px',
        borderRadius: 10,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        minWidth: 64,
      }}>
      <span style={{ fontSize: 20 }}>{on ? onIcon : offIcon}</span>
      <span style={{ fontSize: 10, color: '#7a6e65' }}>{label}</span>
    </button>
  )
}

// ── HMS Video Grid ─────────────────────────────────────────
function HMSVideoGrid({ peers, hmsActions, hmsStore, isMirrored, isHost, userId }) {
  if (!peers || peers.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300 }}>
        <div style={{ textAlign: 'center', color: '#7a6e65' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👋</div>
          <div style={{ fontSize: 16 }}>Waiting for others to join...</div>
        </div>
      </div>
    )
  }

  const gridCols = peers.length === 1 ? 1 : peers.length <= 4 ? 2 : peers.length <= 9 ? 3 : 4

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
      gap: 8,
      height: '100%',
    }}>
      {peers.map(peer => (
        <PeerTile
          key={peer.id}
          peer={peer}
          hmsActions={hmsActions}
          hmsStore={hmsStore}
          isMirrored={isMirrored && peer.isLocal}
          isHost={isHost}
        />
      ))}
    </div>
  )
}

// ── Peer Tile ──────────────────────────────────────────────
function PeerTile({ peer, hmsActions, hmsStore, isMirrored, isHost }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (!peer.videoTrack || !videoRef.current || !hmsStore) return

    // Attach video track to element
    const videoTrack = hmsStore.getState(
      window.HMS?.selectVideoTrackByID ? window.HMS.selectVideoTrackByID(peer.videoTrack) : () => null
    )

    if (hmsActions && peer.videoTrack) {
      hmsActions.attachVideo(peer.videoTrack, videoRef.current).catch(() => {})
    }

    return () => {
      if (hmsActions && peer.videoTrack && videoRef.current) {
        hmsActions.detachVideo(peer.videoTrack, videoRef.current).catch(() => {})
      }
    }
  }, [peer.videoTrack, hmsActions, hmsStore])

  const isVideoOff = !peer.videoTrack || peer.videoEnabled === false
  const isAudioOff = !peer.audioTrack || peer.audioEnabled === false
  const initial = (peer.name || 'P')[0].toUpperCase()

  return (
    <div style={{
      position: 'relative',
      background: '#1a1a1a',
      borderRadius: 12,
      overflow: 'hidden',
      aspectRatio: '16/9',
      border: peer.isLocal ? '2px solid #c8430a' : '1px solid #2a2a2a',
    }}>
      {/* Video element */}
      {!isVideoOff && (
        <video
          ref={videoRef}
          autoPlay
          muted={peer.isLocal}
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: isMirrored ? 'scaleX(-1)' : 'none',
          }}
        />
      )}

      {/* Avatar when video off */}
      {isVideoOff && (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#c8430a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: 'white' }}>
            {initial}
          </div>
        </div>
      )}

      {/* Name + audio indicator */}
      <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: '3px 8px', fontSize: 12, color: 'white', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {peer.isLocal ? 'You' : peer.name || 'Participant'}
          {peer.roleName === 'host' && ' 🎭'}
        </div>
        {isAudioOff && (
          <div style={{ background: 'rgba(220,38,38,0.8)', borderRadius: 6, padding: '3px 6px', fontSize: 11 }}>🔇</div>
        )}
      </div>

      {/* Host kick button */}
      {isHost && !peer.isLocal && (
        <button
          onClick={async () => {
            if (confirm(`Remove ${peer.name} from the session?`)) {
              try { await hmsActions.removePeer(peer.id, 'Removed by host') } catch (e) { alert('Could not remove participant') }
            }
          }}
          style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(220,38,38,0.8)', border: 'none', color: 'white', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', opacity: 0.7 }}
          onMouseEnter={e => e.target.style.opacity = 1}
          onMouseLeave={e => e.target.style.opacity = 0.7}
        >
          ✕ Remove
        </button>
      )}
    </div>
  )
}
