import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import ImageCropUploader from '../../components/ImageCropUploader'

const ADMIN_HOURS   = Array.from({ length: 24 }, (_, i) => i)
const ADMIN_MINUTES = ['00', '15', '30', '45']
function fmtAdminHour(h) {
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${h % 12 || 12} ${ampm}`
}
function parseAdminTime(utcStr) {
  if (!utcStr) return { hour: 9, minute: '00' }
  const d = new Date(utcStr)
  const h = d.getHours()
  const m = d.getMinutes()
  const mins = [0, 15, 30, 45]
  const nearest = mins.reduce((prev, curr) => Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev, 0)
  return { hour: h, minute: String(nearest).padStart(2, '0') }
}
function toLocalDateString(utcStr) {
  const d = new Date(utcStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function SessionsTab({ sessions, waitlistCounts, onRefresh }) {
  const [sessionsSearch, setSessionsSearch] = useState('')
  const [sessionsStatusFilter, setSessionsStatusFilter] = useState('active')
  const [adminEditSession, setAdminEditSession] = useState(null)

  async function adminCancelSession(sessionId) {
    if (!window.confirm('Cancel this session? All bookings will be cancelled.')) return
    await supabase.from('bookings').update({ status: 'cancelled', cancelled_reason: 'admin_cancelled', cancelled_at: new Date().toISOString() }).eq('session_id', sessionId)
    await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', sessionId)
    onRefresh()
  }

  async function adminSetSessionStatus(sessionId, newStatus) {
    const { error } = await supabase.from('sessions').update({ status: newStatus }).eq('id', sessionId)
    if (error) alert(error.message)
    else onRefresh()
  }

  const filteredSessions = sessions.filter(s => {
    const q = sessionsSearch.toLowerCase()
    if (q && !(s.title || '').toLowerCase().includes(q)) return false
    if (sessionsStatusFilter === 'active') return ['open', 'confirmed', 'draft'].includes(s.status)
    if (sessionsStatusFilter === 'completed') return s.status === 'completed'
    if (sessionsStatusFilter === 'cancelled') return s.status === 'cancelled'
    return true
  })

  function downloadSessionsCSV() {
    const rows = [['Title', 'Choreographer', 'Date (IST)', 'Status', 'Seats Booked', 'Max Seats', 'Price', 'Style']]
    filteredSessions.forEach(s => rows.push([
      s.title || '',
      s.profiles?.full_name || '',
      new Date(s.scheduled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }),
      s.status || '',
      s.bookings_count || 0,
      s.max_seats || '',
      s.price_tiers?.[0]?.price || '',
      s.style_tags?.join('; ') || '',
    ]))
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'sessions.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function statusBadge(status) {
    const cfg = {
      confirmed: ['#e6f4ec', '#1a7a3c'],
      open:      ['#fff8e6', '#e8a020'],
      draft:     ['#f0ebe6', '#7a6e65'],
      completed: ['#e8f4fd', '#1a5db5'],
      cancelled: ['#fff0f0', '#cc0000'],
    }[status] || ['#f0ebe6', '#7a6e65']
    return <span style={{ background: cfg[0], color: cfg[1], fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase' }}>{status}</span>
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, padding: '16px 20px', borderBottom: '1px solid #f0ebe6', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Search sessions..."
          value={sessionsSearch}
          onChange={e => setSessionsSearch(e.target.value)}
          style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: 220, outline: 'none' }}
        />
        <select value={sessionsStatusFilter} onChange={e => setSessionsStatusFilter(e.target.value)}
          style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }}>
          <option value="active">Active</option>
          <option value="all">All</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button onClick={downloadSessionsCSV}
          style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#5a4e47', marginLeft: 'auto' }}>
          📥 Download CSV
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #f0ebe6' }}>
            {['Session', 'Choreographer', 'Date', 'Seats', 'Status', ''].map(h => (
              <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredSessions.map((s, i) => (
            <tr key={s.id} style={{ borderBottom: i < filteredSessions.length - 1 ? '1px solid #f0ebe6' : 'none' }}>
              <td style={{ padding: '14px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#f0ebe6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {s.cover_photo_url
                      ? <img src={s.cover_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 18 }}>🎭</span>
                    }
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0f0c0c' }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: '#7a6e65' }}>{s.style_tags?.join(', ')}</div>
                  </div>
                </div>
              </td>
              <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47' }}>{s.profiles?.full_name || '—'}</td>
              <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47', whiteSpace: 'nowrap' }}>
                {new Date(s.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {s.session_type === 'series' && Array.isArray(s.series_parts) && s.series_parts.length > 1 && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: '#5b4fcf', fontWeight: 700 }}>· Series · {s.series_parts.length} parts</span>
                )}
              </td>
              <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47' }}>
                {s.bookings_count || 0} / {s.max_seats || '—'}
                {waitlistCounts[s.id] > 0 && (
                  <span style={{ marginLeft: 8, background: '#fff8e6', color: '#e8a020', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>
                    +{waitlistCounts[s.id]} waiting
                  </span>
                )}
              </td>
              <td style={{ padding: '14px 20px' }}>{statusBadge(s.status)}</td>
              <td style={{ padding: '14px 20px' }}>
                <SessionRowActions
                  session={s}
                  onEdit={() => setAdminEditSession(s)}
                  onCancel={() => adminCancelSession(s.id)}
                  onSetStatus={(st) => adminSetSessionStatus(s.id, st)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {adminEditSession && (
        <AdminSessionEditModal
          session={adminEditSession}
          onClose={() => setAdminEditSession(null)}
          onSaved={() => { setAdminEditSession(null); onRefresh() }}
        />
      )}
    </>
  )
}

function SessionRowActions({ session: s, onEdit, onCancel, onSetStatus }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (btnRef.current && !btnRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const items = [
    { label: '✏️ Edit', action: () => { setOpen(false); onEdit() }, always: true },
    { label: '↩️ Reopen', action: () => { setOpen(false); onSetStatus('open') }, always: true },
    { label: '✓ Confirm', action: () => { setOpen(false); onSetStatus('confirmed') }, hide: s.status === 'confirmed' },
    { label: '✓ Mark Completed', action: () => { setOpen(false); onSetStatus('completed') }, hide: s.status === 'completed' },
    { label: '✕ Cancel', action: () => { setOpen(false); onCancel() }, hide: s.status === 'cancelled', danger: true },
  ].filter(item => !item.hide)

  return (
    <div ref={btnRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#5a4e47', whiteSpace: 'nowrap' }}
      >
        ⚡ Actions ▾
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'white', border: '1px solid #e2dbd4', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 190, overflow: 'hidden' }}>
          {items.map(item => (
            <button
              key={item.label}
              onClick={item.action}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 13, background: 'white', border: 'none', cursor: 'pointer', color: item.danger ? '#cc0000' : '#0f0c0c', fontWeight: 500 }}
              onMouseEnter={e => { e.currentTarget.style.background = item.danger ? '#fff0f0' : '#faf7f2' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AdminSessionEditModal({ session, onClose, onSaved }) {
  const [waitlist, setWaitlist] = useState([])

  useEffect(() => {
    supabase.from('waitlist').select('email, created_at')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setWaitlist(data || []))
  }, [session.id])

  const [form, setForm] = useState({
    title: session.title || '',
    description: session.description || '',
    date: session.scheduled_at ? toLocalDateString(session.scheduled_at) : '',
    hour:   session.scheduled_at ? parseAdminTime(session.scheduled_at).hour   : 9,
    minute: session.scheduled_at ? parseAdminTime(session.scheduled_at).minute : '00',
    duration: session.duration_minutes || 60,
    price: session.price_tiers?.[0]?.price || 0,
    max_seats: session.max_seats || 20,
    min_seats: session.min_seats || 5,
    status: session.status || 'open',
    age_groups: session.age_groups || ['All Ages'],
    choreo_reference_url: session.choreo_reference_url || '',
    cover_photo_url: session.cover_photo_url || '',
    cover_photo_focal_x: session.cover_photo_focal_x ?? 50,
    cover_photo_focal_y: session.cover_photo_focal_y ?? 50,
    card_thumbnail_url: session.card_thumbnail_url || '',
    card_thumbnail_focal_x: session.card_thumbnail_focal_x ?? 50,
    card_thumbnail_focal_y: session.card_thumbnail_focal_y ?? 50,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const [coverPath] = useState(() => `hero/${session.id}_${Date.now()}.jpg`)
  const [thumbnailPath] = useState(() => `card/${session.id}_${Date.now()}.jpg`)

  const inputStyle = { width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box', color: '#0f0c0c' }
  const labelStyle = { fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }

  async function handleSave() {
    if (!form.title || !form.date || form.hour === '' || !form.minute) { alert('Title, date and time required'); return }
    setSaving(true)
    const timeStr = `${String(form.hour).padStart(2,'0')}:${form.minute}:00`
    const scheduledAt = new Date(`${form.date}T${timeStr}`).toISOString()
    const { error } = await supabase.from('sessions').update({
      title: form.title,
      description: form.description,
      scheduled_at: scheduledAt,
      duration_minutes: Number(form.duration),
      price_tiers: [{ seats: form.max_seats, price: form.price }],
      max_seats: Number(form.max_seats),
      min_seats: Number(form.min_seats),
      status: form.status,
      age_groups: form.age_groups.length > 0 ? form.age_groups : ['All Ages'],
      choreo_reference_url: form.choreo_reference_url.trim() || null,
      cover_photo_url: form.cover_photo_url.trim() || null,
      cover_photo_focal_x: form.cover_photo_url.trim() ? form.cover_photo_focal_x : null,
      cover_photo_focal_y: form.cover_photo_url.trim() ? form.cover_photo_focal_y : null,
      card_thumbnail_url: form.card_thumbnail_url.trim() || null,
      card_thumbnail_focal_x: form.card_thumbnail_url.trim() ? form.card_thumbnail_focal_x : null,
      card_thumbnail_focal_y: form.card_thumbnail_url.trim() ? form.card_thumbnail_focal_y : null,
    }).eq('id', session.id)
    if (error) alert(error.message)
    else onSaved()
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 32, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif' }}>Edit Session</h2>
            <div style={{ fontSize: 11, color: '#e8a020', fontWeight: 600, marginTop: 2 }}>⚡ Admin Override</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#7a6e65' }}>×</button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#e8a020', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>⚡ Admin Override</div>
          <ImageCropUploader
            bucket="session-covers"
            path={coverPath}
            aspectRatio={4 / 5}
            currentUrl={form.cover_photo_url}
            allowCropAdjust={true}
            label="Session Cover Photo (4:5)"
            onUploadComplete={(url, fx, fy) => {
              set('cover_photo_url', url)
              set('cover_photo_focal_x', fx ?? 50)
              set('cover_photo_focal_y', fy ?? 50)
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Session Title</label>
            <input style={inputStyle} value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input style={inputStyle} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Start Time</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select style={inputStyle} value={form.hour} onChange={e => set('hour', Number(e.target.value))}>
                  {ADMIN_HOURS.map(h => (
                    <option key={h} value={h}>{fmtAdminHour(h)}</option>
                  ))}
                </select>
                <select style={inputStyle} value={form.minute} onChange={e => set('minute', e.target.value)}>
                  {ADMIN_MINUTES.map(m => (
                    <option key={m} value={m}>:{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Duration (mins)</label>
              <select style={inputStyle} value={form.duration} onChange={e => set('duration', Number(e.target.value))}>
                {[30, 45, 60, 75, 90, 120].map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={form.status} onChange={e => set('status', e.target.value)}>
                {['draft','open','confirmed','cancelled','completed'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          {session.session_type === 'series' && Array.isArray(session.series_parts) && session.series_parts.length > 0 && (
            <div style={{ background: '#fff8e6', border: '1px solid #f0c040', borderRadius: 8, padding: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: '#7a5a00', marginBottom: 8 }}>Workshop Series: {session.series_parts.length} parts</div>
              {[...session.series_parts].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()).map((p, idx) => (
                <div key={p.part} style={{ color: '#5a4e47', marginBottom: idx < session.series_parts.length - 1 ? 6 : 0 }}>
                  <strong>Part {p.part}</strong> — {new Date(p.start).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })} · {new Date(p.start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} ({p.duration_minutes} min)
                </div>
              ))}
              <div style={{ fontSize: 12, color: '#a09890', marginTop: 10 }}>To edit series dates, ask the choreographer to update via their dashboard.</div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Price (₹)</label>
              <input style={inputStyle} type="number" min="0" value={form.price} onChange={e => set('price', Number(e.target.value))} />
            </div>
            <div>
              <label style={labelStyle}>Min Seats</label>
              <input style={inputStyle} type="number" min="1" value={form.min_seats} onChange={e => set('min_seats', Number(e.target.value))} />
            </div>
            <div>
              <label style={labelStyle}>Max Seats</label>
              <input style={inputStyle} type="number" min="1" value={form.max_seats} onChange={e => set('max_seats', Number(e.target.value))} />
            </div>
          </div>
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
        </div>

        <div>
          <label style={labelStyle}>Choreography Reference Link (optional)</label>
          <input style={inputStyle} value={form.choreo_reference_url}
            onChange={e => set('choreo_reference_url', e.target.value)}
            placeholder="Instagram reel, YouTube video, or any link showing the dance..." />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, color: '#e8a020', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>⚡ Admin Override</div>
          <ImageCropUploader
            bucket="session-covers"
            path={thumbnailPath}
            aspectRatio={16 / 9}
            currentUrl={form.card_thumbnail_url}
            allowCropAdjust={true}
            label="Card Thumbnail (16:9)"
            onUploadComplete={(url, fx, fy) => {
              set('card_thumbnail_url', url)
              set('card_thumbnail_focal_x', fx ?? 50)
              set('card_thumbnail_focal_y', fy ?? 50)
            }}
          />
        </div>

        {waitlist.length > 0 && (
          <div style={{ marginTop: 24, borderTop: '1px solid #e2dbd4', paddingTop: 20 }}>
            <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontWeight: 700 }}>
              Waitlist ({waitlist.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
              {waitlist.map((w, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#faf7f2', padding: '8px 12px', borderRadius: 8 }}>
                  <span style={{ fontSize: 13, color: '#0f0c0c' }}>{w.email}</span>
                  <span style={{ fontSize: 11, color: '#7a6e65' }}>
                    {new Date(w.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, background: 'transparent', border: '1px solid #e2dbd4', color: '#7a6e65', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, background: '#c8430a', color: 'white', padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', border: 'none', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes →'}
          </button>
        </div>
      </div>
    </div>
  )
}
