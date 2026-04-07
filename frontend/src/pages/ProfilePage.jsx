import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ImageCropUploader from '../components/ImageCropUploader'
import { canJoinNow as computeCanJoin } from '../utils/sessionTime'
import useRecordings from './profile/useRecordings'
import RecordingPlayerModal from './profile/RecordingPlayerModal'

const STYLES = ['Bollywood', 'Bharatanatyam', 'Contemporary', 'Hip Hop', 'Kathak', 'Folk', 'Jazz', 'Fusion']
const LANGUAGES = ['Hindi', 'English', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Punjabi', 'Bengali', 'Gujarati']

const styleColors = {
  bollywood: '#c8430a', bharatanatyam: '#5b4fcf',
  contemporary: '#1a7a3c', hiphop: '#b5420e',
  kathak: '#8b4513', folk: '#c47800',
  jazz: '#1a5db5', fusion: '#7a1a7a',
}

function cleanInstagram(val) {
  if (!val) return ''
  const match = val.match(/instagram\.com\/([^/?#]+)/i)
  if (match) return match[1].replace('@', '')
  return val.replace('@', '').trim()
}

export default function ProfilePage({ user, profile, platformConfig, onBack, onApplyToTeach, onSwitchToTeaching, onSessionClick, onJoinClass, onPractice }) {
  const [bookings, setBookings] = useState([])
  const [loadingBookings, setLoadingBookings] = useState(true)
  const [guestBookingsMap, setGuestBookingsMap] = useState({})
  const [activeTab, setActiveTab] = useState('profile')
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null)

  const isChoreo = profile?.role === 'choreographer'
  const isApprovedChoreo = isChoreo && profile?.choreographer_approved
  const isPending = isChoreo && !profile?.choreographer_approved

  const [activeRecording, setActiveRecording] = useState(null)
  const [authToken, setAuthToken] = useState(null)

  const parseLanguages = (val) => {
    if (!val) return []
    if (Array.isArray(val)) return val
    try { return JSON.parse(val) } catch { return [val] }
  }

  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    instagram_handle: cleanInstagram(profile?.instagram_handle || ''),
    bio: profile?.bio || '',
    style_tags: profile?.style_tags || [],
    teaching_languages: parseLanguages(profile?.teaching_language),
    sample_video_url: profile?.sample_video_url || '',
  })

  useEffect(() => { fetchBookings() }, [])

  async function fetchBookings() {
    // Fetch owned bookings + call edge function in parallel
    const [{ data: ownedData }, authSession] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, sessions(title, scheduled_at, style_tags, skill_level, duration_minutes, price_tiers, session_type, series_parts)')
        .eq('booked_by', user.id)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false }),
      supabase.auth.getSession().then(r => r.data.session),
    ])

    const ownedBookings = ownedData || []
    const ownedIds = ownedBookings.map(b => b.id)

    // Edge function returns:
    // - guest_bookings: sub-bookings this buyer created (for guest seats display)
    // - invited_bookings: sessions this user was invited to as a guest
    try {
      const token = authSession?.access_token
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-guest-bookings`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ booking_ids: ownedIds }),
        }
      )
      const { guest_bookings: guestSubs = [], invited_bookings: invitedBookings = [] } = await res.json()

      // Merge owned + invited, deduplicate by id (claimed rows appear in both)
      const seen = new Set()
      const allBookings = [...ownedBookings, ...invitedBookings].filter(b => {
        if (seen.has(b.id)) return false
        seen.add(b.id)
        return true
      })
      setBookings(allBookings)

      // Build map of guest sub-bookings for buyer's BookingRow display
      const map = {}
      guestSubs.forEach(g => {
        if (!map[g.primary_booking_id]) map[g.primary_booking_id] = []
        map[g.primary_booking_id].push(g)
      })
      setGuestBookingsMap(map)
    } catch (e) {
      console.error('[ProfilePage] edge function error:', e)
      setBookings(ownedBookings)
    }
    setAuthToken(authSession?.access_token)
    setLoadingBookings(false)
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
      updates.teaching_language = form.teaching_languages.length === 1
        ? form.teaching_languages[0]
        : JSON.stringify(form.teaching_languages)
      updates.sample_video_url = form.sample_video_url
    }
    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)
    if (error) alert(error.message)
    else setEditMode(false)
    setSaving(false)
  }

  function toggleStyle(s) {
    setForm(f => ({
      ...f,
      style_tags: f.style_tags.includes(s) ? f.style_tags.filter(t => t !== s) : [...f.style_tags, s],
    }))
  }

  function toggleLanguage(lang) {
    setForm(f => ({
      ...f,
      teaching_languages: f.teaching_languages.includes(lang)
        ? f.teaching_languages.filter(l => l !== lang)
        : [...f.teaching_languages, lang],
    }))
  }

  const isStillActive = (s) => {
    if (!s) return false
    let sessionEnd
    if (s.session_type === 'series' && Array.isArray(s.series_parts) && s.series_parts.length > 0) {
      const sorted = [...s.series_parts].sort((a, b) => new Date(a.start) - new Date(b.start))
      const last = sorted[sorted.length - 1]
      sessionEnd = new Date(last.start).getTime() + (last.duration_minutes || 60) * 60 * 1000
    } else {
      sessionEnd = new Date(s.scheduled_at).getTime() + (s.duration_minutes || 60) * 60 * 1000
    }
    const graceMs = (s.guest_grace_minutes_override ?? platformConfig?.guest_grace_minutes ?? 15) * 60 * 1000
    return (sessionEnd + graceMs) > Date.now()
  }
  const upcoming = bookings.filter(b => isStillActive(b.sessions))
  const past = bookings.filter(b => !isStillActive(b.sessions))
  const initials = (form.full_name || user.email || '?')[0].toUpperCase()
  const { recordingsBySessionId } = useRecordings(bookings, supabase)

  const inputStyle = {
    width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4',
    borderRadius: 8, padding: '10px 14px', fontSize: 14,
    outline: 'none', boxSizing: 'border-box', color: '#0f0c0c',
  }
  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 700,
    color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2' }}>
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
              borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>🎭 Switch to Teaching</button>
          )}
          <button onClick={onBack} style={{
            background: 'transparent', border: '1px solid rgba(250,247,242,0.3)',
            color: '#faf7f2', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
          }}>← Back</button>
        </div>
      </nav>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>

        {/* HEADER CARD */}
        <div style={{ background: 'white', borderRadius: 20, padding: 28, border: '1px solid #e2dbd4', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ flexShrink: 0 }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: avatarUrl ? 'transparent' : '#c8430a',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'white', fontSize: 32, fontWeight: 700,
                overflow: 'hidden',
              }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials
                }
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f0c0c', marginBottom: 2 }}>
                {form.full_name || 'No name set'}
              </h2>
              <div style={{ fontSize: 13, color: '#7a6e65', marginBottom: 8 }}>{user.email}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {isApprovedChoreo && <span style={{ background: '#e6f4ec', color: '#1a7a3c', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>✓ Choreographer</span>}
                {isPending && <span style={{ background: '#fff8e6', color: '#e8a020', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>⏳ Application Pending</span>}
                <span style={{ background: '#f0ebe6', color: '#5a4e47', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>Learner</span>
              </div>
            </div>
            <button onClick={() => { setEditMode(true); setActiveTab('profile') }} style={{
              background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#5a4e47', flexShrink: 0,
            }}>✏️ Edit</button>
          </div>
        </div>

        {/* TABS */}
        {!editMode && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'white', borderRadius: 12, padding: 4, border: '1px solid #e2dbd4' }}>
            {[
              ['profile', isChoreo ? '🎭 My Profile' : '👤 My Profile'],
              ['bookings', `💃 My Bookings (${bookings.length})`],
            ].map(([val, label]) => (
              <button key={val} onClick={() => setActiveTab(val)} style={{
                flex: 1, padding: '10px', borderRadius: 8, fontSize: 14,
                fontWeight: activeTab === val ? 700 : 400,
                background: activeTab === val ? '#0f0c0c' : 'transparent',
                color: activeTab === val ? 'white' : '#7a6e65',
                border: 'none', cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>
        )}

        {/* EDIT MODE */}
        {editMode && (
          <div style={{ background: 'white', borderRadius: 20, padding: 28, border: '1px solid #e2dbd4', marginBottom: 24 }}>
            <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 700, color: '#0f0c0c', marginBottom: 24 }}>Edit Profile</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              <div style={{ padding: 20, background: '#faf7f2', borderRadius: 12, border: '1px solid #e2dbd4' }}>
                <div style={{ ...labelStyle, marginBottom: 16 }}>Basic Info</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <ImageCropUploader
                      bucket="avatars"
                      path={`${user.id}/avatar.jpg`}
                      aspectRatio={1}
                      currentUrl={avatarUrl}
                      allowCropAdjust={true}
                      onUploadComplete={async (url) => {
                        await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
                        setAvatarUrl(url)
                      }}
                      label="Profile Photo"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Full Name</label>
                    <input style={inputStyle} value={form.full_name}
                      onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Your full name" />
                  </div>
                  <div>
                    <label style={labelStyle}>Instagram Handle</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: 11, color: '#7a6e65', fontSize: 14 }}>@</span>
                      <input style={{ ...inputStyle, paddingLeft: 28 }} value={form.instagram_handle}
                        onChange={e => setForm(f => ({ ...f, instagram_handle: cleanInstagram(e.target.value) }))}
                        placeholder="yourhandle" />
                    </div>
                    <div style={{ fontSize: 11, color: '#7a6e65', marginTop: 4 }}>Handle only — no @ or full URL</div>
                  </div>
                </div>
              </div>

              {isChoreo && (
                <div style={{ padding: 20, background: '#faf7f2', borderRadius: 12, border: '1px solid #e2dbd4' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#c8430a', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
                    🎭 Choreographer Profile — Visible to Learners
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Bio</label>
                      <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} value={form.bio}
                        onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                        placeholder="Your dance background, teaching experience, what makes your sessions special..." />
                    </div>
                    <div>
                      <label style={labelStyle}>Styles I Teach</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {STYLES.map(s => (
                          <button key={s} onClick={() => toggleStyle(s)} style={{
                            padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', border: '1px solid #e2dbd4',
                            background: form.style_tags.includes(s) ? '#c8430a' : 'white',
                            color: form.style_tags.includes(s) ? 'white' : '#5a4e47',
                          }}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Teaching Languages <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>(select all that apply)</span></label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {LANGUAGES.map(lang => (
                          <button key={lang} onClick={() => toggleLanguage(lang)} style={{
                            padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', border: '1px solid #e2dbd4',
                            background: form.teaching_languages.includes(lang) ? '#0f0c0c' : 'white',
                            color: form.teaching_languages.includes(lang) ? 'white' : '#5a4e47',
                          }}>{lang}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Sample / Promo Video URL</label>
                      <input style={inputStyle} value={form.sample_video_url}
                        onChange={e => setForm(f => ({ ...f, sample_video_url: e.target.value }))}
                        placeholder="YouTube, Instagram Reel, or Drive link..." />
                      <div style={{ fontSize: 11, color: '#7a6e65', marginTop: 4 }}>Short teaching clips work best for conversions</div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveProfile} disabled={saving} style={{
                  background: '#c8430a', color: 'white', border: 'none', borderRadius: 8,
                  padding: '11px 28px', fontSize: 14, fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                }}>{saving ? 'Saving...' : 'Save Changes'}</button>
                <button onClick={() => setEditMode(false)} style={{
                  background: 'white', border: '1px solid #e2dbd4', borderRadius: 8,
                  padding: '11px 20px', fontSize: 14, cursor: 'pointer', color: '#5a4e47',
                }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* PROFILE TAB */}
        {!editMode && activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #e2dbd4' }}>
              <div style={{ ...labelStyle, marginBottom: 16 }}>Basic Info</div>
              {form.instagram_handle ? (
                <a href={`https://instagram.com/${form.instagram_handle}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 14, color: '#c8430a', fontWeight: 600, textDecoration: 'none' }}>
                  📸 @{form.instagram_handle}
                </a>
              ) : (
                <span style={{ fontSize: 13, color: '#7a6e65' }}>No Instagram handle added</span>
              )}
            </div>

            {isChoreo && (
              <div style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #e2dbd4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#c8430a', textTransform: 'uppercase', letterSpacing: 1.5 }}>🎭 Choreographer Profile</div>
                  <span style={{ fontSize: 11, color: '#7a6e65' }}>Visible to learners</span>
                </div>
                {form.bio
                  ? <p style={{ fontSize: 14, color: '#3a3330', lineHeight: 1.8, marginBottom: 16 }}>{form.bio}</p>
                  : <p style={{ fontSize: 13, color: '#7a6e65', fontStyle: 'italic', marginBottom: 16 }}>No bio added yet</p>
                }
                {form.style_tags?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#7a6e65', marginBottom: 8 }}>STYLES</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {form.style_tags.map(tag => {
                        const color = styleColors[tag.toLowerCase().replace(/\s/g, '')] || '#c8430a'
                        return <span key={tag} style={{ background: color, color: 'white', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>{tag}</span>
                      })}
                    </div>
                  </div>
                )}
                {form.teaching_languages?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#7a6e65', marginBottom: 8 }}>TEACHES IN</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {form.teaching_languages.map(lang => (
                        <span key={lang} style={{ background: '#e8f4fd', color: '#1a5db5', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>🗣 {lang}</span>
                      ))}
                    </div>
                  </div>
                )}
                {form.sample_video_url && (
                  <div>
                    <div style={{ fontSize: 11, color: '#7a6e65', marginBottom: 8 }}>PROMO VIDEO</div>
                    <a href={form.sample_video_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 13, color: '#c8430a', fontWeight: 600, textDecoration: 'none' }}>🎬 Watch sample video →</a>
                  </div>
                )}
                {isPending && (
                  <div style={{ marginTop: 16, background: '#fff8e6', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#5a4e47' }}>
                    ⏳ Your application is under review. Usually 1–2 days.
                  </div>
                )}
              </div>
            )}

            {!isChoreo && onApplyToTeach && (
              <div style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #e2dbd4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f0c0c', marginBottom: 4 }}>Want to teach on NrithyaHolics?</div>
                  <div style={{ fontSize: 13, color: '#7a6e65' }}>Apply to become a choreographer and host live sessions.</div>
                </div>
                <button onClick={onApplyToTeach} style={{ background: '#c8430a', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Apply to Teach →
                </button>
              </div>
            )}
          </div>
        )}

        {/* BOOKINGS TAB */}
        {!editMode && activeTab === 'bookings' && (
          <div style={{ background: 'white', borderRadius: 20, padding: 28, border: '1px solid #e2dbd4' }}>
            <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 700, color: '#0f0c0c', marginBottom: 20 }}>My Bookings</h3>
            {loadingBookings ? (
              <div style={{ textAlign: 'center', color: '#7a6e65', padding: 32 }}>Loading...</div>
            ) : bookings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💃</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f0c0c', marginBottom: 6 }}>No bookings yet</div>
                <button onClick={onBack} style={{ background: '#c8430a', color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>Browse Sessions</button>
              </div>
            ) : (
              <div>
                {upcoming.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>UPCOMING ({upcoming.length})</div>
                    {upcoming.map(b => <BookingRow key={b.id} booking={b} isUpcoming onSessionClick={onSessionClick} onJoinClass={onJoinClass} platformConfig={platformConfig} guestBookings={guestBookingsMap[b.id] || []} user={user} onGuestRefresh={fetchBookings} recordingsBySessionId={recordingsBySessionId} setActiveRecording={setActiveRecording} />)}
                  </div>
                )}
                {past.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>PAST ({past.length})</div>
                    {past.map(b => <BookingRow key={b.id} booking={b} platformConfig={platformConfig} guestBookings={guestBookingsMap[b.id] || []} user={user} onGuestRefresh={fetchBookings} recordingsBySessionId={recordingsBySessionId} setActiveRecording={setActiveRecording} onPractice={onPractice} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
      {activeRecording && (
        <RecordingPlayerModal
          recording={activeRecording.recording}
          session={activeRecording.session}
          onClose={() => setActiveRecording(null)}
          supabaseUrl={import.meta.env.VITE_SUPABASE_URL}
          supabaseAnonKey={import.meta.env.VITE_SUPABASE_ANON_KEY}
          authToken={authToken}
        />
      )}
    </div>
  )
}

function BookingRow({ booking, isUpcoming, onSessionClick, onJoinClass, platformConfig, guestBookings, user, onGuestRefresh, recordingsBySessionId, setActiveRecording, onPractice }) {
const [editingGuest, setEditingGuest] = useState(null) // { id, email }
const [sendingGuest, setSendingGuest] = useState(null) // guest booking id being acted on
const session = booking.sessions
if (!session) return null
const styleKey = session.style_tags?.[0]?.toLowerCase().replace(/\s/g, '') || ''
const color = { bollywood: '#c8430a', bharatanatyam: '#5b4fcf', contemporary: '#1a7a3c', hiphop: '#b5420e', kathak: '#8b4513', folk: '#c47800' }[styleKey] || '#c8430a'
const price = booking.credits_paid || (session.price_tiers?.length ? Math.min(...session.price_tiers.map(t => t.price)) : 0)
const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const sessionStart = new Date(session.scheduled_at).getTime()
const sessionEnd = sessionStart + (session.duration_minutes || 60) * 60 * 1000
// Learners are always guests on ProfilePage
const canJoin = computeCanJoin(session, platformConfig, false)
const recording = recordingsBySessionId?.[booking.session_id]
const recordingAccessible = (() => {
  if (!recording) return false
  const accessDays = platformConfig?.recording_access_days ?? 30
  const expiry = new Date(session.scheduled_at)
  expiry.setDate(expiry.getDate() + accessDays)
  return new Date() <= expiry
})()

async function callResendInvite(guestBookingId, newEmail) {
  setSendingGuest(guestBookingId)
  try {
    const { data: { session: authSession } } = await supabase.auth.getSession()
    const token = authSession?.access_token
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resend-guest-invite`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ guest_booking_id: guestBookingId, new_email: newEmail }),
      }
    )
    const data = await res.json()
    if (!res.ok) { alert(data.error || 'Failed to send invite'); return }
    setEditingGuest(null)
    if (onGuestRefresh) onGuestRefresh()
  } catch (e) { alert(e.message) }
  setSendingGuest(null)
}

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid #f0ebe6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 4, height: 44, borderRadius: 2, background: color, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f0c0c', marginBottom: 2 }}>{session.title}</div>
          {session.session_type === 'series' && Array.isArray(session.series_parts) && session.series_parts.length > 0
            ? <div style={{ fontSize: 12, color: '#7a6e65' }}>
                {[...session.series_parts]
                  .sort((a, b) => new Date(a.start) - new Date(b.start))
                  .map((part, idx) => {
                    const d = new Date(part.start)
                    const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
                    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
                    return <div key={idx}>Part {idx + 1}: {label} · {time}</div>
                  })}
              </div>
            : <div style={{ fontSize: 12, color: '#7a6e65' }}>📅 {fmt(session.scheduled_at)} · {session.duration_minutes} mins</div>
          }
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          {price > 0 && <div style={{ fontSize: 14, fontWeight: 700, color: '#0f0c0c' }}>₹{price}</div>}
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: isUpcoming ? '#e6f4ec' : '#f0ebe6', color: isUpcoming ? '#1a7a3c' : '#7a6e65' }}>
            {isUpcoming ? '🟢 Upcoming' : 'Completed'}
          </span>
        </div>
      </div>
      {canJoin && isUpcoming && (onJoinClass || onSessionClick) && (
        <button
          onClick={() => onJoinClass ? onJoinClass(booking.session_id, booking.sessions) : onSessionClick(booking.session_id)}
          style={{ marginTop: 10, marginLeft: 18, background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          🎬 Join Class Now
        </button>
      )}
      {recordingAccessible && (
        <button
          onClick={() => setActiveRecording({ recording, session })}
          style={{ marginTop: 10, marginLeft: 18, background: '#1a3a2a', color: '#86efac', border: '1px solid #22c55e', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          ▶ Watch Recording
        </button>
      )}
      {!isUpcoming && booking.status === 'confirmed' && session?.status === 'completed' && onPractice && (
        <button
          onClick={() => onPractice(booking.session_id, booking.id)}
          style={{ marginTop: 10, marginLeft: 10, background: '#1a1a3a', color: '#a78bfa', border: '1px solid #7c3aed', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          🎯 Practice
        </button>
      )}
      {guestBookings && guestBookings.length > 0 && (
        <div style={{ marginTop: 10, marginLeft: 18, padding: '10px 14px', background: '#faf7f2', borderRadius: 10, border: '1px solid #e2dbd4' }}>
          <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
            Guest seats ({guestBookings.length})
          </div>
          {guestBookings.map(g => (
            <div key={g.id} style={{ marginBottom: 8 }}>
              {editingGuest?.id === g.id ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="email" value={editingGuest.email}
                    onChange={e => setEditingGuest(x => ({ ...x, email: e.target.value }))}
                    style={{ flex: 1, border: '1px solid #e2dbd4', borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none' }}
                  />
                  <button onClick={() => callResendInvite(g.id, editingGuest.email)} disabled={!!sendingGuest}
                    style={{ background: '#c8430a', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {sendingGuest === g.id ? '...' : 'Send'}
                  </button>
                  <button onClick={() => setEditingGuest(null)}
                    style={{ background: 'none', border: 'none', color: '#7a6e65', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#0f0c0c' }}>{g.guest_email}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: g.booked_by ? '#e6f4ec' : g.invited_at ? '#fff8e6' : '#f0f0f0',
                      color: g.booked_by ? '#1a7a3c' : g.invited_at ? '#e8a020' : '#7a6e65' }}>
                      {g.booked_by ? '✅ Joined' : g.invited_at ? '⏳ Pending' : '📋 Not invited yet'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!g.booked_by && (
                      <button onClick={() => setEditingGuest({ id: g.id, email: g.guest_email || '' })}
                        style={{ background: 'none', border: '1px solid #e2dbd4', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#5a4e47' }}>
                        ✏️ Edit
                      </button>
                    )}
                    <button onClick={() => callResendInvite(g.id, null)} disabled={!!sendingGuest}
                      style={{ background: 'none', border: '1px solid #e2dbd4', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#5a4e47', opacity: sendingGuest === g.id ? 0.5 : 1 }}>
                      {sendingGuest === g.id ? '...' : '📧 Resend'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
