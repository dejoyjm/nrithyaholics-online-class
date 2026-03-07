import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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

export default function ProfilePage({ user, profile, onBack, onApplyToTeach, onSwitchToTeaching }) {
  const [bookings, setBookings] = useState([])
  const [loadingBookings, setLoadingBookings] = useState(true)
  const [activeTab, setActiveTab] = useState('profile')
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const isChoreo = profile?.role === 'choreographer'
  const isApprovedChoreo = isChoreo && profile?.choreographer_approved
  const isPending = isChoreo && !profile?.choreographer_approved

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
    const { data } = await supabase
      .from('bookings')
      .select('*, sessions(title, scheduled_at, style_tags, skill_level, duration_minutes, price_tiers)')
      .eq('booked_by', user.id)
      .order('created_at', { ascending: false })
    setBookings(data || [])
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

  async function uploadAvatar(file) {
    if (!file) return
    const ext = file.name.split('.').pop()
    const path = `${user.id}/avatar.${ext}`
    setUploadingPhoto(true)
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) { alert('Upload failed: ' + uploadError.message); setUploadingPhoto(false); return }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const publicUrl = data.publicUrl + '?t=' + Date.now() // cache bust
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
    setAvatarUrl(publicUrl)
    setUploadingPhoto(false)
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

  const upcoming = bookings.filter(b => new Date(b.sessions?.scheduled_at) > new Date())
  const past = bookings.filter(b => new Date(b.sessions?.scheduled_at) <= new Date())
  const initials = (form.full_name || user.email || '?')[0].toUpperCase()

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
            <div style={{ position: 'relative', flexShrink: 0 }}>
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
              {/* Photo upload button */}
              <label style={{
                position: 'absolute', bottom: 0, right: 0, width: 26, height: 26,
                borderRadius: '50%', background: uploadingPhoto ? '#e2dbd4' : '#0f0c0c',
                border: '2px solid white', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 11, cursor: 'pointer',
                title: 'Change photo',
              }}>
                {uploadingPhoto ? '⏳' : '📷'}
                <input type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => uploadAvatar(e.target.files[0])} />
              </label>
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
                    {upcoming.map(b => <BookingRow key={b.id} booking={b} isUpcoming />)}
                  </div>
                )}
                {past.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>PAST ({past.length})</div>
                    {past.map(b => <BookingRow key={b.id} booking={b} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

function BookingRow({ booking, isUpcoming }) {
  const session = booking.sessions
  if (!session) return null
  const styleKey = session.style_tags?.[0]?.toLowerCase().replace(/\s/g, '') || ''
  const color = { bollywood: '#c8430a', bharatanatyam: '#5b4fcf', contemporary: '#1a7a3c', hiphop: '#b5420e', kathak: '#8b4513', folk: '#c47800' }[styleKey] || '#c8430a'
  const price = booking.credits_paid || (session.price_tiers?.length ? Math.min(...session.price_tiers.map(t => t.price)) : 0)
  const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid #f0ebe6' }}>
      <div style={{ width: 4, height: 44, borderRadius: 2, background: color, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f0c0c', marginBottom: 2 }}>{session.title}</div>
        <div style={{ fontSize: 12, color: '#7a6e65' }}>📅 {fmt(session.scheduled_at)} · {session.duration_minutes} mins</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {price > 0 && <div style={{ fontSize: 14, fontWeight: 700, color: '#0f0c0c', marginBottom: 4 }}>₹{price}</div>}
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: isUpcoming ? '#e6f4ec' : '#f0ebe6', color: isUpcoming ? '#1a7a3c' : '#7a6e65' }}>
          {isUpcoming ? '🟢 Upcoming' : 'Completed'}
        </span>
      </div>
    </div>
  )
}
