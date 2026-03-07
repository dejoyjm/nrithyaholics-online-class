import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STYLES = ['Bollywood', 'Bharatanatyam', 'Contemporary', 'Hip Hop', 'Kathak', 'Folk', 'Jazz', 'Fusion']
const LANGUAGES = ['Hindi', 'English', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi']

// Strip full Instagram URLs down to just the handle
function cleanInstagram(val) {
  if (!val) return ''
  // Remove URL patterns like https://www.instagram.com/handle/?hl=en
  const match = val.match(/instagram\.com\/([^/?#]+)/i)
  if (match) return match[1].replace('@', '')
  return val.replace('@', '').trim()
}

const styleColors = {
  bollywood: '#c8430a', bharatanatyam: '#5b4fcf',
  contemporary: '#1a7a3c', hiphop: '#b5420e',
  kathak: '#8b4513', folk: '#c47800',
  jazz: '#1a5db5', fusion: '#7a1a7a',
}

export default function ProfilePage({ user, profile, onBack, onApplyToTeach, onSwitchToTeaching }) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    instagram_handle: cleanInstagram(profile?.instagram_handle || ''),
    bio: profile?.bio || '',
    style_tags: profile?.style_tags || [],
    teaching_language: profile?.teaching_language || 'Hindi',
  })

  const isChoreo = profile?.role === 'choreographer'
  const isApprovedChoreo = isChoreo && profile?.choreographer_approved
  const isPending = isChoreo && !profile?.choreographer_approved
  const isLearner = !isChoreo

  useEffect(() => { fetchBookings() }, [])

  async function fetchBookings() {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, sessions(title, scheduled_at, style_tags, skill_level, duration_minutes, price_tiers)')
      .eq('booked_by', user.id)
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    else setBookings(data || [])
    setLoading(false)
  }

  async function saveProfile() {
    setSaving(true)
    const updates = {
      full_name: form.full_name,
      instagram_handle: cleanInstagram(form.instagram_handle),
    }
    if (isChoreo) {
      updates.bio = form.bio
      updates.style_tags = form.style_tags
      updates.teaching_language = form.teaching_language
    }
    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)
    if (error) alert(error.message)
    else setEditMode(false)
    setSaving(false)
  }

  const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })

  const upcoming = bookings.filter(b => new Date(b.sessions?.scheduled_at) > new Date())
  const past = bookings.filter(b => new Date(b.sessions?.scheduled_at) <= new Date())

  const inputStyle = {
    width: '100%', background: '#faf7f2',
    border: '1px solid #e2dbd4', borderRadius: 8,
    padding: '10px 14px', fontSize: 14,
    outline: 'none', boxSizing: 'border-box', color: '#0f0c0c',
  }
  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 700,
    color: '#7a6e65', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 6,
  }

  const initials = (form.full_name || user.email || '?')[0].toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2' }}>

      {/* NAV */}
      <nav style={{
        background: '#0f0c0c', padding: '0 40px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 900, color: '#faf7f2' }}>
          Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {isApprovedChoreo && onSwitchToTeaching && (
            <button onClick={onSwitchToTeaching} style={{
              background: '#c8430a', color: 'white', border: 'none',
              borderRadius: 8, padding: '8px 16px', fontSize: 13,
              fontWeight: 600, cursor: 'pointer',
            }}>🎭 Switch to Teaching</button>
          )}
          <button onClick={onBack} style={{
            background: 'transparent', border: '1px solid rgba(250,247,242,0.3)',
            color: '#faf7f2', padding: '8px 20px', borderRadius: 8,
            cursor: 'pointer', fontSize: 14,
          }}>← Back</button>
        </div>
      </nav>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>

        {/* PROFILE CARD */}
        <div style={{
          background: 'white', borderRadius: 20, padding: 28,
          border: '1px solid #e2dbd4', marginBottom: 24,
        }}>
          {!editMode ? (
            /* ── VIEW MODE ── */
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 20 }}>
                {/* Avatar */}
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
                  background: '#c8430a', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: 'white', fontSize: 28, fontWeight: 700,
                }}>
                  {initials}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f0c0c', marginBottom: 4 }}>
                        {form.full_name || 'No name set'}
                      </h2>
                      <div style={{ fontSize: 13, color: '#7a6e65', marginBottom: 4 }}>{user.email}</div>
                      {form.instagram_handle && (
                        <a
                          href={`https://instagram.com/${form.instagram_handle}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 13, color: '#c8430a', textDecoration: 'none', fontWeight: 600 }}
                        >
                          📸 @{form.instagram_handle}
                        </a>
                      )}
                    </div>
                    <button onClick={() => setEditMode(true)} style={{
                      background: '#faf7f2', border: '1px solid #e2dbd4',
                      borderRadius: 8, padding: '7px 16px', fontSize: 13,
                      fontWeight: 600, cursor: 'pointer', color: '#5a4e47',
                    }}>✏️ Edit</button>
                  </div>
                </div>
              </div>

              {/* Role badge */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: isChoreo ? 20 : 0 }}>
                {isApprovedChoreo && (
                  <span style={{ background: '#e6f4ec', color: '#1a7a3c', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
                    ✓ Approved Choreographer
                  </span>
                )}
                {isPending && (
                  <span style={{ background: '#fff8e6', color: '#e8a020', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
                    ⏳ Application Pending
                  </span>
                )}
                {isLearner && (
                  <span style={{ background: '#f0ebe6', color: '#5a4e47', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
                    Learner
                  </span>
                )}
              </div>

              {/* Choreo-specific info */}
              {isChoreo && (
                <div style={{ borderTop: '1px solid #f0ebe6', paddingTop: 20 }}>
                  {form.bio && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={labelStyle}>Bio</div>
                      <p style={{ fontSize: 14, color: '#3a3330', lineHeight: 1.7, margin: 0 }}>{form.bio}</p>
                    </div>
                  )}
                  {form.style_tags?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={labelStyle}>Styles I Teach</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {form.style_tags.map(tag => {
                          const color = styleColors[tag.toLowerCase().replace(/\s/g, '')] || '#c8430a'
                          return (
                            <span key={tag} style={{
                              background: color, color: 'white',
                              fontSize: 12, fontWeight: 700,
                              padding: '4px 12px', borderRadius: 20,
                            }}>{tag}</span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {form.teaching_language && (
                    <div>
                      <div style={labelStyle}>Teaching Language</div>
                      <span style={{
                        background: '#e8f4fd', color: '#1a5db5',
                        fontSize: 12, fontWeight: 700,
                        padding: '4px 12px', borderRadius: 20,
                      }}>🗣 {form.teaching_language}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ── EDIT MODE ── */
            <div>
              <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 700, color: '#0f0c0c', marginBottom: 20 }}>
                Edit Profile
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Full Name</label>
                  <input
                    style={inputStyle}
                    value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="Your full name"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Instagram Handle</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: 11, color: '#7a6e65', fontSize: 14 }}>@</span>
                    <input
                      style={{ ...inputStyle, paddingLeft: 28 }}
                      value={form.instagram_handle}
                      onChange={e => setForm(f => ({ ...f, instagram_handle: cleanInstagram(e.target.value) }))}
                      placeholder="yourhandle"
                    />
                  </div>
                  <div style={{ fontSize: 11, color: '#7a6e65', marginTop: 4 }}>
                    Just the handle — no @ or full URL needed
                  </div>
                </div>

                {/* Choreo-only fields */}
                {isChoreo && (
                  <>
                    <div>
                      <label style={labelStyle}>Bio</label>
                      <textarea
                        style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
                        value={form.bio}
                        onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                        placeholder="Tell learners about yourself and your teaching style..."
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Styles I Teach</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {STYLES.map(s => {
                          const tag = s.toLowerCase().replace(/\s/g, '')
                          const active = form.style_tags.includes(s) || form.style_tags.includes(tag)
                          return (
                            <button key={s} onClick={() => {
                              setForm(f => ({
                                ...f,
                                style_tags: active
                                  ? f.style_tags.filter(t => t !== s && t !== tag)
                                  : [...f.style_tags, s],
                              }))
                            }} style={{
                              padding: '6px 14px', borderRadius: 20, fontSize: 13,
                              fontWeight: 600, cursor: 'pointer', border: '1px solid #e2dbd4',
                              background: active ? '#c8430a' : 'white',
                              color: active ? 'white' : '#5a4e47',
                            }}>{s}</button>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <label style={labelStyle}>Teaching Language</label>
                      <select
                        value={form.teaching_language}
                        onChange={e => setForm(f => ({ ...f, teaching_language: e.target.value }))}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                      >
                        {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  style={{
                    background: '#c8430a', color: 'white', border: 'none',
                    borderRadius: 8, padding: '10px 24px', fontSize: 14,
                    fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  style={{
                    background: 'white', border: '1px solid #e2dbd4',
                    borderRadius: 8, padding: '10px 20px', fontSize: 14,
                    cursor: 'pointer', color: '#5a4e47',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* APPLY TO TEACH — for learners */}
        {isLearner && onApplyToTeach && (
          <div style={{
            background: 'white', borderRadius: 16, padding: 24,
            border: '1px solid #e2dbd4', marginBottom: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#0f0c0c', marginBottom: 4 }}>
                Want to teach on NrithyaHolics?
              </div>
              <div style={{ fontSize: 13, color: '#7a6e65' }}>
                Apply to become a choreographer and start hosting live sessions.
              </div>
            </div>
            <button onClick={onApplyToTeach} style={{
              background: '#c8430a', color: 'white', border: 'none',
              borderRadius: 10, padding: '10px 20px', fontSize: 14,
              fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              Apply to Teach →
            </button>
          </div>
        )}

        {/* BOOKINGS */}
        <div style={{
          background: 'white', borderRadius: 20, padding: 28,
          border: '1px solid #e2dbd4',
        }}>
          <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 700, color: '#0f0c0c', marginBottom: 20 }}>
            My Bookings
          </h3>

          {loading ? (
            <div style={{ textAlign: 'center', color: '#7a6e65', padding: 32 }}>Loading...</div>
          ) : bookings.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#7a6e65', padding: '32px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>💃</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0f0c0c', marginBottom: 6 }}>No bookings yet</div>
              <div style={{ fontSize: 13 }}>Browse sessions and book your first class!</div>
              <button onClick={onBack} style={{
                marginTop: 16, background: '#c8430a', color: 'white',
                border: 'none', borderRadius: 8, padding: '10px 24px',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Browse Sessions</button>
            </div>
          ) : (
            <div>
              {upcoming.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                    UPCOMING ({upcoming.length})
                  </div>
                  {upcoming.map(b => <BookingRow key={b.id} booking={b} formatDate={formatDate} isUpcoming />)}
                </div>
              )}
              {past.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                    PAST ({past.length})
                  </div>
                  {past.map(b => <BookingRow key={b.id} booking={b} formatDate={formatDate} />)}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function BookingRow({ booking, formatDate, isUpcoming }) {
  const session = booking.sessions
  if (!session) return null
  const color = (() => {
    const key = session.style_tags?.[0]?.toLowerCase().replace(/\s/g, '') || ''
    return { bollywood: '#c8430a', bharatanatyam: '#5b4fcf', contemporary: '#1a7a3c', hiphop: '#b5420e', kathak: '#8b4513', folk: '#c47800' }[key] || '#c8430a'
  })()
  const price = booking.credits_paid
    || (session.price_tiers?.length ? Math.min(...session.price_tiers.map(t => t.price)) : 0)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 0', borderBottom: '1px solid #f0ebe6',
    }}>
      <div style={{ width: 4, height: 44, borderRadius: 2, background: color, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f0c0c', marginBottom: 2 }}>
          {session.title}
        </div>
        <div style={{ fontSize: 12, color: '#7a6e65' }}>
          📅 {formatDate(session.scheduled_at)} · {session.duration_minutes} mins
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {price > 0 && <div style={{ fontSize: 14, fontWeight: 700, color: '#0f0c0c', marginBottom: 4 }}>₹{price}</div>}
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          background: isUpcoming ? '#e6f4ec' : '#f0ebe6',
          color: isUpcoming ? '#1a7a3c' : '#7a6e65',
        }}>
          {isUpcoming ? 'Upcoming' : 'Completed'}
        </span>
      </div>
    </div>
  )
}
