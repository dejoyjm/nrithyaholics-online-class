import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ImageCropUploader from '../components/ImageCropUploader'

// ── Time picker helpers ──────────────────────────────────────
// Replaced TIME_SLOTS array with hour + minute dropdowns.
// Covers 24x7 at 15-minute granularity (96 possible slots).
const HOURS   = Array.from({ length: 24 }, (_, i) => i)           // 0 – 23
const MINUTES = ['00', '15', '30', '45']

function fmtHour(h) {
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12  = h % 12 || 12
  return `${h12} ${ampm}`
}

// Convert stored "HH:MM" string → { hour: number, minute: string }
// Used when editing an existing session.
function parseTimeString(t) {
  if (!t) return { hour: 9, minute: '00' }
  const [h, m] = t.split(':').map(Number)
  // Round minute down to nearest 15
  const mins = [0, 15, 30, 45]
  const nearest = mins.reduce((prev, curr) => Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev, 0)
  return { hour: h, minute: String(nearest).padStart(2, '0') }
}

// Local date string helper — IST-safe (avoids UTC off-by-one-day bug)
function toLocalDateString(utcStr) {
  const d = new Date(utcStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const statusColor = { draft: '#7a6e65', open: '#e8a020', confirmed: '#1a7a3c', full: '#5b4fcf', cancelled: '#cc0000', completed: '#333' }

// Choreo entry window driven entirely by platform_config host settings
function canChoreoStartNow(session, platformConfig) {
  if (['cancelled', 'completed'].includes(session.status)) return false
  const start = new Date(session.scheduled_at).getTime()
  const end = start + (session.duration_minutes || 60) * 60 * 1000
  const now = Date.now()
  const preJoinMs = (session.host_pre_join_minutes_override ?? platformConfig?.host_pre_join_minutes ?? 15) * 60 * 1000
  const graceMs   = (session.host_grace_minutes_override    ?? platformConfig?.host_grace_minutes    ?? 30) * 60 * 1000
  return now >= start - preJoinMs && now <= end + graceMs
}

export default function ChoreoPage({ user, profile, platformConfig, onLogout, onSwitchToLearning, onProfileClick, onStartClass }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editSession, setEditSession] = useState(null)

  useEffect(() => { fetchSessions() }, [])

  async function fetchSessions() {
    const { data, error } = await supabase
      .from('sessions').select('*')
      .eq('choreographer_id', user.id)
      .order('scheduled_at', { ascending: false })
    if (error) console.error(error)
    else setSessions(data || [])
    setLoading(false)
  }

  const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })

  const totalRevenue = sessions.reduce((sum, s) => {
    const price = s.price_tiers?.length ? Math.min(...s.price_tiers.map(t => t.price)) : 0
    return sum + (s.bookings_count || 0) * price
  }, 0)

  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2' }}>
      {/* Header */}
      <div style={{ background: '#0f0c0c', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'Georgia, serif', fontWeight: 700, color: '#faf7f2', fontSize: 20 }}>
          Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
          <span style={{ fontSize: 13, fontWeight: 400, color: '#a09890', marginLeft: 12 }}>Choreographer Dashboard</span>
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={onProfileClick} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#faf7f2', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>👤 Profile</button>
          <button onClick={onSwitchToLearning} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#faf7f2', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>🎓 Learner Mode</button>
          <button onClick={onLogout} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#a09890', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Logout</button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ background: '#1a1410', padding: '20px 24px', display: 'flex', gap: 32 }}>
        {[
          { label: 'Total Sessions', value: sessions.length },
          { label: 'Active', value: sessions.filter(s => ['open','confirmed'].includes(s.status)).length },
          { label: 'Total Bookings', value: sessions.reduce((s, x) => s + (x.bookings_count || 0), 0) },
          { label: 'Est. Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}` },
        ].map(stat => (
          <div key={stat.label}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#faf7f2' }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: '#7a6e65', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Sessions list */}
      <div style={{ maxWidth: 900, margin: '32px auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 800, color: '#0f0c0c' }}>Your Sessions</h2>
          <button onClick={() => setShowCreate(true)}
            style={{ background: '#c8430a', color: 'white', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            + Create Session
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#7a6e65' }}>Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, background: 'white', borderRadius: 16, border: '1px solid #e2dbd4' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎭</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', marginBottom: 8 }}>No sessions yet</div>
            <div style={{ fontSize: 14, color: '#7a6e65', marginBottom: 24 }}>Create your first session to start teaching</div>
            <button onClick={() => setShowCreate(true)}
              style={{ background: '#c8430a', color: 'white', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Create First Session
            </button>
          </div>
        ) : (
          sessions.map(s => {
            const canStart = canChoreoStartNow(s, platformConfig)
            return (
              <div key={s.id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e2dbd4', padding: '20px 24px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 20 }}>
                {s.cover_photo_url && (
                  <img src={s.cover_photo_url} alt="" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#0f0c0c' }}>{s.title}</span>
                    <span style={{ background: statusColor[s.status] + '22', color: statusColor[s.status], fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase' }}>{s.status}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#7a6e65' }}>{formatDate(s.scheduled_at)} · {s.duration_minutes} min · {s.bookings_count || 0}/{s.max_seats} seats</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0f0c0c' }}>
                    ₹{s.price_tiers?.length ? Math.min(...s.price_tiers.map(t => t.price)) : 0}
                  </div>
                  <div style={{ fontSize: 11, color: '#7a6e65' }}>from</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {canStart && onStartClass && (
                    <button onClick={() => onStartClass(s)}
                      style={{ background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      🎬 Start Class
                    </button>
                  )}
                  {['open', 'draft', 'confirmed'].includes(s.status) && (
                    <button onClick={() => setEditSession(s)}
                      style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#5a4e47' }}>
                      ✏️ Edit
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {showCreate && <SessionModal user={user} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchSessions() }} />}
      {editSession && <SessionModal user={user} session={editSession} onClose={() => setEditSession(null)} onSaved={() => { setEditSession(null); fetchSessions() }} />}
    </div>
  )
}

function SessionModal({ user, session, onClose, onSaved }) {
  const isEdit = !!session

  // ── Parse existing time into hour + minute if editing ────────
  const existingTime = session?.scheduled_at ? parseTimeString((() => {
    const d = new Date(session.scheduled_at)
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
  })()) : { hour: 9, minute: '00' }

  const [form, setForm] = useState({
    title:             session?.title || '',
    description:       session?.description || '',
    style:             session?.style_tags?.[0] || 'bollywood',
    level:             session?.skill_level || 'beginner',
    // ✅ IST-safe local date (not UTC ISO string)
    date:              session?.scheduled_at ? toLocalDateString(session.scheduled_at) : '',
    hour:              existingTime.hour,
    minute:            existingTime.minute,
    duration:          session?.duration_minutes || 60,
    price:             session?.price_tiers?.[0]?.price || 499,
    max_seats:         session?.max_seats || 20,
    min_seats:         session?.min_seats || 5,
    age_groups:        session?.age_groups || ['All Ages'],
    choreo_reference_url: session?.choreo_reference_url || '',
  })
  const [saving, setSaving] = useState(false)
  const [coverUrl, setCoverUrl] = useState(session?.cover_photo_url || null)
  // Stable storage path for this upload session
  const [coverPath] = useState(() => `${user.id}/${session?.id || Date.now()}.jpg`)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  async function handleSave() {
    if (!form.title || !form.date || form.hour === '' || !form.minute) {
      alert('Please fill in title, date and time')
      return
    }
    setSaving(true)
    // Construct local datetime — browser interprets YYYY-MM-DDTHH:MM:SS as local time (IST-safe)
    const timeStr = `${String(form.hour).padStart(2,'0')}:${form.minute}:00`
    const scheduledAt = new Date(`${form.date}T${timeStr}`).toISOString()
    const payload = {
      title:           form.title,
      description:     form.description,
      style_tags:      [form.style],
      skill_level:     form.level,
      scheduled_at:    scheduledAt,
      duration_minutes: form.duration,
      price_tiers:     [{ seats: form.max_seats, price: form.price }],
      min_seats:       form.min_seats,
      max_seats:       form.max_seats,
      cover_photo_url:      coverUrl || null,
      age_groups:           form.age_groups.length > 0 ? form.age_groups : ['All Ages'],
      choreo_reference_url: form.choreo_reference_url.trim() || null,
    }
    let error
    if (isEdit) {
      ({ error } = await supabase.from('sessions').update(payload).eq('id', session.id))
    } else {
      ({ error } = await supabase.from('sessions').insert({ ...payload, choreographer_id: user.id, status: 'open' }))
    }
    if (error) alert('Error: ' + error.message)
    else onSaved()
    setSaving(false)
  }

  const inputStyle = {
    width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4',
    borderRadius: 8, padding: '10px 14px', fontSize: 14,
    outline: 'none', boxSizing: 'border-box', color: '#0f0c0c',
  }
  const labelStyle = { fontSize: 12, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 36, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif' }}>
            {isEdit ? 'Edit Session' : 'Create New Session'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#7a6e65' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Cover photo */}
          <div>
            <ImageCropUploader
              bucket="session-covers"
              path={coverPath}
              aspectRatio={4 / 5}
              currentUrl={coverUrl}
              onUploadComplete={(url) => setCoverUrl(url)}
              label="Cover Photo"
            />
            {coverUrl && (
              <button onClick={() => setCoverUrl(null)}
                style={{ marginTop: 8, background: 'transparent', border: 'none', color: '#cc0000', fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                ✕ Remove photo
              </button>
            )}
          </div>

          {/* Title */}
          <div>
            <label style={labelStyle}>Session Title *</label>
            <input style={inputStyle} placeholder='e.g. "Bollywood Beats Vol. 3"' value={form.title} onChange={e => set('title', e.target.value)} />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="What will learners experience in this session?" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          {/* Style + Level */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Dance Style</label>
              <select style={inputStyle} value={form.style} onChange={e => set('style', e.target.value)}>
                {['bollywood', 'bharatanatyam', 'contemporary', 'hip-hop', 'kathak', 'folk', 'jazz', 'fusion'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Skill Level</label>
              <select style={inputStyle} value={form.level} onChange={e => set('level', e.target.value)}>
                {['beginner', 'intermediate', 'advanced', 'all_levels'].map(l => (
                  <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date + Time ── NEW: hour + minute dropdowns, 24x7, 15-min granularity */}
          <div>
            <label style={labelStyle}>Date & Time *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.8fr', gap: 10 }}>
              {/* Date */}
              <input type="date" style={inputStyle} value={form.date}
                onChange={e => set('date', e.target.value)}
                min={new Date().toISOString().split('T')[0]} />
              {/* Hour */}
              <select style={inputStyle} value={form.hour} onChange={e => set('hour', Number(e.target.value))}>
                {HOURS.map(h => (
                  <option key={h} value={h}>{fmtHour(h)}</option>
                ))}
              </select>
              {/* Minute */}
              <select style={inputStyle} value={form.minute} onChange={e => set('minute', e.target.value)}>
                {MINUTES.map(m => (
                  <option key={m} value={m}>:{m}</option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: 11, color: '#a09890', marginTop: 6 }}>
              {form.date && form.hour !== '' ? (() => {
                const d = new Date(`${form.date}T${String(form.hour).padStart(2,'0')}:${form.minute}:00`)
                return `Scheduled: ${d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} at ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`
              })() : 'Select a date and time'}
            </div>
          </div>

          {/* Duration + Price */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Duration (minutes)</label>
              <select style={inputStyle} value={form.duration} onChange={e => set('duration', Number(e.target.value))}>
                {[30, 45, 60, 75, 90, 120].map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Price per seat (₹)</label>
              <input type="number" style={inputStyle} value={form.price} onChange={e => set('price', Number(e.target.value))} min="0" />
            </div>
          </div>

          {/* Min + Max seats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Min Seats</label>
              <input type="number" style={inputStyle} value={form.min_seats} onChange={e => set('min_seats', Number(e.target.value))} min="1" />
            </div>
            <div>
              <label style={labelStyle}>Max Seats</label>
              <input type="number" style={inputStyle} value={form.max_seats} onChange={e => set('max_seats', Number(e.target.value))} min="1" />
            </div>
          </div>

          {/* Age Groups */}
          <div>
            <label style={labelStyle}>Age Groups</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['Kids', 'Teens', 'Adults', 'Seniors', 'All Ages'].map(ag => {
                const active = form.age_groups.includes(ag)
                return (
                  <button key={ag} type="button" onClick={() => {
                    const next = active ? form.age_groups.filter(x => x !== ag) : [...form.age_groups, ag]
                    set('age_groups', next.length > 0 ? next : ['All Ages'])
                  }} style={{
                    background: active ? '#5b4fcf' : '#faf7f2',
                    color: active ? 'white' : '#5a4e47',
                    border: '1px solid #e2dbd4', borderRadius: 20,
                    padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: active ? 700 : 400,
                  }}>{ag}</button>
                )
              })}
            </div>
          </div>

          {/* Choreography Reference Link */}
          <div>
            <label style={labelStyle}>Choreography Reference Link (optional)</label>
            <input style={inputStyle}
              placeholder="Instagram reel, YouTube video, or any link showing the dance..."
              value={form.choreo_reference_url}
              onChange={e => set('choreo_reference_url', e.target.value)} />
          </div>

          {/* Save */}
          <button onClick={handleSave} disabled={saving}
            style={{ background: saving ? '#a09890' : '#c8430a', color: 'white', border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', marginTop: 8 }}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes →' : 'Create Session →'}
          </button>

        </div>
      </div>
    </div>
  )
}