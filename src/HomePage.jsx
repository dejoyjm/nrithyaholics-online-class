import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

function SessionCard({ session, onClick }) {
  console.log('SessionCard onClick prop:', onClick)
  const tiers = session.price_tiers
  const lowestPrice = Math.min(...tiers.map(t => t.price))
  const totalSeats = tiers.reduce((sum, t) => sum + t.seats, 0)
  const bookedCount = session.bookings_count || 0
  const pct = totalSeats > 0 ? bookedCount / totalSeats : 0
  const isFull = session.status === 'full' || bookedCount >= totalSeats
  const isHot = pct >= 0.7 && !isFull
  const seatsLeft = totalSeats - bookedCount

  const styleColors = {
    bollywood: '#c8430a',
    bharatanatyam: '#5b4fcf',
    contemporary: '#1a7a3c',
    hiphop: '#b5420e',
    kathak: '#8b4513',
    folk: '#c47800',
  }
  const color = styleColors[session.style_tags?.[0]] || '#c8430a'

  const formatDate = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric',
      month: 'short', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: 16,
      overflow: 'hidden',
      border: '1px solid #e2dbd4',
      cursor: 'pointer',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = 'translateY(-4px)'
      e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.12)'
    }}
    onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
      onClick={onClick}>
      <div style={{
        height: 120, background: color,
        display: 'flex', alignItems: 'flex-end',
        padding: '12px 16px', position: 'relative'
      }}>
        <span style={{
          background: 'rgba(0,0,0,0.35)', color: 'white',
          fontSize: 11, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', padding: '4px 10px', borderRadius: 20,
        }}>{session.style_tags?.[0] || 'Dance'}</span>

        {isHot && (
          <span style={{
            position: 'absolute', top: 12, right: 12,
            background: '#e8a020', color: 'white',
            fontSize: 11, fontWeight: 700,
            padding: '4px 10px', borderRadius: 20,
          }}>🔥 Filling fast</span>
        )}
        {isFull && (
          <span style={{
            position: 'absolute', top: 12, right: 12,
            background: '#333', color: 'white',
            fontSize: 11, fontWeight: 700,
            padding: '4px 10px', borderRadius: 20,
          }}>Full — Waitlist</span>
        )}
        {session.status === 'confirmed' && !isFull && (
          <span style={{
            position: 'absolute', top: 12, right: 12,
            background: '#1a7a3c', color: 'white',
            fontSize: 11, fontWeight: 700,
            padding: '4px 10px', borderRadius: 20,
          }}>✓ Confirmed</span>
        )}
      </div>

      <div style={{padding: '16px 20px 20px'}}>
        <div style={{fontSize: 11, color: '#7a6e65', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1}}>
          {session.skill_level?.replace('_', ' ')}
        </div>
        <h3 style={{fontSize: 17, fontWeight: 700, marginBottom: 6, color: '#0f0c0c'}}>
          {session.title}
        </h3>
        <div style={{fontSize: 13, color: '#7a6e65', marginBottom: 12}}>
          👤 {session.profiles?.full_name || 'NrithyaHolics'}
        </div>
        <div style={{fontSize: 13, color: '#3a3230', marginBottom: 16}}>
          📅 {formatDate(session.scheduled_at)}
        </div>

        <div style={{marginBottom: 16}}>
          <div style={{height: 4, background: '#e2dbd4', borderRadius: 4, overflow: 'hidden'}}>
            <div style={{
              height: '100%',
              width: `${Math.min(pct * 100, 100)}%`,
              background: isFull ? '#333' : isHot ? '#e8a020' : '#c8430a',
              borderRadius: 4,
            }}/>
          </div>
          <div style={{fontSize: 12, color: '#7a6e65', marginTop: 4}}>
            {isFull ? 'Session full' : `${seatsLeft} seats left`}
          </div>
        </div>

        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
          <div style={{fontSize: 20, fontWeight: 800, color: '#0f0c0c'}}>
            ₹{lowestPrice}
          </div>
            <button onClick={(e) => { e.stopPropagation(); onClick() }} style={{
              background: isFull ? '#333' : '#c8430a',
              color: 'white', border: 'none', borderRadius: 8,
              padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
              {isFull ? 'Join Waitlist' : 'Book Now'}
            </button>
        </div>
      </div>
    </div>
  )
}

export default function HomePage({ onLoginClick, user, onLogout, onSessionClick, profile, onSwitchToTeaching }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All Styles')

  useEffect(() => {
    fetchSessions()
  }, [])

  async function fetchSessions() {
    setLoading(true)
    const { data, error } = await supabase
      .from('sessions')
      .select('*, profiles(full_name)')
      .in('status', ['open', 'confirmed'])
      .order('scheduled_at', { ascending: true })

    if (error) {
      console.error('Error fetching sessions:', error)
    } else {
      setSessions(data || [])
    }
    setLoading(false)
  }

  const filters = ['All Styles', 'Bollywood', 'Bharatanatyam', 'Hip Hop', 'Contemporary', 'Kathak']

  const filtered = filter === 'All Styles' ? sessions : sessions.filter(s =>
    s.style_tags?.some(tag => tag.toLowerCase() === filter.toLowerCase().replace(' ', ''))
  )

  return (
    <div style={{minHeight: '100vh', background: '#faf7f2'}}>
    <nav style={{
        background: '#0f0c0c', padding: '0 40px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 900, color: '#faf7f2' }}>
          Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {user && profile?.role === 'choreographer' && profile?.choreographer_approved && (
            <button onClick={onSwitchToTeaching} style={{
              background: '#c8430a', color: 'white', border: 'none',
              borderRadius: 8, padding: '8px 16px', fontSize: 13,
              fontWeight: 600, cursor: 'pointer'
            }}>🎭 Switch to Teaching</button>
          )}
          {user ? (
            <>
              <span style={{ color: 'rgba(250,247,242,0.6)', fontSize: 14 }}>👋 {user.email}</span>
              <button onClick={onLogout} style={{
                background: 'transparent', border: '1px solid rgba(250,247,242,0.3)',
                color: '#faf7f2', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
              }}>Log out</button>
            </>
          ) : (
            <>
              <button onClick={onLoginClick} style={{
                background: 'transparent', border: '1px solid rgba(250,247,242,0.3)',
                color: '#faf7f2', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
              }}>Log in</button>
              <button onClick={onLoginClick} style={{
                background: '#c8430a', border: 'none', color: 'white',
                padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}>Sign up</button>
            </>
          )}
        </div>
      </nav>

      {/* PENDING BANNER */}
      {user && profile?.role === 'choreographer' && !profile?.choreographer_approved && (
        <div style={{
          background: '#e8a020', padding: '12px 40px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: 14, color: '#0f0c0c', fontWeight: 600 }}>
            🕐 Your choreographer application is under review — we'll notify you within 1–2 days. Browse and book sessions while you wait!
          </div>
        </div>
      )}

      <div style={{background: '#0f0c0c', padding: '60px 40px 80px', textAlign: 'center'}}>
        <div style={{fontSize: 12, letterSpacing: 4, color: '#e8a020', textTransform: 'uppercase', marginBottom: 16}}>
          Learn from the choreographer
        </div>
        <h1 style={{
          fontFamily: 'Georgia, serif', fontSize: 56, fontWeight: 900,
          color: '#faf7f2', lineHeight: 1.1, marginBottom: 16,
        }}>
          Live dance classes,<br/>
          <span style={{color: '#c8430a'}}>anywhere in India</span>
        </h1>
        <p style={{color: 'rgba(250,247,242,0.55)', fontSize: 18, marginBottom: 40}}>
          Book live sessions with real choreographers. Learn, dance, repeat.
        </p>
        <div style={{display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap'}}>
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? '#c8430a' : 'rgba(250,247,242,0.1)',
              color: '#faf7f2', border: '1px solid rgba(250,247,242,0.2)',
              padding: '8px 18px', borderRadius: 20, cursor: 'pointer',
              fontSize: 13, fontWeight: filter === f ? 600 : 400,
            }}>{f}</button>
          ))}
        </div>
      </div>

      <div style={{maxWidth: 1100, margin: '0 auto', padding: '48px 24px'}}>
        {loading ? (
          <div style={{textAlign: 'center', color: '#7a6e65', padding: '60px 0'}}>
            Loading sessions...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{textAlign: 'center', color: '#7a6e65', padding: '60px 0'}}>
            No sessions found for this style.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 24,
          }}>
            {filtered.map(s => <SessionCard key={s.id} session={s} onClick={() => onSessionClick(s.id)}/>)}
          </div>
        )}
      </div>
    </div>
  )
}