import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TIME_SLOTS = [
  '06:00','06:30','07:00','07:30','08:00','08:30','09:00','09:30',
  '10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30',
  '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30',
  '18:00','18:30','19:00','19:30','20:00','20:30','21:00','21:30',
  '22:00','22:30',
]
function fmtTime(t) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 || 12
  return `${h12}:${m.toString().padStart(2,'0')} ${ampm}`
}

const statusColor = { draft: '#7a6e65', open: '#e8a020', confirmed: '#1a7a3c', full: '#5b4fcf', cancelled: '#cc0000', completed: '#333' }

export default function ChoreoPage({ user, profile, onLogout, onSwitchToLearning, onProfileClick }) {
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
    return sum + (price * (s.bookings_count || 0))
  }, 0)

  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2' }}>
      <nav style={{ background: '#0f0c0c', padding: '0 40px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 900, color: '#faf7f2' }}>
          Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
          <span style={{ fontSize: 12, color: 'rgba(250,247,242,0.4)', marginLeft: 12, fontFamily: 'sans-serif', fontWeight: 400 }}>Choreographer</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={onSwitchToLearning} style={{ background: 'transparent', border: '1px solid rgba(250,247,242,0.3)', color: '#faf7f2', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>💃 Switch to Learning</button>
          <button onClick={onProfileClick} style={{ background: 'transparent', border: '1px solid rgba(250,247,242,0.3)', color: '#faf7f2', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>My Profile</button>
          <button onClick={onLogout} style={{ background: 'transparent', border: '1px solid rgba(250,247,242,0.3)', color: '#faf7f2', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>Log out</button>
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        {/* STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            ['Total Sessions', sessions.length, '🎭'],
            ['Active Bookings', sessions.reduce((s, x) => s + (x.bookings_count || 0), 0), '💃'],
            ['Est. Revenue', `₹${totalRevenue.toLocaleString('en-IN')}`, '💰'],
          ].map(([label, value, icon]) => (
            <div key={label} style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: '1px solid #e2dbd4' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#0f0c0c', marginBottom: 4 }}>{value}</div>
              <div style={{ fontSize: 13, color: '#7a6e65' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* SESSIONS LIST */}
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2dbd4' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0ebe6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif' }}>My Sessions</h2>
            <button onClick={() => setShowCreate(true)} style={{ background: '#c8430a', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>+ New Session</button>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#7a6e65' }}>Loading...</div>
          ) : sessions.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎭</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', marginBottom: 8 }}>No sessions yet</h3>
              <p style={{ color: '#7a6e65', marginBottom: 24 }}>Create your first session to start earning</p>
              <button onClick={() => setShowCreate(true)} style={{ background: '#c8430a', color: 'white', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Create First Session</button>
            </div>
          ) : (
            sessions.map((s, i) => (
              <div key={s.id} style={{ padding: '16px 24px', borderBottom: i < sessions.length - 1 ? '1px solid #f0ebe6' : 'none', display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Cover thumbnail */}
                <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: '#f0ebe6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {s.cover_photo_url
                    ? <img src={s.cover_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 24 }}>🎭</span>
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f0c0c' }}>{s.title}</h3>
                    <span style={{ background: statusColor[s.status] + '22', color: statusColor[s.status], fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, textTransform: 'uppercase' }}>{s.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#7a6e65' }}>📅 {formatDate(s.scheduled_at)} · {s.style_tags?.[0]} · {s.skill_level?.replace(/_/g, ' ')}</div>
                </div>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0f0c0c' }}>{s.bookings_count || 0}/{s.max_seats}</div>
                    <div style={{ fontSize: 11, color: '#7a6e65' }}>seats</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1a7a3c' }}>₹{s.price_tiers?.length ? Math.min(...s.price_tiers.map(t => t.price)) : 0}</div>
                    <div style={{ fontSize: 11, color: '#7a6e65' }}>from</div>
                  </div>
                  {['open', 'draft'].includes(s.status) && (
                    <button onClick={() => setEditSession(s)} style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#5a4e47' }}>✏️ Edit</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showCreate && <SessionModal user={user} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchSessions() }} />}
      {editSession && <SessionModal user={user} session={editSession} onClose={() => setEditSession(null)} onSaved={() => { setEditSession(null); fetchSessions() }} />}
    </div>
  )
}

function SessionModal({ user, session, onClose, onSaved }) {
  const isEdit = !!session
  const [form, setForm] = useState({
    title: session?.title || '',
    description: session?.description || '',
    style: session?.style_tags?.[0] || 'bollywood',
    level: session?.skill_level || 'beginner',
    date: session?.scheduled_at ? new Date(session.scheduled_at).toISOString().split('T')[0] : '',
    time: session?.scheduled_at ? (() => {
      const d = new Date(session.scheduled_at)
      const h = d.getHours().toString().padStart(2,'0')
      const m = d.getMinutes() < 30 ? '00' : '30'
      return `${h}:${m}`
    })() : '',
    duration: session?.duration_minutes || 60,
    price: session?.price_tiers?.[0]?.price || 499,
    max_seats: session?.max_seats || 20,
    min_seats: session?.min_seats || 5,
  })
  const [saving, setSaving] = useState(false)
  const [coverUrl, setCoverUrl] = useState(session?.cover_photo_url || null)
  const [uploadingCover, setUploadingCover] = useState(false)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  async function uploadCover(file) {
    if (!file) return
    const ext = file.name.split('.').pop()
    const path = `${user.id}/${Date.now()}.${ext}`
    setUploadingCover(true)
    const { error } = await supabase.storage.from('session-covers').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { alert('Upload failed: ' + error.message); setUploadingCover(false); return }
    const { data } = supabase.storage.from('session-covers').getPublicUrl(path)
    setCoverUrl(data.publicUrl)
    setUploadingCover(false)
  }

  async function handleSave() {
    if (!form.title || !form.date || !form.time) { alert('Please fill in title, date and time'); return }
    setSaving(true)
    const scheduledAt = new Date(`${form.date}T${form.time}:00`).toISOString()
    const payload = {
      title: form.title,
      description: form.description,
      style_tags: [form.style],
      skill_level: form.level,
      scheduled_at: scheduledAt,
      duration_minutes: form.duration,
      price_tiers: [{ seats: form.max_seats, price: form.price }],
      min_seats: form.min_seats,
      max_seats: form.max_seats,
      cover_photo_url: coverUrl || null,
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

          {/* COVER PHOTO */}
          <div>
            <label style={labelStyle}>Cover Photo <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, border: '2px dashed #e2dbd4', cursor: 'pointer', background: '#faf7f2', overflow: 'hidden', position: 'relative', minHeight: coverUrl ? 0 : 110 }}>
              {coverUrl ? (
                <div style={{ position: 'relative', width: '100%' }}>
                  <img src={coverUrl} alt="cover" style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block', borderRadius: 10 }} />
                  <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>Change photo</div>
                </div>
              ) : uploadingCover ? (
                <div style={{ color: '#7a6e65', fontSize: 13, padding: 24 }}>Uploading...</div>
              ) : (
                <div style={{ textAlign: 'center', color: '#7a6e65', padding: 24 }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Click to upload cover photo</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>JPG or PNG · Landscape works best</div>
                </div>
              )}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadCover(e.target.files[0])} />
            </label>
          </div>

          <div>
            <label style={labelStyle}>Session Title *</label>
            <input style={inputStyle} placeholder="e.g. Bollywood Beats Vol. 3" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="What will learners experience in this session?" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Dance Style</label>
              <select style={inputStyle} value={form.style} onChange={e => set('style', e.target.value)}>
                {['bollywood', 'bharatanatyam', 'contemporary', 'hiphop', 'kathak', 'folk', 'jazz', 'fusion'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Skill Level</label>
              <select style={inputStyle} value={form.level} onChange={e => set('level', e.target.value)}>
                {[['absolute_beginner','Absolute Beginner'],['beginner','Beginner'],['intermediate','Intermediate'],['advanced','Advanced']].map(([v,l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* DATE + TIME — time as dropdown with 30min slots */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Date *</label>
              <input style={inputStyle} type="date" value={form.date} onChange={e => set('date', e.target.value)} min={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <label style={labelStyle}>Start Time *</label>
              <select style={inputStyle} value={form.time} onChange={e => set('time', e.target.value)}>
                <option value="">Select time...</option>
                {TIME_SLOTS.map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
              </select>
            </div>
          </div>

          {/* DURATION */}
          <div>
            <label style={labelStyle}>Duration</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[45, 60, 75, 90, 120].map(d => (
                <button key={d} onClick={() => set('duration', d)} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid #e2dbd4',
                  background: form.duration === d ? '#0f0c0c' : 'white',
                  color: form.duration === d ? 'white' : '#5a4e47',
                }}>{d} min</button>
              ))}
            </div>
          </div>

          {/* SEATS + PRICE */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Price (₹)</label>
              <input style={inputStyle} type="number" min="0" value={form.price} onChange={e => set('price', +e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Max Seats</label>
              <input style={inputStyle} type="number" min="1" max="200" value={form.max_seats} onChange={e => set('max_seats', +e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Min Seats</label>
              <input style={inputStyle} type="number" min="1" value={form.min_seats} onChange={e => set('min_seats', +e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#7a6e65', marginTop: -12 }}>Min seats = session confirms automatically when reached. Max seats = booking closes when full.</div>

          {isEdit && (
            <div style={{ background: '#fff8e6', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#7a6e65' }}>
              ⚠️ Editing a live session — learners who already booked will not be notified automatically. For major changes (date/time), consider cancelling and recreating.
            </div>
          )}

          <button onClick={handleSave} disabled={saving || uploadingCover} style={{ width: '100%', background: '#c8430a', color: 'white', border: 'none', borderRadius: 10, padding: 14, fontSize: 16, fontWeight: 600, cursor: (saving || uploadingCover) ? 'not-allowed' : 'pointer', opacity: (saving || uploadingCover) ? 0.7 : 1 }}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes →' : 'Create Session →'}
          </button>
        </div>
      </div>
    </div>
  )
}
