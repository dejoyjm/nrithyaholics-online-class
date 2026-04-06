import { useState, useEffect } from 'react'

function formatDuration(seconds) {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s}s`
}

export default function RecordingPlayerModal({ recording, session, onClose, supabaseUrl, authToken }) {
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchUrl() {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/get-recording-url`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ recording_id: recording.id, session_id: recording.session_id }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(
            data.error === 'recording_expired'
              ? 'This recording has expired and is no longer available.'
              : data.error === 'forbidden'
              ? 'You do not have access to this recording.'
              : 'Failed to load recording.'
          )
          return
        }
        setUrl(data.url)
      } catch {
        setError('Failed to load recording.')
      } finally {
        setLoading(false)
      }
    }
    fetchUrl()
  }, [recording.id, supabaseUrl, authToken])

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 800, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', maxHeight: '90vh' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: -44, right: 0, background: 'none', border: 'none', color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }}
        >
          ✕ Close
        </button>
        <div style={{ color: 'white', fontSize: 18, fontWeight: 700, marginBottom: 14, textAlign: 'center' }}>
          {session?.title}
        </div>
        {loading && (
          <div style={{ color: '#9ca3af', textAlign: 'center', padding: 60, fontSize: 15 }}>
            Loading recording…
          </div>
        )}
        {error && (
          <div style={{ color: '#f87171', textAlign: 'center', padding: 60, fontSize: 15 }}>
            {error}
          </div>
        )}
        {url && (
          <video
            controls
            autoPlay
            controlsList="nodownload"
            onContextMenu={e => e.preventDefault()}
            style={{ height: '80vh', width: 'auto', maxWidth: '100%', objectFit: 'contain', borderRadius: 8, background: '#000', display: 'block' }}
            src={url}
          />
        )}
        {url && recording.duration_seconds ? (
          <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', marginTop: 10 }}>
            {formatDuration(recording.duration_seconds)}
          </div>
        ) : null}
      </div>
    </div>
  )
}
