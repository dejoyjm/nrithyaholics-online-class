import { useEffect } from 'react'
import {
  HMSRoomProvider,
  useHMSActions,
  useHMSStore,
  selectRemotePeers,
  selectRoomState,
  HMSRoomState,
} from '@100mslive/react-sdk'
import PeerTile from './SDKClassroom/PeerTile'

function RecorderInner({ roomId, authToken }) {
  const hmsActions  = useHMSActions()
  const remotePeers = useHMSStore(selectRemotePeers)
  const roomState   = useHMSStore(selectRoomState)

  useEffect(() => {
    if (!authToken) return
    hmsActions.join({
      authToken,
      userName: 'Beam Recorder',
      settings: { isAudioMuted: true, isVideoMuted: true },
    })
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
          <PeerTile peer={peer} mirrored={false} />
        </div>
      ))}
    </div>
  )
}

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
      <RecorderInner roomId={roomId} authToken={authToken} />
    </HMSRoomProvider>
  )
}
