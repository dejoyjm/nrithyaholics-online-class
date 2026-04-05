import { useEffect, useRef } from 'react'
import {
  HMSRoomProvider,
  useHMSActions,
  useHMSStore,
  selectRemotePeers,
  selectRoomState,
  selectVideoTrackByPeerID,
  HMSRoomState,
} from '@100mslive/react-sdk'

// ── Single peer tile with direct video attachment ─────────────────────────────

function RecorderPeerTile({ peer }) {
  const hmsActions  = useHMSActions()
  const videoTrack  = useHMSStore(selectVideoTrackByPeerID(peer.id))
  const videoRef    = useRef(null)
  const hasVideo    = !!(videoTrack?.enabled && videoTrack?.id)

  console.log('[recorder] peer:', peer.name, 'videoTrack:', videoTrack?.id, 'enabled:', videoTrack?.enabled)

  useEffect(() => {
    if (!videoTrack?.id || !videoRef.current) return
    hmsActions.attachVideo(videoTrack.id, videoRef.current)
    return () => {
      hmsActions.detachVideo(videoTrack.id, videoRef.current).catch(() => {})
    }
  }, [videoTrack?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const initials = peer.name
    ? peer.name.trim().slice(0, 2).toUpperCase()
    : '?'

  return (
    <div style={{
      position: 'relative',
      background: '#111',
      overflow: 'hidden',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: hasVideo ? 'block' : 'none',
        }}
      />

      {!hasVideo && (
        <div style={{
          fontSize: 48,
          fontWeight: 700,
          color: '#a09890',
          fontFamily: 'Georgia, serif',
          zIndex: 1,
        }}>
          {initials}
        </div>
      )}

      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '16px 8px 6px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        fontSize: 11,
        color: '#faf7f2',
        zIndex: 2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {peer.name}
      </div>
    </div>
  )
}

// ── Inner component (inside HMSRoomProvider) ──────────────────────────────────

function RecorderInner({ authToken }) {
  const hmsActions  = useHMSActions()
  const remotePeers = useHMSStore(selectRemotePeers)
  const roomState   = useHMSStore(selectRoomState)
  const joinedRef   = useRef(false)

  useEffect(() => {
    if (!authToken) return
    if (joinedRef.current) return
    joinedRef.current = true
    hmsActions.join({
      authToken,
      userName: 'Beam Recorder',
      settings: { isAudioMuted: true, isVideoMuted: true },
    }).then(() => {
      console.log('[recorder] joined room')
    }).catch(() => {})
    return () => {
      hmsActions.leave().catch(() => {})
    }
  }, [authToken]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (roomState === HMSRoomState.Disconnected || roomState === HMSRoomState.Failed) {
      hmsActions.leave().catch(() => {})
    }
  }, [roomState]) // eslint-disable-line react-hooks/exhaustive-deps

  const n    = remotePeers.length
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000',
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 4,
      padding: 4,
      alignContent: 'start',
    }}>
      {remotePeers.map(peer => (
        <div key={peer.id} style={{ aspectRatio: '9/16', overflow: 'hidden' }}>
          <RecorderPeerTile peer={peer} />
        </div>
      ))}
    </div>
  )
}

// ── Page entry point ──────────────────────────────────────────────────────────

export default function RecorderPage() {
  const params    = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const roomId    = params.get('room_id')
  const authToken = params.get('auth_token')

  if (!roomId || !authToken) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        Missing room_id or auth_token
      </div>
    )
  }

  return (
    <HMSRoomProvider>
      <RecorderInner authToken={authToken} />
    </HMSRoomProvider>
  )
}
