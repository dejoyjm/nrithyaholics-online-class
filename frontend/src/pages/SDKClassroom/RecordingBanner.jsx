// Shown when recording is paused — full-width amber bar, flashing.
// No dismiss button — clicking resumes recording.
// nhFlash keyframe is defined in SDKClassroom/index.jsx global style block.
export default function RecordingBanner({ recordingState, onResume }) {
  if (recordingState !== 'paused') return null

  return (
    <div
      onClick={onResume}
      style={{
        background: '#d97706',
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
        zIndex: 100,
        animation: 'nhFlash 0.6s infinite',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: 'white', letterSpacing: 0.3 }}>
        ⏸ RECORDING IS PAUSED — Tap here to resume
      </span>
    </div>
  )
}
