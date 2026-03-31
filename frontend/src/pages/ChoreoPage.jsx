import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ImageCropUploader from '../components/ImageCropUploader'
import { isIST, getTimezoneCode, toISTPreview } from '../utils/timezone'
import { resolvePolicy, calculateSessionSettlement } from '../utils/revenue'

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
  const [musicSession, setMusicSession] = useState(null)
  const [revPolicies, setRevPolicies] = useState([])

  useEffect(() => { fetchSessions() }, [])
  useEffect(() => {
    supabase.from('revenue_policies').select('*, revenue_policy_slabs(*)')
      .then(({ data }) => setRevPolicies(data || []))
  }, [])

  async function fetchSessions() {
    const { data, error } = await supabase
      .from('sessions').select('*, pricing_rules(*)')
      .eq('choreographer_id', user.id)
      .order('scheduled_at', { ascending: false })
    if (error) console.error(error)
    else setSessions(data || [])
    setLoading(false)
  }

  function getActiveRule(s) {
    const now = new Date()
    const confirmedBookings = s.bookings_count || 0
    for (const rule of (s.pricing_rules || [])) {
      if (rule.valid_until && new Date(rule.valid_until) < now) continue
      if (rule.max_tickets != null && confirmedBookings >= rule.max_tickets) continue
      return rule
    }
    return null
  }

  const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })

  function getSessionEarnings(s) {
    const bookings = s.bookings_count || 0
    const price = s.price_tiers?.length ? s.price_tiers[0].price : 0
    if (!bookings || !price) return 0
    const policy = resolvePolicy(s, profile, revPolicies)
    const slabs = policy?.revenue_policy_slabs || []
    return calculateSessionSettlement(bookings, price, policy, slabs).choreoShare
  }

  const totalRevenue = sessions.reduce((sum, s) => sum + getSessionEarnings(s), 0)

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
          { label: 'Est. Earnings', value: `₹${totalRevenue.toLocaleString('en-IN')}` },
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
                  <div style={{ fontSize: 13, color: '#7a6e65' }}>{formatDate(s.scheduled_at)} · {s.duration_minutes} min · {s.bookings_count || 0}/{s.max_seats} seats
                    {(s.bookings_count > 0) && (
                      <span style={{ marginLeft: 8, color: '#1a7a3c', fontWeight: 600 }}>
                        · Est. earnings: ₹{getSessionEarnings(s).toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                  {s.music_track_url && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                      {s.music_track_thumb && (
                        <img src={s.music_track_thumb} alt="" style={{ width: 24, height: 18, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 12, color: '#c8430a', fontWeight: 600 }}>🎵 {s.music_track_title || 'Track ready'}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  {(() => {
                    const basePrice = s.price_tiers?.length ? s.price_tiers[0].price : 0
                    const activeRule = getActiveRule(s)
                    const confirmedBookings = s.bookings_count || 0
                    const ruleDetail = (() => {
                      const parts = []
                      if (activeRule?.valid_until) {
                        const exp = new Date(activeRule.valid_until)
                        parts.push('expires ' + exp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))
                      }
                      if (activeRule?.max_tickets != null) {
                        const remaining = activeRule.max_tickets - confirmedBookings
                        parts.push(`${remaining} of ${activeRule.max_tickets} left`)
                      }
                      return parts.join(' · ')
                    })()
                    return activeRule ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, color: '#a09890', textDecoration: 'line-through' }}>₹{basePrice}</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: '#1a7a3c' }}>₹{activeRule.price}</span>
                        </div>
                        <div style={{ fontSize: 10, background: '#1a7a3c', color: 'white', fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>
                          🏷️ {activeRule.label} active
                        </div>
                        {ruleDetail && (
                          <div style={{ fontSize: 10, color: '#7a6e65' }}>{ruleDetail}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f0c0c' }}>₹{basePrice}</div>
                        <div style={{ fontSize: 11, color: '#7a6e65' }}>regular price</div>
                      </>
                    )
                  })()}
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
                  {['open', 'draft', 'confirmed'].includes(s.status) && (
                    <button onClick={() => setMusicSession(s)}
                      style={{
                        background: s.music_track_url ? '#1a7a3c' : '#faf7f2',
                        color: s.music_track_url ? 'white' : '#0f0c0c',
                        border: s.music_track_url ? 'none' : '1px solid #e2dbd4',
                        borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>
                      {s.music_track_url ? '🎵 Music set ✓' : '🎵 Set up music'}
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
      {musicSession && (
        <MusicSetupModal
          session={musicSession}
          user={user}
          onClose={() => setMusicSession(null)}
          onSaved={(updated) => {
            setSessions(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))
            setMusicSession(null)
          }}
        />
      )}
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
  const [schedulingInIST, setSchedulingInIST] = useState(isIST())
  const [pricingRules, setPricingRules] = useState([])
  const [showPricingRules, setShowPricingRules] = useState(false)

  useEffect(() => {
    if (isEdit && session.id) {
      supabase.from('pricing_rules').select('*').eq('session_id', session.id)
        .order('sort_order').then(({ data }) => {
          if (data && data.length > 0) {
            setPricingRules(data)
            setShowPricingRules(true)
          }
        })
    }
  }, [isEdit, session?.id])
  const [coverUrl, setCoverUrl] = useState(session?.cover_photo_url || null)
  const [coverFocalX, setCoverFocalX] = useState(session?.cover_photo_focal_x ?? 50)
  const [coverFocalY, setCoverFocalY] = useState(session?.cover_photo_focal_y ?? 50)
  const [thumbnailUrl, setThumbnailUrl] = useState(session?.card_thumbnail_url || null)
  const [thumbnailFocalX, setThumbnailFocalX] = useState(session?.card_thumbnail_focal_x ?? 50)
  const [thumbnailFocalY, setThumbnailFocalY] = useState(session?.card_thumbnail_focal_y ?? 50)
  // Stable storage paths for both uploads
  const [coverPath] = useState(() => `hero/${session?.id || Date.now()}_${Date.now()}.jpg`)
  const [thumbnailPath] = useState(() => `card/${session?.id || Date.now()}_${Date.now()}.jpg`)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // ── Session type & series parts ──────────────────────────────
  const [sessionType, setSessionType] = useState(session?.session_type ?? 'single')
  const [seriesParts, setSeriesParts] = useState(() => {
    if (session?.session_type === 'series' && Array.isArray(session.series_parts) && session.series_parts.length >= 2) {
      return session.series_parts.map(p => {
        const d = new Date(p.start)
        const t = parseTimeString(`${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`)
        return { part: p.part, date: toLocalDateString(p.start), hour: t.hour, minute: t.minute, duration: p.duration_minutes || 60 }
      })
    }
    return [
      { part: 1, date: '', hour: 9, minute: '00', duration: 60 },
      { part: 2, date: '', hour: 9, minute: '00', duration: 60 },
    ]
  })

  function addOneDay(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  function buildPartISO(part) {
    const timeStr = `${String(part.hour).padStart(2,'0')}:${part.minute}:00`
    return (schedulingInIST && !isIST())
      ? new Date(`${part.date}T${timeStr}+05:30`).toISOString()
      : new Date(`${part.date}T${timeStr}`).toISOString()
  }

  function updatePart(idx, field, val) {
    setSeriesParts(ps => ps.map((p, i) => i === idx ? { ...p, [field]: val } : p))
  }

  function handleToggleType(type) {
    if (type === 'single' && sessionType === 'series') {
      if (!window.confirm('Switching to Single Class will remove the series schedule. Continue?')) return
    }
    if (type === 'series' && sessionType !== 'series') {
      // Seed Part 1 from current single form; clone Part 2 from Part 1 with date +1 day
      const p2date = form.date ? addOneDay(form.date) : ''
      setSeriesParts([
        { part: 1, date: form.date || '', hour: form.hour, minute: form.minute, duration: form.duration },
        { part: 2, date: p2date, hour: form.hour, minute: form.minute, duration: form.duration },
      ])
    }
    setSessionType(type)
  }

  async function handleSave() {
    if (!form.title) {
      alert('Please fill in a title')
      return
    }
    setSaving(true)
    let scheduledAt, durationMinutes, seriesPartsPayload = null

    if (sessionType === 'single') {
      if (!form.date || form.hour === '' || !form.minute) {
        alert('Please fill in date and time')
        setSaving(false)
        return
      }
      const timeStr = `${String(form.hour).padStart(2,'0')}:${form.minute}:00`
      scheduledAt = (schedulingInIST && !isIST())
        ? new Date(`${form.date}T${timeStr}+05:30`).toISOString()
        : new Date(`${form.date}T${timeStr}`).toISOString()
      durationMinutes = form.duration
    } else {
      if (seriesParts.some(p => !p.date)) {
        alert('Please set a date for all parts before saving.')
        setSaving(false)
        return
      }
      for (let i = 1; i < seriesParts.length; i++) {
        if (new Date(buildPartISO(seriesParts[i])) <= new Date(buildPartISO(seriesParts[i - 1]))) {
          alert('Part dates must be in order (earliest first).')
          setSaving(false)
          return
        }
      }
      scheduledAt = buildPartISO(seriesParts[0])
      durationMinutes = seriesParts[0].duration
      seriesPartsPayload = seriesParts.map(p => ({
        part: p.part,
        start: buildPartISO(p),
        duration_minutes: p.duration,
      }))
    }

    const payload = {
      title:            form.title,
      description:      form.description,
      style_tags:       [form.style],
      skill_level:      form.level,
      scheduled_at:     scheduledAt,
      duration_minutes: durationMinutes,
      price_tiers:      [{ seats: form.max_seats, price: form.price }],
      min_seats:        form.min_seats,
      max_seats:        form.max_seats,
      cover_photo_url:          coverUrl || null,
      cover_photo_focal_x:      coverUrl ? coverFocalX : null,
      cover_photo_focal_y:      coverUrl ? coverFocalY : null,
      card_thumbnail_url:       thumbnailUrl || null,
      card_thumbnail_focal_x:   thumbnailUrl ? thumbnailFocalX : null,
      card_thumbnail_focal_y:   thumbnailUrl ? thumbnailFocalY : null,
      age_groups:               form.age_groups.length > 0 ? form.age_groups : ['All Ages'],
      choreo_reference_url:     form.choreo_reference_url.trim() || null,
      session_type:             sessionType,
      series_parts:             seriesPartsPayload,
    }
    let error, savedSessionId
    if (isEdit) {
      ;({ error } = await supabase.from('sessions').update(payload).eq('id', session.id))
      savedSessionId = session.id
    } else {
      const { data: newSession, error: insertError } = await supabase.from('sessions')
        .insert({ ...payload, choreographer_id: user.id, status: 'open' })
        .select('id').single()
      error = insertError
      savedSessionId = newSession?.id
    }
    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    // Save pricing rules
    if (savedSessionId && showPricingRules) {
      await supabase.from('pricing_rules').delete().eq('session_id', savedSessionId)
      const validRules = pricingRules.filter(r => r.label && r.price > 0)
      if (validRules.length > 0) {
        await supabase.from('pricing_rules').insert(
          validRules.map((r, i) => ({
            session_id: savedSessionId,
            label: r.label,
            price: r.price,
            valid_until: r.valid_until || null,
            max_tickets: r.max_tickets || null,
            sort_order: i,
          }))
        )
      }
    } else if (savedSessionId && !showPricingRules) {
      // Remove any existing rules if user removed them
      await supabase.from('pricing_rules').delete().eq('session_id', savedSessionId)
    }

    onSaved()
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

          {/* Timezone warning — only for non-IST choreographers */}
          {!isIST() && (
            <div style={{ background: '#fff8e6', border: '1px solid #f0c040', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 13, color: '#7a4f00', marginBottom: 8 }}>
                ⚠️ Your browser timezone is <strong>{getTimezoneCode()}</strong>. Times below are in your local time.
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#5a3a00', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={schedulingInIST}
                  onChange={e => setSchedulingInIST(e.target.checked)}
                />
                I am scheduling in IST (India time)
              </label>
            </div>
          )}

          {/* SESSION COVER PHOTO (Portrait 4:5) */}
          <div style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 12, padding: 16 }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f0c0c', marginBottom: 2 }}>
                Session Cover Photo <span style={{ color: '#a09890', fontWeight: 400 }}>(Portrait)</span>
              </div>
              <div style={{ fontSize: 12, color: '#7a6e65' }}>
                Shown full-screen on the session detail page.<br />
                Best: a full-body dance pose or close-up performance shot.
              </div>
            </div>
            <ImageCropUploader
              bucket="session-covers"
              path={coverPath}
              aspectRatio={4 / 5}
              currentUrl={coverUrl}
              allowCropAdjust={true}
              onUploadComplete={async (url, fx, fy) => {
                setCoverUrl(url); setCoverFocalX(fx ?? 50); setCoverFocalY(fy ?? 50)
                if (session?.id) {
                  await supabase.from('sessions')
                    .update({ cover_photo_url: url, cover_photo_focal_x: fx ?? 50, cover_photo_focal_y: fy ?? 50 })
                    .eq('id', session.id).eq('choreographer_id', user.id)
                }
              }}
              label=""
            />
            {coverUrl && (
              <button onClick={() => setCoverUrl(null)}
                style={{ marginTop: 8, background: 'transparent', border: 'none', color: '#cc0000', fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                ✕ Remove
              </button>
            )}
          </div>

          {/* CARD THUMBNAIL (Landscape 16:9) */}
          <div style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 12, padding: 16 }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f0c0c', marginBottom: 2 }}>
                Card Thumbnail <span style={{ color: '#a09890', fontWeight: 400 }}>(Landscape)</span>
              </div>
              <div style={{ fontSize: 12, color: '#7a6e65' }}>
                Shown on the home page browsing card.<br />
                Best: a wide stage shot, group photo, or promotional banner.
              </div>
            </div>
            <ImageCropUploader
              bucket="session-covers"
              path={thumbnailPath}
              aspectRatio={16 / 9}
              currentUrl={thumbnailUrl}
              allowCropAdjust={true}
              onUploadComplete={async (url, fx, fy) => {
                setThumbnailUrl(url); setThumbnailFocalX(fx ?? 50); setThumbnailFocalY(fy ?? 50)
                if (session?.id) {
                  await supabase.from('sessions')
                    .update({ card_thumbnail_url: url, card_thumbnail_focal_x: fx ?? 50, card_thumbnail_focal_y: fy ?? 50 })
                    .eq('id', session.id).eq('choreographer_id', user.id)
                }
              }}
              label=""
            />
            {thumbnailUrl && (
              <button onClick={() => setThumbnailUrl(null)}
                style={{ marginTop: 8, background: 'transparent', border: 'none', color: '#cc0000', fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                ✕ Remove
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

          {/* Session type toggle */}
          <div>
            <label style={labelStyle}>Session Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['single', 'series'].map(type => (
                <button key={type} type="button" onClick={() => handleToggleType(type)} style={{
                  padding: '8px 18px', borderRadius: 20, border: '1px solid #e2dbd4', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: sessionType === type ? '#0f0c0c' : '#faf7f2',
                  color: sessionType === type ? 'white' : '#5a4e47',
                }}>
                  {type === 'single' ? 'Single Class' : 'Workshop Series'}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Time — single only */}
          {sessionType === 'single' && (
            <div>
              <label style={labelStyle}>Date & Time *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.8fr', gap: 10 }}>
                <input type="date" style={inputStyle} value={form.date}
                  onChange={e => set('date', e.target.value)}
                  min={new Date().toISOString().split('T')[0]} />
                <select style={inputStyle} value={form.hour} onChange={e => set('hour', Number(e.target.value))}>
                  {HOURS.map(h => (
                    <option key={h} value={h}>{fmtHour(h)}</option>
                  ))}
                </select>
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
              {!isIST() && (() => {
                const istPreview = toISTPreview(form.date, form.hour, schedulingInIST)
                return istPreview ? (
                  <div style={{ fontSize: 12, color: '#c8430a', marginTop: 4 }}>
                    → {istPreview} IST (India)
                  </div>
                ) : null
              })()}
            </div>
          )}

          {/* Series parts — series only */}
          {sessionType === 'series' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={labelStyle}>Workshop Parts</label>
              {seriesParts.map((part, idx) => (
                <div key={part.part} style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#5b4fcf', marginBottom: 8 }}>Part {part.part}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.8fr 0.9fr', gap: 8 }}>
                    <input type="date" style={inputStyle} value={part.date}
                      onChange={e => updatePart(idx, 'date', e.target.value)}
                      min={new Date().toISOString().split('T')[0]} />
                    <select style={inputStyle} value={part.hour} onChange={e => updatePart(idx, 'hour', Number(e.target.value))}>
                      {HOURS.map(h => (
                        <option key={h} value={h}>{fmtHour(h)}</option>
                      ))}
                    </select>
                    <select style={inputStyle} value={part.minute} onChange={e => updatePart(idx, 'minute', e.target.value)}>
                      {MINUTES.map(m => (
                        <option key={m} value={m}>:{m}</option>
                      ))}
                    </select>
                    <select style={inputStyle} value={part.duration} onChange={e => updatePart(idx, 'duration', Number(e.target.value))}>
                      {[30, 45, 60, 75, 90, 120].map(d => <option key={d} value={d}>{d} min</option>)}
                    </select>
                  </div>
                </div>
              ))}
              {seriesParts.length === 2 && (
                <button type="button" onClick={() => setSeriesParts(ps => [...ps, { part: 3, date: addOneDay(ps[1].date), hour: ps[1].hour, minute: ps[1].minute, duration: ps[1].duration }])}
                  style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed #5b4fcf', color: '#5b4fcf', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                  + Add Part 3
                </button>
              )}
              {seriesParts.length === 3 && (
                <button type="button" onClick={() => setSeriesParts(ps => ps.slice(0, 2))}
                  style={{ alignSelf: 'flex-start', background: 'none', border: '1px solid #cc0000', color: '#cc0000', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                  − Remove Part 3
                </button>
              )}
            </div>
          )}

          {/* Duration + Price */}
          <div style={{ display: 'grid', gridTemplateColumns: sessionType === 'single' ? '1fr 1fr' : '1fr', gap: 16 }}>
            {sessionType === 'single' && (
              <div>
                <label style={labelStyle}>Duration (minutes)</label>
                <select style={inputStyle} value={form.duration} onChange={e => set('duration', Number(e.target.value))}>
                  {[30, 45, 60, 75, 90, 120].map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
            )}
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

          {/* Pricing Rules (Early Bird) */}
          <div style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPricingRules ? 16 : 0 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f0c0c' }}>🎟️ Early Bird / Pricing Rules</div>
                <div style={{ fontSize: 12, color: '#7a6e65' }}>Optional — override base price for a limited time or seats</div>
              </div>
              <button type="button"
                onClick={() => setShowPricingRules(p => !p)}
                style={{ background: showPricingRules ? '#fff0f0' : '#0f0c0c', color: showPricingRules ? '#cc0000' : 'white', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {showPricingRules ? '− Remove' : '+ Add rule'}
              </button>
            </div>
            {showPricingRules && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pricingRules.map((rule, i) => (
                  <div key={i} style={{ background: 'white', border: '1px solid #e2dbd4', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input
                        style={{ ...inputStyle, flex: 2 }}
                        placeholder="Label (e.g. Early Bird)"
                        value={rule.label}
                        onChange={e => setPricingRules(rules => rules.map((r, j) => j === i ? { ...r, label: e.target.value } : r))}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: 4 }}>
                        <span style={{ fontSize: 14, color: '#7a6e65' }}>₹</span>
                        <input
                          type="number"
                          style={{ ...inputStyle }}
                          placeholder="Price"
                          value={rule.price}
                          onChange={e => setPricingRules(rules => rules.map((r, j) => j === i ? { ...r, price: Number(e.target.value) } : r))}
                          min="0"
                        />
                      </div>
                      <button type="button"
                        onClick={() => setPricingRules(rules => rules.filter((_, j) => j !== i))}
                        style={{ background: 'transparent', border: 'none', color: '#cc0000', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}>×</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#7a6e65', marginBottom: 4 }}>Valid until (optional)</div>
                        <input
                          type="datetime-local"
                          style={{ ...inputStyle, fontSize: 12 }}
                          value={rule.valid_until ? rule.valid_until.slice(0, 16) : ''}
                          onChange={e => setPricingRules(rules => rules.map((r, j) => j === i ? { ...r, valid_until: e.target.value ? new Date(e.target.value).toISOString() : null } : r))}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#7a6e65', marginBottom: 4 }}>Max tickets (optional)</div>
                        <input
                          type="number"
                          style={{ ...inputStyle, fontSize: 12 }}
                          placeholder="e.g. 50"
                          value={rule.max_tickets || ''}
                          onChange={e => setPricingRules(rules => rules.map((r, j) => j === i ? { ...r, max_tickets: e.target.value ? Number(e.target.value) : null } : r))}
                          min="1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button"
                  onClick={() => setPricingRules(rules => [...rules, { label: 'Early Bird', price: Math.round(form.price * 0.8), valid_until: null, max_tickets: null }])}
                  style={{ background: 'white', border: '1px dashed #c8430a', borderRadius: 8, padding: '8px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#c8430a' }}>
                  + Add pricing rule
                </button>
              </div>
            )}
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

function MusicSetupModal({ session, user, onClose, onSaved }) {
  const hasExisting = !!session.music_track_url

  const [ytUrl, setYtUrl]         = useState('')
  const [fetching, setFetching]   = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [track, setTrack]         = useState(
    hasExisting
      ? { url: session.music_track_url, type: session.music_track_type, title: session.music_track_title, thumb: session.music_track_thumb }
      : null
  )
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)

  const inputStyle = {
    flex: 1, background: '#faf7f2', border: '1px solid #e2dbd4',
    borderRadius: 8, padding: '10px 14px', fontSize: 14,
    outline: 'none', color: '#0f0c0c', boxSizing: 'border-box',
  }

  async function fetchYouTubeInfo() {
    if (!ytUrl.trim()) return
    setFetching(true)
    setFetchError(null)
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(ytUrl.trim())}&format=json`
      )
      if (!res.ok) throw new Error('Could not fetch track info — check the URL and try again')
      const data = await res.json()
      setTrack({ url: ytUrl.trim(), type: 'youtube', title: data.title, thumb: data.thumbnail_url })
    } catch (err) {
      setFetchError(err.message || 'Failed to fetch YouTube info')
    } finally {
      setFetching(false)
    }
  }

  async function handleMp3Select(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setFetchError(null)
    try {
      const path = `${user.id}/${session.id}/track.mp3`
      const { error: uploadError } = await supabase.storage
        .from('music-tracks')
        .upload(path, file, { upsert: true, contentType: 'audio/mpeg' })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('music-tracks').getPublicUrl(path)
      const title = file.name.replace(/\.mp3$/i, '')
      setTrack({ url: urlData.publicUrl, type: 'mp3', title, thumb: null })
    } catch (err) {
      setFetchError('Upload failed: ' + (err.message || 'Unknown error'))
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!track) return
    setSaving(true)
    const { error } = await supabase.from('sessions').update({
      music_track_url:   track.url,
      music_track_type:  track.type,
      music_track_title: track.title,
      music_track_thumb: track.thumb || null,
    }).eq('id', session.id)
    if (error) {
      setFetchError('Save failed: ' + error.message)
      setSaving(false)
      return
    }
    onSaved({
      id:                session.id,
      music_track_url:   track.url,
      music_track_type:  track.type,
      music_track_title: track.title,
      music_track_thumb: track.thumb || null,
    })
  }

  async function handleRemove() {
    setSaving(true)
    const { error } = await supabase.from('sessions').update({
      music_track_url:   null,
      music_track_type:  null,
      music_track_title: null,
      music_track_thumb: null,
    }).eq('id', session.id)
    if (error) {
      setFetchError('Remove failed: ' + error.message)
      setSaving(false)
      return
    }
    onSaved({
      id:                session.id,
      music_track_url:   null,
      music_track_type:  null,
      music_track_title: null,
      music_track_thumb: null,
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 20, padding: 32, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif' }}>🎵 Music for this session</div>
            <div style={{ fontSize: 13, color: '#7a6e65', marginTop: 4 }}>{session.title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#7a6e65', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Error box */}
        {fetchError && (
          <div style={{ background: '#fff3cd', border: '1px solid #f0a500', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#7a4f00' }}>
            {fetchError}
          </div>
        )}

        {/* Track preview */}
        {track && (
          <div style={{ background: '#f0faf4', border: '1px solid #a8e0b8', borderRadius: 10, padding: '12px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            {track.thumb && (
              <img src={track.thumb} alt="" style={{ width: 60, height: 45, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f0c0c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
              <div style={{ fontSize: 11, color: '#1a7a3c', fontWeight: 600, marginTop: 2, textTransform: 'uppercase' }}>{track.type}</div>
            </div>
            <button
              onClick={() => { setTrack(null); setYtUrl('') }}
              style={{ background: 'none', border: 'none', color: '#7a6e65', fontSize: 18, cursor: 'pointer', flexShrink: 0, lineHeight: 1, padding: 0 }}
              title="Clear track"
            >✕</button>
          </div>
        )}

        {/* YouTube section — disabled, MP3 is the supported path */}
        <div style={{ marginBottom: 4, opacity: 0.5 }}>
          <div style={{ fontSize: 12, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontWeight: 600 }}>Add a YouTube link</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...inputStyle, cursor: 'not-allowed' }}
              placeholder="https://youtube.com/watch?v=..."
              value=""
              disabled
            />
            <button disabled style={{ background: '#0f0c0c', color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'not-allowed', whiteSpace: 'nowrap', opacity: 0.5 }}>
              Fetch Info
            </button>
          </div>
        </div>
        <div style={{ marginBottom: 8, fontSize: 12, color: '#7a6e65', lineHeight: 1.5 }}>
          💡 YouTube coming soon. For best audio quality, record or download your track as MP3 and upload below.{' '}
          <a href="https://cobalt.tools" target="_blank" rel="noreferrer" style={{ color: '#c8430a', textDecoration: 'none', fontWeight: 600 }}>
            Download MP3 from YouTube →
          </a>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: '#e2dbd4' }} />
          <span style={{ fontSize: 12, color: '#a09890', flexShrink: 0 }}>or</span>
          <div style={{ flex: 1, height: 1, background: '#e2dbd4' }} />
        </div>

        {/* MP3 upload */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>Upload MP3</div>
          <input
            id="mp3-upload-input"
            type="file"
            accept=".mp3,audio/mpeg"
            onChange={handleMp3Select}
            style={{ display: 'none' }}
          />
          <label htmlFor="mp3-upload-input" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8,
            padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', color: '#0f0c0c',
            opacity: uploading ? 0.6 : 1,
          }}>
            {uploading ? '⏳ Uploading...' : '📁 Choose file'}
          </label>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={!track || saving}
            style={{ flex: 1, background: !track || saving ? '#a09890' : '#c8430a', color: 'white', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, cursor: !track || saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving...' : '💾 Save for this session'}
          </button>
          <button
            onClick={onClose}
            style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 10, padding: '13px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#5a4e47' }}>
            Cancel
          </button>
        </div>

        {/* Remove existing track */}
        {hasExisting && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              onClick={handleRemove}
              disabled={saving}
              style={{ background: 'none', border: 'none', color: '#cc0000', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
              Remove saved music track
            </button>
          </div>
        )}

      </div>
    </div>
  )
}