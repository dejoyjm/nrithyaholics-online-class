import { useVideo, useHMSStore, selectVideoTrackByPeerID, selectAudioTrackByPeerID } from '@100mslive/react-sdk'

// mirrored prop: controls local peer's video transform. Defaults to true (standard mirror).
// Remote peers are never mirrored regardless of this prop.
export default function PeerTile({ peer, mirrored = true }) {
  const videoTrack = useHMSStore(selectVideoTrackByPeerID(peer.id))
  const audioTrack = useHMSStore(selectAudioTrackByPeerID(peer.id))
  const isVideoOn = !!(videoTrack?.enabled)
  const isAudioOn = !!(audioTrack?.enabled)
  const isHost = peer.roleName === 'host'

  const { videoRef } = useVideo({ trackId: peer.videoTrack })

  const initials = peer.name
    ? peer.name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const videoTransform = peer.isLocal ? (mirrored ? 'scaleX(-1)' : 'none') : 'none'

  return (
    <div style={{
      position: 'relative',
      background: '#1a1414',
      borderRadius: 12,
      overflow: 'hidden',
      height: '100%',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: isHost ? '1px solid #c8430a44' : '1px solid #2a2a2a',
    }}>
      {/* Video element — always mounted so useVideo can attach */}
      <video
        ref={videoRef}
        autoPlay
        muted={peer.isLocal}
        playsInline
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: videoTransform,
          display: isVideoOn ? 'block' : 'none',
        }}
      />

      {/* Avatar fallback — shown when video is off */}
      {!isVideoOn && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, zIndex: 1 }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: isHost ? '#c8430a33' : '#2a2a2a',
            border: isHost ? '2px solid #c8430a' : '2px solid #3a3a3a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            fontWeight: 700,
            color: isHost ? '#c8430a' : '#a09890',
            fontFamily: 'Georgia, serif',
          }}>
            {initials}
          </div>
          <div style={{ fontSize: 13, color: '#a09890' }}>{peer.name}</div>
        </div>
      )}

      {/* Bottom overlay — name + badges */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '20px 10px 8px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        zIndex: 2,
      }}>
        <span style={{
          fontSize: 11,
          color: '#faf7f2',
          fontWeight: 500,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {peer.name}{peer.isLocal ? ' (You)' : ''}
        </span>
        {isHost && (
          <span style={{
            fontSize: 9,
            background: '#c8430a',
            color: 'white',
            padding: '2px 7px',
            borderRadius: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            flexShrink: 0,
          }}>
            HOST
          </span>
        )}
        {!isAudioOn && (
          <span title="Muted" style={{ fontSize: 12, flexShrink: 0 }}>🔇</span>
        )}
        {!isVideoOn && isAudioOn && (
          <span title="Camera off" style={{ fontSize: 12, flexShrink: 0 }}>📷</span>
        )}
      </div>
    </div>
  )
}
