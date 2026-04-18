import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

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

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || ''
}

function scoreColor(score) {
  if (score >= 80) return '#22c55e'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

// ── SkeletonModal ────────────────────────────────────────────────────────────

function SkeletonModal({ recordingId, onClose }) {
  const [videoUrl, setVideoUrl] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function fetchUrl() {
      try {
        const token = await getToken()
        const res = await fetch(`${SUPABASE_URL}/functions/v1/get-skeleton-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ recording_id: recordingId }),
        })
        const data = await res.json()
        if (!cancelled) {
          if (!res.ok) setError(data.error || 'Failed to load skeleton video')
          else setVideoUrl(data.url)
        }
      } catch {
        if (!cancelled) setError('Network error')
      }
    }
    fetchUrl()
    return () => { cancelled = true }
  }, [recordingId])

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div style={{
        background: '#1a1612', borderRadius: 12, padding: 20,
        maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        gap: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#e2dbd4', fontSize: 14, fontWeight: 600 }}>Skeleton Preview</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
          >×</button>
        </div>
        {error ? (
          <div style={{ color: '#f87171', fontSize: 13, padding: '20px 0' }}>{error}</div>
        ) : !videoUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#9ca3af', fontSize: 13, padding: '20px 0' }}>
            <div style={{ width: 20, height: 20, border: '2px solid #c8430a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'nhSpin 1s linear infinite', flexShrink: 0 }} />
            <style>{'@keyframes nhSpin { to { transform: rotate(360deg); } }'}</style>
            Loading...
          </div>
        ) : (
          <video
            src={videoUrl}
            controls
            autoPlay
            controlsList="nodownload"
            onContextMenu={e => e.preventDefault()}
            style={{ height: '70vh', width: 'auto', maxWidth: '80vw', objectFit: 'contain', borderRadius: 8 }}
          />
        )}
      </div>
    </div>
  )
}

// ── ScoreReportModal ─────────────────────────────────────────────────────────

function ScoreReportModal({ rec, onClose }) {
  const [refVideoUrl, setRefVideoUrl]     = useState(null)
  const [studentVideoUrl, setStudentVideoUrl] = useState(null)
  const [urlError, setUrlError]           = useState(null)
  const [isPlaying, setIsPlaying]         = useState(false)
  const [playPosition, setPlayPosition]   = useState(0)

  const refVideoRef   = useRef(null)
  const stuVideoRef   = useRef(null)
  const playTimerRef  = useRef(null)

  const score     = rec.dance_scores?.[0]
  const overall   = score?.overall_score ?? null
  const timeline  = score?.timeline_data ?? []
  const refRecId  = score?.reference_recording_id ?? null

  useEffect(() => {
    let cancelled = false
    async function fetchUrls() {
      try {
        const token = await getToken()
        const [refRes, stuRes] = await Promise.all([
          refRecId
            ? fetch(`${SUPABASE_URL}/functions/v1/get-recording-url`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                  'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ recording_id: refRecId, session_id: rec.session_id }),
              }).then(r => r.json())
            : Promise.resolve(null),
          fetch(`${SUPABASE_URL}/functions/v1/get-recording-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
            body: JSON.stringify({ recording_id: rec.id, session_id: rec.session_id }),
          }).then(r => r.json()),
        ])
        if (!cancelled) {
          if (refRes?.url) setRefVideoUrl(refRes.url)
          if (stuRes?.url) setStudentVideoUrl(stuRes.url)
          else if (stuRes?.error) setUrlError(stuRes.error)
        }
      } catch (e) {
        if (!cancelled) setUrlError(e.message)
      }
    }
    fetchUrls()
    return () => { cancelled = true }
  }, [rec.id, rec.session_id, refRecId])

  useEffect(() => () => clearInterval(playTimerRef.current), [])

  function togglePlay() {
    const rv = refVideoRef.current
    const sv = stuVideoRef.current
    if (!rv || !sv) return
    if (isPlaying) {
      rv.pause()
      sv.pause()
      clearInterval(playTimerRef.current)
      setIsPlaying(false)
    } else {
      rv.currentTime = 0
      sv.currentTime = 0
      rv.play()
      sv.play()
      setIsPlaying(true)
      playTimerRef.current = setInterval(() => {
        if (rv.duration) setPlayPosition(rv.currentTime / rv.duration)
        if (rv.ended) {
          clearInterval(playTimerRef.current)
          setIsPlaying(false)
          setPlayPosition(0)
        }
      }, 200)
    }
  }

  function seekTo(t_ms) {
    const rv = refVideoRef.current
    const sv = stuVideoRef.current
    if (!rv || !sv) return
    const secs = t_ms / 1000
    rv.currentTime = secs
    sv.currentTime = secs
    if (rv.duration) setPlayPosition(secs / rv.duration)
  }

  const maxBarScore = 100
  const barWidth = timeline.length > 0 ? Math.max(2, Math.floor(560 / timeline.length)) : 4

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, overflowY: 'auto', padding: 20,
      }}
    >
      <div style={{
        background: '#1a1612', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 780, display: 'flex', flexDirection: 'column',
        gap: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: '#e2dbd4', fontSize: 16, fontWeight: 700 }}>
              {rec.sessions?.title || 'Student Recording'}
            </div>
            <div style={{ color: '#7a6e65', fontSize: 12, marginTop: 2 }}>
              {formatDate(rec.created_at)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 24, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
          >×</button>
        </div>

        {/* Large score */}
        {overall !== null && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <span style={{ fontSize: 64, fontWeight: 900, color: scoreColor(overall), lineHeight: 1 }}>
              {overall}
            </span>
            <span style={{ fontSize: 28, color: '#7a6e65', fontWeight: 700 }}>/100</span>
          </div>
        )}

        {/* Timeline bar chart */}
        {timeline.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Score Timeline
            </div>
            <div style={{ background: '#0f0c0c', borderRadius: 8, padding: '8px 10px', overflowX: 'auto' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 1, height: 60 }}>
                {timeline.map((pt, i) => {
                  const h = Math.max(2, Math.round((pt.score / maxBarScore) * 44))
                  const showLabel = pt.t_ms % 10000 === 0
                  return (
                    <div
                      key={i}
                      onClick={() => seekTo(pt.t_ms)}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, cursor: 'pointer' }}
                    >
                      <div style={{
                        width: barWidth, height: h,
                        background: scoreColor(pt.score),
                        borderRadius: 2,
                      }} />
                      {showLabel && (
                        <div style={{ fontSize: 8, color: '#7a6e65', marginTop: 2, whiteSpace: 'nowrap' }}>
                          {Math.round(pt.t_ms / 1000)}s
                        </div>
                      )}
                    </div>
                  )
                })}
                {/* Scrubber */}
                {isPlaying && timeline.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    left: `${playPosition * 100}%`,
                    top: 0, bottom: 0,
                    width: 2,
                    background: 'white',
                    opacity: 0.8,
                    pointerEvents: 'none',
                  }} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Play button */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
          <button
            onClick={togglePlay}
            disabled={!refVideoUrl || !studentVideoUrl}
            style={{
              background: (!refVideoUrl || !studentVideoUrl) ? '#2a2420' : '#c8430a',
              color: 'white', border: 'none', borderRadius: 8,
              padding: '10px 28px', fontSize: 14, fontWeight: 700,
              cursor: (!refVideoUrl || !studentVideoUrl) ? 'not-allowed' : 'pointer',
              opacity: (!refVideoUrl || !studentVideoUrl) ? 0.5 : 1,
            }}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play Both'}
          </button>
        </div>

        {/* Video players */}
        {urlError && (
          <div style={{ color: '#f87171', fontSize: 13 }}>{urlError}</div>
        )}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Reference</div>
            {refVideoUrl ? (
              <video
                ref={refVideoRef}
                src={refVideoUrl}
                controlsList="nodownload"
                onContextMenu={e => e.preventDefault()}
                style={{ width: '100%', borderRadius: 8, background: '#000' }}
              />
            ) : (
              <div style={{ width: '100%', height: 120, background: '#0f0c0c', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a6e65', fontSize: 12 }}>
                {refRecId ? 'Loading...' : 'No reference available'}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Student</div>
            {studentVideoUrl ? (
              <video
                ref={stuVideoRef}
                src={studentVideoUrl}
                muted
                controlsList="nodownload"
                onContextMenu={e => e.preventDefault()}
                style={{ width: '100%', borderRadius: 8, background: '#000' }}
              />
            ) : (
              <div style={{ width: '100%', height: 120, background: '#0f0c0c', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a6e65', fontSize: 12 }}>
                Loading...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── RecordingRow ─────────────────────────────────────────────────────────────

function RecordingRow({ rec, onToggle, onSaveLabel }) {
  const [label, setLabel]         = useState(rec.reference_label || '')
  const [poseStatus, setPoseStatus] = useState(null)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [showScoreReport, setShowScoreReport] = useState(false)
  const fadeTimer = useRef(null)

  const isStudent = rec.recorder_type === 'student'
  const r2Short = rec.r2_url ? ('…' + rec.r2_url.split('?')[0].slice(-30)) : '—'
  const scoreRow = rec.dance_scores?.[0]

  function handleToggle() {
    const turningOn = !rec.is_ai_reference
    onToggle(rec)
    if (turningOn) triggerExtractPose(rec.id)
  }

  async function triggerExtractPose(recordingId) {
    setPoseStatus('loading')
    clearTimeout(fadeTimer.current)
    try {
      const token = await getToken()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/extract-pose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ recording_id: recordingId }),
      })
      if (!res.ok) {
        setPoseStatus('error')
      } else {
        setPoseStatus('done')
        fadeTimer.current = setTimeout(() => setPoseStatus(null), 3000)
      }
    } catch {
      setPoseStatus('error')
    }
  }

  // Score badge for student rows
  function ScoreBadge() {
    if (!scoreRow) return <span style={{ color: '#7a6e65', fontSize: 12 }}>—</span>
    if (scoreRow.status === 'processing') return <span style={{ fontSize: 13 }}>⏳</span>
    if (scoreRow.status === 'scored' && scoreRow.overall_score != null) {
      const c = scoreColor(scoreRow.overall_score)
      return (
        <span style={{
          background: '#0f0c0c', color: c, border: `1px solid ${c}`,
          borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700,
        }}>
          {scoreRow.overall_score}/100
        </span>
      )
    }
    return <span style={{ color: '#7a6e65', fontSize: 12 }}>—</span>
  }

  return (
    <>
      {showSkeleton && (
        <SkeletonModal recordingId={rec.id} onClose={() => setShowSkeleton(false)} />
      )}
      {showScoreReport && (
        <ScoreReportModal rec={rec} onClose={() => setShowScoreReport(false)} />
      )}
      <tr style={{ borderBottom: '1px solid #f0ebe6' }}>
        {/* Session */}
        <td style={tdStyle}>
          <div style={{ fontWeight: 600, color: '#0f0c0c', fontSize: 13 }}>{rec.sessions?.title || '—'}</div>
        </td>
        {/* Date */}
        <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#5a4e47', fontSize: 13 }}>
          {formatDate(rec.sessions?.scheduled_at)}
        </td>
        {/* Type */}
        <td style={tdStyle}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
            background: isStudent ? '#1a1a3a' : '#1a3a2a',
            color: isStudent ? '#a78bfa' : '#86efac',
          }}>
            {isStudent ? 'Student' : 'Choreo'}
          </span>
        </td>
        {/* Duration */}
        <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#5a4e47', fontSize: 13 }}>
          {formatDuration(rec.duration_seconds)}
        </td>
        {/* R2 Key */}
        <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#9ca3af', fontSize: 11 }}>
          {r2Short}
        </td>
        {/* Reference (choreo) / Score badge (student) */}
        <td style={tdStyle}>
          {isStudent ? (
            <ScoreBadge />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={handleToggle}
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
              {poseStatus === 'loading' && (
                <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>⏳ Extracting...</span>
              )}
              {poseStatus === 'done' && (
                <span style={{ fontSize: 11, color: '#22c55e', whiteSpace: 'nowrap' }}>✅ Done</span>
              )}
              {poseStatus === 'error' && (
                <span style={{ fontSize: 11, color: '#f87171', whiteSpace: 'nowrap' }}>❌ Failed</span>
              )}
            </div>
          )}
        </td>
        {/* Label (choreo) / Score Report button (student) */}
        <td style={tdStyle}>
          {isStudent ? (
            scoreRow?.status === 'scored' ? (
              <button
                onClick={() => setShowScoreReport(true)}
                style={{
                  background: '#1a1a3a', color: '#a78bfa', border: '1px solid #7c3aed',
                  borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                📊 Score Report
              </button>
            ) : null
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
              {rec.pose_extracted && (
                <button
                  onClick={() => setShowSkeleton(true)}
                  title="Preview skeleton video"
                  style={{
                    background: '#e2dbd4', color: '#5a4e47', border: 'none',
                    borderRadius: 6, padding: '5px 10px', fontSize: 12,
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  ▶ Preview
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
    </>
  )
}

// ── RecordingsTab ────────────────────────────────────────────────────────────

export default function RecordingsTab() {
  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchRecordings() {
    const { data, error } = await supabase
      .from('recordings')
      .select('*, sessions(title, scheduled_at), dance_scores!dance_scores_upload_id_fkey(overall_score, status, timeline_data, created_at, reference_recording_id)')
      .order('created_at', { ascending: false })
    if (error) console.error('[RecordingsTab] fetch error:', error.message, error.details, error.hint)
    setRecordings(data || [])
    if (!data || data.length === 0) {
      const { data: simple, error: simpleErr } = await supabase
        .from('recordings')
        .select('id, recorder_type, created_at')
        .limit(3)
      console.log('[RecordingsTab] simple query result:', simple?.length, simpleErr?.message)
    }
    setLoading(false)
  }

  useEffect(() => { fetchRecordings() }, []) // eslint-disable-line react-hooks/set-state-in-effect

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
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>R2 Key</th>
                <th style={thStyle}>Reference / Score</th>
                <th style={thStyle}>Label / Report</th>
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
