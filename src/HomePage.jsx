const SESSIONS = [
  {
    id: 1,
    title: "Thumka Choreography",
    choreographer: "Priya Sharma",
    style: "Bollywood",
    level: "Beginner",
    date: "Sat 8 Mar, 7:00 PM",
    price: 499,
    seats_total: 20,
    seats_booked: 14,
    color: "#c8430a"
  },
  {
    id: 2,
    title: "Bharatanatyam Basics",
    choreographer: "Meera Nair",
    style: "Bharatanatyam",
    level: "Absolute Beginner",
    date: "Sun 9 Mar, 6:00 PM",
    price: 599,
    seats_total: 15,
    seats_booked: 5,
    color: "#5b4fcf"
  },
  {
    id: 3,
    title: "Contemporary Flow",
    choreographer: "Arjun Das",
    style: "Contemporary",
    level: "Intermediate",
    date: "Mon 10 Mar, 8:00 PM",
    price: 699,
    seats_total: 12,
    seats_booked: 12,
    color: "#1a7a3c"
  },
  {
    id: 4,
    title: "Hip Hop Basics",
    choreographer: "Riya Kapoor",
    style: "Hip Hop",
    level: "Beginner",
    date: "Tue 11 Mar, 7:30 PM",
    price: 449,
    seats_total: 25,
    seats_booked: 8,
    color: "#c8430a"
  },
]

function SessionCard({ session }) {
  const pct = session.seats_booked / session.seats_total
  const isFull = pct >= 1
  const isHot = pct >= 0.7 && !isFull
  const seatsLeft = session.seats_total - session.seats_booked

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
    }}>

      {/* Colour banner */}
      <div style={{
        height: 120,
        background: session.color,
        display: 'flex',
        alignItems: 'flex-end',
        padding: '12px 16px',
        position: 'relative'
      }}>
        <span style={{
          background: 'rgba(0,0,0,0.35)',
          color: 'white',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          padding: '4px 10px',
          borderRadius: 20,
        }}>{session.style}</span>

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
      </div>

      {/* Card body */}
      <div style={{padding: '16px 20px 20px'}}>
        <div style={{fontSize: 11, color: '#7a6e65', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1}}>
          {session.level}
        </div>
        <h3 style={{fontSize: 17, fontWeight: 700, marginBottom: 6, color: '#0f0c0c'}}>
          {session.title}
        </h3>
        <div style={{fontSize: 13, color: '#7a6e65', marginBottom: 12}}>
          👤 {session.choreographer}
        </div>
        <div style={{fontSize: 13, color: '#3a3230', marginBottom: 16}}>
          📅 {session.date}
        </div>

        {/* Seat bar */}
        <div style={{marginBottom: 16}}>
          <div style={{
            height: 4, background: '#e2dbd4',
            borderRadius: 4, overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${pct * 100}%`,
              background: isFull ? '#333' : isHot ? '#e8a020' : '#c8430a',
              borderRadius: 4,
              transition: 'width 0.3s'
            }}/>
          </div>
          <div style={{fontSize: 12, color: '#7a6e65', marginTop: 4}}>
            {isFull ? 'Session full' : `${seatsLeft} seats left`}
          </div>
        </div>

        {/* Price + CTA */}
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
          <div style={{fontSize: 20, fontWeight: 800, color: '#0f0c0c'}}>
            ₹{session.price}
          </div>
          <button style={{
            background: isFull ? '#333' : '#c8430a',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}>
            {isFull ? 'Join Waitlist' : 'Book Now'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HomePage({ onLoginClick, user }) {
  return (
    <div style={{minHeight: '100vh', background: '#faf7f2'}}>

      {/* NAV */}
      <nav style={{
        background: '#0f0c0c',
        padding: '0 40px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{
          fontFamily: 'Georgia, serif',
          fontSize: 22,
          fontWeight: 900,
          color: '#faf7f2',
        }}>
          Nrithya<span style={{color: '#c8430a'}}>Holics</span>
        </div>
        <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
          {user ? (
            <>
              <span style={{color: 'rgba(250,247,242,0.6)', fontSize: 14}}>
                👋 {user.email}
              </span>
              <button onClick={onLogout} style={{
                background: 'transparent',
                border: '1px solid rgba(250,247,242,0.3)',
                color: '#faf7f2',
                padding: '8px 20px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
              }}>Log out</button>
            </>
          ) : (
            <>
              <button onClick={onLoginClick} style={{
                background: 'transparent',
                border: '1px solid rgba(250,247,242,0.3)',
                color: '#faf7f2',
                padding: '8px 20px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
              }}>Log in</button>
              <button onClick={onLoginClick} style={{
                background: '#c8430a',
                border: 'none',
                color: 'white',
                padding: '8px 20px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}>Sign up</button>
            </>
          )}
        </div>
      </nav>

      {/* HERO */}
      <div style={{
        background: '#0f0c0c',
        padding: '60px 40px 80px',
        textAlign: 'center',
      }}>
        <div style={{fontSize: 12, letterSpacing: 4, color: '#e8a020', textTransform: 'uppercase', marginBottom: 16}}>
          Learn from the choreographer
        </div>
        <h1 style={{
          fontFamily: 'Georgia, serif',
          fontSize: 56,
          fontWeight: 900,
          color: '#faf7f2',
          lineHeight: 1.1,
          marginBottom: 16,
        }}>
          Live dance classes,<br/>
          <span style={{color: '#c8430a'}}>anywhere in India</span>
        </h1>
        <p style={{color: 'rgba(250,247,242,0.55)', fontSize: 18, marginBottom: 40}}>
          Book live sessions with real choreographers. Learn, dance, repeat.
        </p>

        {/* Filters */}
        <div style={{display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap'}}>
          {['All Styles', 'Bollywood', 'Bharatanatyam', 'Hip Hop', 'Contemporary', 'Kathak'].map(f => (
            <button key={f} style={{
              background: f === 'All Styles' ? '#c8430a' : 'rgba(250,247,242,0.1)',
              color: '#faf7f2',
              border: '1px solid rgba(250,247,242,0.2)',
              padding: '8px 18px',
              borderRadius: 20,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: f === 'All Styles' ? 600 : 400,
            }}>{f}</button>
          ))}
        </div>
      </div>

      {/* SESSION GRID */}
      <div style={{maxWidth: 1100, margin: '0 auto', padding: '48px 24px'}}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 24,
        }}>
          {SESSIONS.map(s => <SessionCard key={s.id} session={s}/>)}
        </div>
      </div>

    </div>
  )
}