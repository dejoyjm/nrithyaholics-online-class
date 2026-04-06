import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

const thStyle = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700,
  color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap',
}
const tdStyle = { padding: '10px 14px', verticalAlign: 'middle' }

function RecordingRow({ rec, onToggle, onSaveLabel }) {
  const [label, setLabel] = useState(rec.reference_label || '')
  const r2Short = rec.r2_url ? ('…' + rec.r2_url.split('?')[0].slice(-30)) : '—'

  return (
    <tr style={{ borderBottom: '1px solid #f0ebe6' }}>
      <td style={tdStyle}>
        <div style={{ fontWeight: 600, color: '#0f0c0c', fontSize: 13 }}>{rec.sessions?.title || '—'}</div>
      </td>
      <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#5a4e47', fontSize: 13 }}>
        {formatDate(rec.sessions?.scheduled_at)}
      </td>
      <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#5a4e47', fontSize: 13 }}>
        {formatDuration(rec.duration_seconds)}
      </td>
      <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#9ca3af', fontSize: 11 }}>
        {r2Short}
      </td>
      <td style={tdStyle}>
        <button
          onClick={() => onToggle(rec)}
          title={rec.is_ai_reference ? 'Marked as reference' : 'Not a reference'}
          style={{
            width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', padding: 0,
            background: rec.is_ai_reference ? '#22c55e' : '#d1d5db',
            position: 'relative', flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute', top: 3,
            left: rec.is_ai_reference ? 23 : 3,
            width: 18, height: 18, borderRadius: '50%', background: 'white',
            display: 'block',
          }} />
        </button>
      </td>
      <td style={tdStyle}>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          onBlur={() => onSaveLabel(rec, label)}
          placeholder="Internal note..."
          style={{
            border: '1px solid #e2dbd4', borderRadius: 6, padding: '5px 10px',
            fontSize: 12, outline: 'none', width: 180, color: '#0f0c0c',
            background: '#faf7f2',
          }}
        />
      </td>
    </tr>
  )
}

export default function RecordingsTab() {
  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchRecordings() }, [])

  async function fetchRecordings() {
    setLoading(true)
    const { data } = await supabase
      .from('recordings')
      .select('*, sessions(title, scheduled_at)')
      .order('created_at', { ascending: false })
    setRecordings(data || [])
    setLoading(false)
  }

  async function toggleReference(rec) {
    const newVal = !rec.is_ai_reference
    setRecordings(rs => rs.map(r => r.id === rec.id ? { ...r, is_ai_reference: newVal } : r))
    await supabase.from('recordings').update({ is_ai_reference: newVal }).eq('id', rec.id)
  }

  async function saveLabel(rec, value) {
    await supabase.from('recordings').update({ reference_label: value }).eq('id', rec.id)
  }

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: '#7a6e65' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #c8430a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'nhSpin 1s linear infinite', margin: '0 auto 12px' }} />
      <style>{'@keyframes nhSpin { to { transform: rotate(360deg); } }'}</style>
      Loading recordings...
    </div>
  )

  return (
    <div style={{ padding: 28 }}>
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 800, color: '#0f0c0c', marginBottom: 4 }}>
        Recordings
      </h2>
      <p style={{ fontSize: 13, color: '#7a6e65', marginBottom: 20 }}>
        {recordings.length} recording{recordings.length !== 1 ? 's' : ''} total
      </p>

      {recordings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#7a6e65', fontSize: 14 }}>
          No recordings yet.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2dbd4' }}>
                <th style={thStyle}>Session</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>R2 Key</th>
                <th style={thStyle}>Reference</th>
                <th style={thStyle}>Label</th>
              </tr>
            </thead>
            <tbody>
              {recordings.map(rec => (
                <RecordingRow
                  key={rec.id}
                  rec={rec}
                  onToggle={toggleReference}
                  onSaveLabel={saveLabel}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
