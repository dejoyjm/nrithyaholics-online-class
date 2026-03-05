import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function SessionPage({ sessionId, user, onBack, onLoginClick }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState(false)
  const [seats, setSeats] = useState(1)

  useEffect(() => {
    fetchSession()
  }, [sessionId])

  async function fetchSession() {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, profiles(full_name, bio, instagram_handle)')
      .eq('id', sessionId)
      .single()

    if (error) console.error(error)
    else setSession(data)
    setLoading(false)
  }

  async function handleBook() {
    if (!user) { onLoginClick(); return }
    setBooking(true)

    const tiers = session.price_tiers
    const lowestPrice = Math.min(...tiers.map(t => t.price))

    const { error } = await supabase.from('bookings').insert({
      session_id: session.id,
      booked_by: user.id,
      credits_paid: lowestPrice * seats,
      status: 'confirmed'
    })

    if (error) {
      alert('Booking failed: ' + error.message)
    } else {
      setBooked(true)
    }
    setBooking(false)
  }

  if (loading) return (
    <div style={{
      minHeight: '100vh', background: '#0f0c0c',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#faf7f2', fontSize: 18
    }}>Loading session...</div>
  )

  if (!session) return (
    <div style={{
      minHeight: '100vh', background: '#0f0c0c',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#faf7f2', fontSize: 18
    }}>Session not found</div>
  )

  const tiers = session.price_tiers
  const lowestPrice = Math.min(...tiers.map(t => t.price))
  const totalSeats = tiers.reduce((sum, t) => sum + t.seats, 0)

  const styleColors = {
    bollywood: '#c8430a', bharatanatyam: '#5b4fcf',
    contemporary: '#1a7a3c', hiphop: '#b5420e',
    kathak: '#8b4513', folk: '#c47800',
  }
  const color = styleColors[session.style_tags?.[0]] || '#c8430a'

  const formatDate = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long',
      year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div style={{minHeight: '100vh', background: '#faf7f2'}}>

      {/* NAV */}
      <nav style={{
        background: '#0f0c0c', padding: '0 40px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 900, color: '#faf7f2'}}>
          Nrithya<span style={{color: '#c8430a'}}>Holics</span>
        </div>
        <button onClick={onBack} style={{
          background: 'transparent',
          border: '1px solid rgba(250,247,242,0.3)',
          color: '#faf7f2', padding: '8px 20px',
          borderRadius: 8, cursor: 'pointer', fontSize: 14,
        }}>← Back</button>
      </nav>

      {/* HERO BANNER */}
      <div style={{
        height: 280, background: color,
        display: 'flex', alignItems: 'flex-end',
        padding: '32px 48px',
      }}>
        <div>
          <div style={{
            display: 'inline-block',
            background: 'rgba(0,0,0,0.3)', color: 'white',
            fontSize: 11, fontWeight: 700, letterSpacing: 2,
            textTransform: 'uppercase', padding: '4px 12px',
            borderRadius: 20, marginBottom: 16,
          }}>
            {session.style_tags?.[0]} · {session.skill_level?.replace('_', ' ')}
          </div>
          <h1 style={{
            fontFamily: 'Georgia, serif',
            fontSize: 42, fontWeight: 900,
            color: 'white', lineHeight: 1.1,
          }}>{session.title}</h1>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{maxWidth: 900, margin: '0 auto', padding: '48px 24px'}}>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 340px', gap: 40}}>

          {/* LEFT */}
          <div>
            {/* Choreographer */}
            <div style={{
              background: 'white', borderRadius: 16,
              padding: '24px', border: '1px solid #e2dbd4',
              marginBottom: 24,
            }}>
              <div style={{fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12}}>
                Your Choreographer
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: color, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 22, fontWeight: 700,
                }}>
                  {(session.profiles?.full_name || 'N')[0]}
                </div>
                <div>
                  <div style={{fontWeight: 700, fontSize: 17, color: '#0f0c0c'}}>
                    {session.profiles?.full_name || 'NrithyaHolics'}
                  </div>
                  {session.profiles?.instagram_handle && (
                    <div style={{fontSize: 13, color: '#7a6e65'}}>
                      @{session.profiles.instagram_handle}
                    </div>
                  )}
                </div>
              </div>
              {session.profiles?.bio && (
                <p style={{fontSize: 14, color: '#5a4e47', marginTop: 16, lineHeight: 1.6}}>
                  {session.profiles.bio}
                </p>
              )}
            </div>

            {/* Description */}
            <div style={{
              background: 'white', borderRadius: 16,
              padding: '24px', border: '1px solid #e2dbd4',
              marginBottom: 24,
            }}>
              <div style={{fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12}}>
                About this session
              </div>
              <p style={{fontSize: 15, color: '#3a3230', lineHeight: 1.7}}>
                {session.description || 'No description provided.'}
              </p>
            </div>

            {/* Details */}
            <div style={{
              background: 'white', borderRadius: 16,
              padding: '24px', border: '1px solid #e2dbd4',
            }}>
              <div style={{fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16}}>
                Session Details
              </div>
              {[
                ['📅', 'Date & Time', formatDate(session.scheduled_at)],
                ['⏱️', 'Duration', `${session.duration_minutes} minutes`],
                ['👥', 'Total Seats', `${totalSeats} seats`],
                ['📊', 'Level', session.skill_level?.replace(/_/g, ' ')],
                ['✅', 'Status', session.status],
              ].map(([icon, label, value]) => (
                <div key={label} style={{
                  display: 'flex', gap: 16,
                  padding: '12px 0',
                  borderBottom: '1px solid #f0ebe6',
                }}>
                  <span style={{fontSize: 18}}>{icon}</span>
                  <div>
                    <div style={{fontSize: 12, color: '#7a6e65', marginBottom: 2}}>{label}</div>
                    <div style={{fontSize: 14, fontWeight: 600, color: '#0f0c0c', textTransform: 'capitalize'}}>{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — BOOKING CARD */}
          <div>
            <div style={{
              background: 'white', borderRadius: 16,
              padding: '28px', border: '1px solid #e2dbd4',
              position: 'sticky', top: 80,
            }}>
              {booked ? (
                <div style={{textAlign: 'center', padding: '20px 0'}}>
                  <div style={{fontSize: 48, marginBottom: 16}}>🎉</div>
                  <h3 style={{fontSize: 20, fontWeight: 700, color: '#0f0c0c', marginBottom: 8}}>
                    You're booked!
                  </h3>
                  <p style={{fontSize: 14, color: '#7a6e65', lineHeight: 1.6}}>
                    Check your email for confirmation. We'll remind you before the session.
                  </p>
                  <button onClick={onBack} style={{
                    marginTop: 24, width: '100%',
                    background: '#0f0c0c', color: 'white',
                    border: 'none', borderRadius: 10,
                    padding: '14px', fontSize: 15,
                    fontWeight: 600, cursor: 'pointer',
                  }}>Browse more sessions</button>
                </div>
              ) : (
                <>
                  {/* Pricing */}
                  <div style={{marginBottom: 20}}>
                    <div style={{fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12}}>
                      Pricing
                    </div>
                    {tiers.map((tier, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: i < tiers.length - 1 ? '1px solid #f0ebe6' : 'none',
                      }}>
                        <span style={{fontSize: 13, color: '#5a4e47'}}>
                          {i === 0 ? 'Early bird' : `Tier ${i + 1}`} · {tier.seats} seats
                        </span>
                        <span style={{fontSize: 14, fontWeight: 700, color: '#0f0c0c'}}>
                          ₹{tier.price}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Seats selector */}
                  <div style={{marginBottom: 20}}>
                    <div style={{fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12}}>
                      Number of seats
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
                      <button onClick={() => setSeats(Math.max(1, seats - 1))} style={{
                        width: 36, height: 36, borderRadius: '50%',
                        border: '1px solid #e2dbd4', background: 'white',
                        fontSize: 18, cursor: 'pointer', color: '#0f0c0c',
                      }}>−</button>
                      <span style={{fontSize: 20, fontWeight: 700, color: '#0f0c0c', minWidth: 24, textAlign: 'center'}}>
                        {seats}
                      </span>
                       <button onClick={() => setSeats(Math.min(5, seats + 1))} style={{
                        width: 36, height: 36, borderRadius: '50%',
                        border: '1px solid #e2dbd4', background: 'white',
                        fontSize: 18, cursor: 'pointer', color: '#0f0c0c',
                      }}>+</button>