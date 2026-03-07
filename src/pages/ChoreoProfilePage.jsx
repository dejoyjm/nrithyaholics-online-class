import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const styleColors = {
  bollywood: '#c8430a', bharatanatyam: '#5b4fcf',
  contemporary: '#1a7a3c', hiphop: '#b5420e',
  kathak: '#8b4513', folk: '#c47800',
  jazz: '#1a5db5', fusion: '#7a1a7a',
}

function getStyleColor(tags) {
  const key = tags?.[0]?.toLowerCase().replace(/\s/g, '') || ''
  return styleColors[key] || '#c8430a'
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDateShort(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function ChoreoProfilePage({ choreoId, user, onBack, onSessionClick, onLoginClick }) {
  const [choreo, setChoreo] = useState(null)
  const [upcomingSessions, setUpcomingSessions] = useState([])
  const [pastSessions, setPastSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (choreoId) fetchAll()
  }, [choreoId])

  async function fetchAll() {
    setLoading(true)
    const [profileRes, sessionsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', choreoId).single(),
      supabase.from('sessions').select('*')
        .eq('choreographer_id', choreoId)
        .order('scheduled_at', { ascending: false }),
    ])

    if (profileRes.data) setChoreo(profileRes.data)

    if (sessionsRes.data) {
      const now = new Date()
      setUpcomingSessions(
        sessionsRes.data.filter(s => new Date(s.scheduled_at) > now && ['open', 'confirmed', 'full'].includes(s.status))
          .reverse() // soonest first
      )
      setPastSessions(
        sessionsRes.data.filter(s => s.status === 'completed' || new Date(s.scheduled_at) < now)
          .slice(0, 10) // last 10
      )
    }
    setLoading(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 900, color: '#faf7f2' }}>
        Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
      </div>
    </div>
  )

  if (!choreo) return (
    <div style={{ minHeight: '100vh', background: '#faf7f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c' }}>Choreographer not found</div>
        <button onClick={onBack} style={{ marginTop: 20, background: '#c8430a', color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Go back
        </button>
      </div>
    </div>
  )

  const initials = (choreo.full_name || '?')[0].toUpperCase()
  const accentColor = getStyleColor(choreo.style_tags)
  const totalSessions = upcomingSessions.length + pastSessions.length

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
          <button onClick={onBack} style={{
            background: 'transparent', border: '1px solid rgba(250,247,242,0.3)',
            color: '#faf7f2', padding: '8px 20px', borderRadius: 8,
            cursor: 'pointer', fontSize: 14,
          }}>← Back</button>
          {!user && (
            <button onClick={onLoginClick} style={{
              background: '#c8430a', color: 'white', border: 'none',
              padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
            }}>Sign in</button>
          )}
        </div>
      </nav>

      {/* HERO BANNER */}
      <div style={{
        background: accentColor,
        height: 180,
        position: 'relative',
      }} />

      {/* PROFILE HEADER */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ position: 'relative', marginTop: -56, marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>

            {/* Avatar */}
            <div style={{
              width: 112, height: 112, borderRadius: '50%',
              background: accentColor,
              border: '4px solid white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 44, fontWeight: 700,
              flexShrink: 0, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            }}>
              {initials}
            </div>

            {/* Name + tags */}
            <div style={{ paddingBottom: 8, flex: 1 }}>
              <h1 style={{
                fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 900,
                color: '#0f0c0c', marginBottom: 8, lineHeight: 1.1,
              }}>
                {choreo.full_name || 'Choreographer'}
              </h1>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {choreo.style_tags?.map(tag => (
                  <span key={tag} style={{
                    background: '#f0ebe6', color: '#5a4e47',
                    fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
                  }}>{tag}</span>
                ))}
                {choreo.teaching_language && (
                  <span style={{
                    background: '#e8f4fd', color: '#1a5db5',
                    fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
                  }}>🗣 {choreo.teaching_language}</span>
                )}
              </div>
            </div>

            {/* Social links */}
            <div style={{ display: 'flex', gap: 10, paddingBottom: 8 }}>
              {choreo.instagram_handle && (
                <a
                  href={`https://instagram.com/${choreo.instagram_handle.replace('@', '')}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'white', border: '1px solid #e2dbd4',
                    borderRadius: 8, padding: '8px 14px',
                    fontSize: 13, fontWeight: 600, color: '#0f0c0c',
                    textDecoration: 'none',
                  }}
                >
                  📸 @{choreo.instagram_handle.replace('@', '')}
                </a>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 32, alignItems: 'start' }}>

          {/* LEFT COLUMN */}
          <div>

            {/* Bio */}
            {choreo.bio && (
              <div style={{
                background: 'white', borderRadius: 16, padding: 28,
                border: '1px solid #e2dbd4', marginBottom: 24,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                  About
                </div>
                <p style={{ fontSize: 15, color: '#3a3330', lineHeight: 1.8, margin: 0 }}>
                  {choreo.bio}
                </p>
              </div>
            )}

            {/* Upcoming Sessions */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{
                fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700,
                color: '#0f0c0c', marginBottom: 16,
              }}>
                Upcoming Sessions
                {upcomingSessions.length > 0 && (
                  <span style={{ fontSize: 14, fontWeight: 400, color: '#7a6e65', marginLeft: 10 }}>
                    {upcomingSessions.length} scheduled
                  </span>
                )}
              </h2>

              {upcomingSessions.length === 0 ? (
                <div style={{
                  background: 'white', borderRadius: 16, padding: '40px 28px',
                  border: '1px solid #e2dbd4', textAlign: 'center', color: '#7a6e65',
                }}>
                  No upcoming sessions right now. Check back soon!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {upcomingSessions.map(session => (
                    <UpcomingSessionCard
                      key={session.id}
                      session={session}
                      onClick={() => onSessionClick(session.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Past Sessions */}
            {pastSessions.length > 0 && (
              <div>
                <h2 style={{
                  fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700,
                  color: '#0f0c0c', marginBottom: 16,
                }}>
                  Past Sessions
                </h2>
                <div style={{
                  background: 'white', borderRadius: 16,
                  border: '1px solid #e2dbd4', overflow: 'hidden',
                }}>
                  {pastSessions.map((s, i) => (
                    <div key={s.id} style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', padding: '14px 20px',
                      borderBottom: i < pastSessions.length - 1 ? '1px solid #f0ebe6' : 'none',
                    }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f0c0c' }}>{s.title}</div>
                        <div style={{ fontSize: 12, color: '#7a6e65', marginTop: 2 }}>
                          {s.style_tags?.[0]} · {formatDateShort(s.scheduled_at)}
                        </div>
                      </div>
                      <span style={{
                        background: '#f0ebe6', color: '#7a6e65',
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        textTransform: 'uppercase',
                      }}>Completed</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN — Stats card */}
          <div style={{ position: 'sticky', top: 80 }}>
            <div style={{
              background: 'white', borderRadius: 16, padding: 24,
              border: '1px solid #e2dbd4',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
                Choreographer Stats
              </div>

              {[
                ['🎭', 'Sessions', totalSessions],
                ['💃', 'Upcoming', upcomingSessions.length],
                ['✅', 'Completed', pastSessions.length],
              ].map(([icon, label, value]) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', padding: '12px 0',
                  borderBottom: '1px solid #f0ebe6',
                }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <span style={{ fontSize: 13, color: '#5a4e47' }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#0f0c0c' }}>{value}</span>
                </div>
              ))}

              {/* Teaching style summary */}
              {choreo.style_tags?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: '#7a6e65', marginBottom: 8 }}>Teaches</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {choreo.style_tags.map(tag => (
                      <span key={tag} style={{
                        background: accentColor, color: 'white',
                        fontSize: 11, fontWeight: 700,
                        padding: '3px 10px', borderRadius: 20,
                      }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Footer spacer */}
      <div style={{ height: 60 }} />
    </div>
  )
}

// ── Upcoming Session Card (inline, horizontal) ─────────────────
function UpcomingSessionCard({ session, onClick }) {
  const tiers = session.price_tiers || []
  const lowestPrice = tiers.length ? Math.min(...tiers.map(t => t.price)) : 0
  const totalSeats = tiers.reduce((sum, t) => sum + t.seats, 0)
  const bookedCount = session.bookings_count || 0
  const seatsLeft = totalSeats - bookedCount
  const isFull = session.status === 'full' || bookedCount >= totalSeats
  const isHot = !isFull && totalSeats > 0 && bookedCount / totalSeats >= 0.7
  const color = (() => {
    const key = session.style_tags?.[0]?.toLowerCase().replace(/\s/g, '') || ''
    return styleColors[key] || '#c8430a'
  })()

  return (
    <div
      onClick={onClick}
      style={{
        background: 'white', borderRadius: 14, overflow: 'hidden',
        border: '1px solid #e2dbd4', cursor: 'pointer',
        display: 'flex', transition: 'box-shadow 0.2s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.10)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Color strip */}
      <div style={{ width: 6, background: color, flexShrink: 0 }} />

      <div style={{ padding: '16px 20px', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f0c0c', marginBottom: 4, lineHeight: 1.3 }}>
              {session.title}
            </div>
            <div style={{ fontSize: 12, color: '#7a6e65', marginBottom: 8 }}>
              📅 {new Date(session.scheduled_at).toLocaleDateString('en-IN', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit',
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ background: '#f0ebe6', color: '#5a4e47', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>
                {session.skill_level?.replace(/_/g, ' ')}
              </span>
              {isHot && <span style={{ fontSize: 11, color: '#c8430a', fontWeight: 700 }}>🔥 Filling fast</span>}
              {isFull && <span style={{ fontSize: 11, color: '#cc0000', fontWeight: 700 }}>FULL</span>}
            </div>
          </div>

          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f0c0c', marginBottom: 4 }}>
              {lowestPrice > 0 ? `₹${lowestPrice}` : 'Free'}
            </div>
            <div style={{ fontSize: 11, color: '#7a6e65', marginBottom: 10 }}>
              {isFull ? 'Waitlist' : `${seatsLeft} left`}
            </div>
            <button style={{
              background: isFull ? '#333' : '#c8430a',
              color: 'white', border: 'none', borderRadius: 8,
              padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              {isFull ? 'Waitlist' : 'Book'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
