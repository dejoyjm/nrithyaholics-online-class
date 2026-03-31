import { useAVToggle } from '@100mslive/react-sdk'

const btnBase = {
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  padding: '9px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  color: 'white',
  flexShrink: 0,
}

export default function Controls({
  isHost,
  onLeave,
  onEnd,
  viewMode,
  setViewMode,
  mirrored,
  setMirrored,
  recordingState,
  onPauseRec,
  performanceMode,
  onStartPerformance,
  onStopPerformance,
}) {
  const { isLocalAudioEnabled, isLocalVideoEnabled, toggleAudio, toggleVideo } = useAVToggle()

  return (
    <div style={{
      background: '#111',
      borderTop: '1px solid #2a2a2a',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
      flexWrap: 'wrap',
    }}>

      {/* Mic toggle */}
      <button
        onClick={toggleAudio}
        disabled={!toggleAudio}
        title={isLocalAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
        style={{
          ...btnBase,
          background: isLocalAudioEnabled ? '#2a2a2a' : '#7f1d1d',
          opacity: toggleAudio ? 1 : 0.5,
        }}
      >
        {isLocalAudioEnabled ? '🎤' : '🔇'}
        <span>{isLocalAudioEnabled ? 'Mute' : 'Unmute'}</span>
      </button>

      {/* Camera toggle */}
      <button
        onClick={toggleVideo}
        disabled={!toggleVideo}
        title={isLocalVideoEnabled ? 'Stop camera' : 'Start camera'}
        style={{
          ...btnBase,
          background: isLocalVideoEnabled ? '#2a2a2a' : '#7f1d1d',
          opacity: toggleVideo ? 1 : 0.5,
        }}
      >
        {isLocalVideoEnabled ? '📹' : '📷'}
        <span>{isLocalVideoEnabled ? 'Stop Video' : 'Start Video'}</span>
      </button>

      {/* Host-only: view mode toggle */}
      {isHost && (
        <button
          onClick={() => setViewMode(viewMode === 'class' ? 'self' : 'class')}
          title={viewMode === 'class' ? 'See yourself full screen' : 'Return to class view'}
          style={{
            ...btnBase,
            background: viewMode === 'self' ? '#c8430a' : '#2a2a2a',
          }}
        >
          {viewMode === 'class' ? '🪞' : '👥'}
          <span>{viewMode === 'class' ? 'See Myself' : 'See Class'}</span>
        </button>
      )}

      {/* Host-only: mirror toggle */}
      {isHost && (
        <button
          onClick={() => setMirrored(!mirrored)}
          title={mirrored ? 'Disable mirror' : 'Enable mirror'}
          style={{
            ...btnBase,
            background: mirrored ? '#1a3a2a' : '#2a2a2a',
            border: mirrored ? '1px solid #22c55e' : '1px solid transparent',
            color: mirrored ? '#86efac' : 'white',
          }}
        >
          🪞
          <span>Mirror</span>
        </button>
      )}

      {/* Host-only: pause recording */}
      {isHost && recordingState === 'recording' && (
        <button
          onClick={onPauseRec}
          title="Pause recording"
          style={{ ...btnBase, background: '#1a1a3a', border: '1px solid #4a4a8a', color: '#a0a0ff' }}
        >
          ⏸ <span>Pause Rec</span>
        </button>
      )}

      {/* Host-only: start performance mode */}
      {isHost && recordingState === 'recording' && !performanceMode && (
        <button
          onClick={onStartPerformance}
          title="Start performance mode — records all participants in equal grid"
          style={{ ...btnBase, background: '#1a2a1a', border: '1px solid #4a8a4a', color: '#86efac' }}
        >
          🎬 <span>Performance</span>
        </button>
      )}

      {/* Host-only: stop performance mode */}
      {isHost && performanceMode && (
        <button
          onClick={onStopPerformance}
          title="Stop performance mode"
          style={{ ...btnBase, background: '#2a1a00', border: '1px solid #d97706', color: '#fcd34d' }}
        >
          ⏹ <span>Stop Performance</span>
        </button>
      )}

      <div style={{ flex: 1 }} />

      {/* Leave / End */}
      {isHost ? (
        <button
          onClick={onEnd}
          style={{
            ...btnBase,
            background: '#450a0a',
            border: '1px solid #7f1d1d',
            color: '#fca5a5',
          }}
        >
          End Session
        </button>
      ) : (
        <button
          onClick={onLeave}
          style={{ ...btnBase, background: '#dc2626' }}
        >
          Leave
        </button>
      )}
    </div>
  )
}
