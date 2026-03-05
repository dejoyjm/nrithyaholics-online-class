import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AdminPage({ user, onLogout }) {
  const [tab, setTab] = useState('applications')
  const [applications, setApplications] = useState([])
  const [users, setUsers] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [appsRes, usersRes, sessionsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'choreographer').eq('choreographer_approved', false).order('choreographer_requested_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('sessions').select('*, profiles(full_name)').order('scheduled_at', { ascending: false }),
    ])
    setApplications(appsRes.data || [])
    setUsers(usersRes.data || [])
    setSessions(sessionsRes.data || [])
    setLoading(false)
  }

  async function approveChoreographer(profileId) {
    const { error } = await supabase.from('profiles')
      .update({ choreographer_approved: true })
      .eq('id', profileId)
    if (error) alert(error.message)
    else fetchAll()
  }

  async function rejectChoreographer(profileId) {
    const { error } = await supabase.from('profiles')
      .update({ role: 'learner', choreographer_approved: false })
      .eq('id', profileId)
    if (error) alert(error.message)
    else fetchAll()
  }

  const tabStyle = (t) => ({
    padding: '10px 20px', border: 'none', borderRadius: 8,
    cursor: 'pointer', fontSize: 14, fontWeight: 600,
    background: tab === t ? '#c8430a' : 'transparent',
    color: tab === t ? 'white' : '#7a6e65',
  })

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  }) : '—'

  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2' }}>

      {/* NAV */}
      <nav style={{ background: '#0f0c0c', padding: '0 40px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 900, color: '#faf7f2' }}>
          Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
          <span style={{ fontSize: 12, color: '#e8a020', marginLeft: 12, fontFamily: 'sans-serif', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Admin</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: 'rgba(250,247,242,0.6)', fontSize: 14 }}>👋 {user.email}</span>
          <button onClick={onLogout} style={{ background: 'transparent', border: '1px solid rgba(250,247,242,0.3)', color: '#faf7f2', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            Log out
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px' }}>

        {/* HEADER */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 36, fontWeight: 900, color: '#0f0c0c', marginBottom: 8 }}>
            Admin Panel
          </h1>
          <p style={{ color: '#7a6e65' }}>Manage users, sessions and choreographer applications</p>
        </div>

        {/* STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            ['Pending Applications', applications.length, '🕐', '#e8a020'],
            ['Total Users', users.length, '👥', '#5b4fcf'],
            ['Total Sessions', sessions.length, '🎭', '#c8430a'],
            ['Active Sessions', sessions.filter(s => ['open','confirmed'].includes(s.status)).length, '🔥', '#1a7a3c'],
          ].map(([label, value, icon, color]) => (
            <div key={label} style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e2dbd4' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
              <div style={{ fontSize: 12, color: '#7a6e65' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'white', padding: 6, borderRadius: 12, border: '1px solid #e2dbd4', width: 'fit-content' }}>
          <button style={tabStyle('applications')} onClick={() => setTab('applications')}>
            Applications {applications.length > 0 && <span style={{ background: '#e8a020', color: 'white', borderRadius: 20, padding: '2px 8px', fontSize: 11, marginLeft: 6 }}>{applications.length}</span>}
          </button>
          <button style={tabStyle('users')} onClick={() => setTab('users')}>Users</button>
          <button style={tabStyle('sessions')} onClick={() => setTab('sessions')}>Sessions</button>
        </div>

        {/* CONTENT */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2dbd4', overflow: 'hidden' }}>

          {/* APPLICATIONS TAB */}
          {tab === 'applications' && (
            loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#7a6e65' }}>Loading...</div>
            ) : applications.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', marginBottom: 8 }}>All caught up!</h3>
                <p style={{ color: '#7a6e65' }}>No pending choreographer applications</p>
              </div>
            ) : applications.map((app, i) => (
              <div key={app.id} style={{ padding: '24px', borderBottom: i < applications.length - 1 ? '1px solid #f0ebe6' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#c8430a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 700 }}>
                        {(app.full_name || app.id)[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#0f0c0c' }}>{app.full_name || 'No name'}</div>
                        <div style={{ fontSize: 13, color: '#7a6e65' }}>Applied {formatDate(app.choreographer_requested_at)}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
                      {app.instagram_handle && (
                        <a href={`https://instagram.com/${app.instagram_handle}`} target="_blank" rel="noreferrer"
                          style={{ fontSize: 13, color: '#c8430a', textDecoration: 'none' }}>
                          📸 @{app.instagram_handle}
                        </a>
                      )}
                      {app.sample_video_url && (
                        <a href={app.sample_video_url} target="_blank" rel="noreferrer"
                          style={{ fontSize: 13, color: '#c8430a', textDecoration: 'none' }}>
                          🎥 Sample Video
                        </a>
                      )}
                      {app.teaching_language && (
                        <span style={{ fontSize: 13, color: '#7a6e65' }}>🗣️ {app.teaching_language}</span>
                      )}
                    </div>

                    {app.style_tags?.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                        {app.style_tags.map(tag => (
                          <span key={tag} style={{ background: '#f0ebe6', color: '#5a4e47', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase' }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {app.bio && (
                      <p style={{ fontSize: 13, color: '#5a4e47', lineHeight: 1.6, maxWidth: 600 }}>{app.bio}</p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginLeft: 24 }}>
                    <button onClick={() => rejectChoreographer(app.id)} style={{
                      background: 'transparent', border: '1px solid #e2dbd4',
                      color: '#7a6e65', padding: '8px 16px', borderRadius: 8,
                      cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}>Reject</button>
                    <button onClick={() => approveChoreographer(app.id)} style={{
                      background: '#1a7a3c', border: 'none',
                      color: 'white', padding: '8px 20px', borderRadius: 8,
                      cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}>✓ Approve</button>
                  </div>
                </div>
              </div>
            ))
          )}

          {/* USERS TAB */}
          {tab === 'users' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f0ebe6' }}>
                  {['Name', 'Role', 'Status', 'Joined'].map(h => (
                    <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? '1px solid #f0ebe6' : 'none' }}>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f0c0c' }}>{u.full_name || '—'}</div>
                      {u.instagram_handle && <div style={{ fontSize: 12, color: '#7a6e65' }}>@{u.instagram_handle}</div>}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        background: u.role === 'choreographer' ? '#f0e8ff' : '#f0ebe6',
                        color: u.role === 'choreographer' ? '#5b4fcf' : '#5a4e47',
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase'
                      }}>{u.role || 'learner'}</span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      {u.role === 'choreographer' && (
                        <span style={{
                          background: u.choreographer_approved ? '#e6f4ec' : '#fff8e6',
                          color: u.choreographer_approved ? '#1a7a3c' : '#e8a020',
                          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20
                        }}>{u.choreographer_approved ? '✓ Approved' : '⏳ Pending'}</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#7a6e65' }}>
                      {formatDate(u.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* SESSIONS TAB */}
          {tab === 'sessions' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f0ebe6' }}>
                  {['Session', 'Choreographer', 'Date', 'Seats', 'Status'].map(h => (
                    <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: i < sessions.length - 1 ? '1px solid #f0ebe6' : 'none' }}>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f0c0c' }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: '#7a6e65' }}>{s.style_tags?.[0]} · {s.skill_level?.replace(/_/g, ' ')}</div>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47' }}>
                      {s.profiles?.full_name || '—'}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47' }}>
                      {formatDate(s.scheduled_at)}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47' }}>
                      {s.max_seats} seats
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        background: s.status === 'confirmed' ? '#e6f4ec' : s.status === 'open' ? '#fff8e6' : '#f0ebe6',
                        color: s.status === 'confirmed' ? '#1a7a3c' : s.status === 'open' ? '#e8a020' : '#7a6e65',
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase'
                      }}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}