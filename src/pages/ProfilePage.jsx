import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ProfilePage({ user, profile, onBack, onApplyToTeach }) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    instagram_handle: profile?.instagram_handle || '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchBookings() }, [])

  async function fetchBookings() {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, sessions(title, scheduled_at, style_tags, skill_level, duration_minutes)')
      .eq('booked_by', user.id)
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    else setBookings(data || [])
    setLoading(false)
  }

  async function saveProfile() {
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: form.full_name, instagram_handle: form.instagram_handle })
      .eq('id', user.id)
    if (error) alert(error.message)
    else setEditMode(false)
    setSaving(false)
  }

  const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })

  const isPending = profile?.role === 'choreographer' && !profile?.choreographer_approved
  const isLearner = !profile?.role || profile?.role === 'learner'

  const styleColors = {
    bollywood: '#c8430a', bharatanatyam: '#5b4fcf',
    contemporary: '#1a7a3c', hiphop: '#b5420e',
    kathak: '#8b4513', folk: '#c47800',
  }

  const upcoming = bookings.filter(b => new Date(b.sessions?.scheduled_at) > new Date())
  const past = bookings.filter(b => new Date(b.sessions?.scheduled_at) <= new Date())

  const inputStyle = {
    width: '100%', background: '#faf7f2',
    border: '1px solid #e2dbd4', borderRadius: 8,
    padding: '10px 14px', fontSize: 14,
    outline: 'none', boxSizing: 'border-box', color: '#0f0c0c'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2' }}>

      {/* NAV */}
      <nav style={{ background: '#0f0c0c', padding: '0 40px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 900, color: '#faf7f2' }}>
          Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
        </div>
        <button onClick={onBack} style={{ background: 'transparent', border: '1px solid rgba(250,247,242,0.3)', color: '#faf7f2', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
          ← Back
        </button>
      </nav>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>

        {/* PROFILE CARD */}
        <div style={{ background: 'white', borderRadius: 16, padding: 28, border: '1px solid #e2dbd4', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#c8430a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 26, fontWeight: 700 }}>
                {(profile?.full_name || user.email)[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 20, color: '#0f0c0c' }}>
                  {profile?.full_name || 'Your Name'}
                </div>
                <div style={{ fontSize: 13, color: '#7a6e65' }}>{user.email}</div>
                {profile?.instagram_handle && (
                  <div style={{ fontSize: 13, color: '#c8430a' }}>@{profile.instagram_handle}</div>
                )}
              </div>
            </div>
            <button onClick={() => setEditMode(!editMode)} style={{
              background: editMode ? '#f0ebe6' : 'transparent',
              border: '1px solid #e2dbd4', color: '#5a4e47',
              padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13
            }}>
              {editMode ? 'Cancel' : '✏️ Edit'}
            </button>
          </div>

          {editMode && (
            <div style={{ borderTop: '1px solid #f0ebe6', paddingTop: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>Full Name</label>
                  <input style={inputStyle} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Your full name" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>Instagram Handle</label>
                  <input style={inputStyle} value={form.instagram_handle} onChange={e => setForm(f => ({ ...f, instagram_handle: e.target.value }))} placeholder="yourhandle" />
                </div>
              </div>
              <button onClick={saveProfile} disabled={saving} style={{
                background: '#c8430a', color: 'white', border: 'none',
                borderRadius: 8, padding: '10px 24px', fontSize: 14,
                fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1
              }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* PENDING BANNER */}
        {isPending && (
          <div style={{ background: '#fff8e6', border: '1px solid #e8a020', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f0c0c', marginBottom: 4 }}>
              🕐 Application under review
            </div>
            <p style={{ fontSize: 13, color: '#7a6e65', lineHeight: 1.6 }}>
              We're reviewing your choreographer application. You'll receive an email once approved — usually within 1–2 days.
            </p>
          </div>
        )}

        {/* BOOKINGS */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2dbd4', overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2dbd4' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c' }}>My Bookings</h2>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#7a6e65' }}>Loading...</div>
          ) : bookings.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎭</div>
              <p style={{ color: '#7a6e65', fontSize: 14 }}>No bookings yet — go explore sessions!</p>
              <button onClick={onBack} style={{ marginTop: 16, background: '#c8430a', color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Browse Sessions
              </button>
            </div>
          ) : (
            <div>
              {upcoming.length > 0 && (
                <div>
                  <div style={{ padding: '12px 24px', background: '#faf7f2', fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Upcoming ({upcoming.length})
                  </div>
                  {upcoming.map((b, i) => (
                    <BookingRow key={b.id} booking={b} isLast={i === upcoming.length - 1} styleColors={styleColors} formatDate={formatDate} />
                  ))}
                </div>
              )}
              {past.length > 0 && (
                <div>
                  <div style={{ padding: '12px 24px', background: '#faf7f2', fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Past ({past.length})
                  </div>
                  {past.map((b, i) => (
                    <BookingRow key={b.id} booking={b} isLast={i === past.length - 1} styleColors={styleColors} formatDate={formatDate} isPast />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* WANT TO TEACH */}
        {isLearner && (
          <div style={{ background: '#0f0c0c', borderRadius: 16, padding: '32px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎭</div>
            <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#faf7f2', marginBottom: 8 }}>
              Want to teach on NrithyaHolics?
            </h3>
            <p style={{ color: 'rgba(250,247,242,0.55)', fontSize: 14, lineHeight: 1.6, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
              Share your choreography with dancers across India. Apply in 2 minutes — we review every application personally.
            </p>
            <button onClick={onApplyToTeach} style={{
              background: '#c8430a', color: 'white', border: 'none',
              borderRadius: 10, padding: '14px 32px', fontSize: 15,
              fontWeight: 600, cursor: 'pointer'
            }}>
              Apply to Teach →
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

function BookingRow({ booking, isLast, styleColors, formatDate, isPast }) {
  const session = booking.sessions
  const color = styleColors[session?.style_tags?.[0]] || '#c8430a'

  return (
    <div style={{ padding: '16px 24px', borderBottom: isLast ? 'none' : '1px solid #f0ebe6', display: 'flex', alignItems: 'center', gap: 16, opacity: isPast ? 0.6 : 1 }}>
      <div style={{ width: 8, height: 48, borderRadius: 4, background: color, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: '#0f0c0c', marginBottom: 2 }}>
          {session?.title || 'Session'}
        </div>
        <div style={{ fontSize: 12, color: '#7a6e65' }}>
          📅 {formatDate(session?.scheduled_at)} · {session?.duration_minutes} mins
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f0c0c' }}>₹{booking.credits_paid}</div>
        <div style={{ fontSize: 11, color: isPast ? '#7a6e65' : '#1a7a3c', fontWeight: 600 }}>
          {isPast ? 'Completed' : '✓ Confirmed'}
        </div>
      </div>
    </div>
  )
}