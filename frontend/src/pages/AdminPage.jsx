import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AdminPage({ user, onLogout, onConfigChange }) {
  const [tab, setTab] = useState('applications')
  const [applications, setApplications] = useState([])
  const [users, setUsers] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [appsRes, usersRes, sessionsRes, waitlistRes] = await Promise.all([
      supabase.from('profiles_with_email').select('*')
        .eq('role', 'choreographer').eq('choreographer_approved', false)
        .order('choreographer_requested_at', { ascending: false }),
      supabase.from('profiles_with_email').select('*')
        .order('auth_created_at', { ascending: false }),
      supabase.from('sessions').select('*, profiles(full_name, avatar_url)')
        .order('scheduled_at', { ascending: false }),
      supabase.from('waitlist').select('session_id'),
    ])
    setApplications(appsRes.data || [])
    setUsers(usersRes.data || [])
    setSessions(sessionsRes.data || [])
    const counts = {}
    waitlistRes.data?.forEach(w => { counts[w.session_id] = (counts[w.session_id] || 0) + 1 })
    setWaitlistCounts(counts)
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

  async function initiateRevoke(user) {
    const { data: activeSessions } = await supabase
      .from('sessions').select('id, title, scheduled_at, max_seats')
      .eq('choreographer_id', user.id).in('status', ['open', 'confirmed', 'draft'])
    setConfirmAction({ type: 'revoke', user, sessions: activeSessions || [] })
  }

  async function initiateSuspend(user) {
    const { data: activeSessions } = await supabase
      .from('sessions').select('id, title, scheduled_at')
      .eq('choreographer_id', user.id).in('status', ['open', 'confirmed'])
    setConfirmAction({ type: 'suspend', user, sessions: activeSessions || [] })
  }

  async function revokeChoreographer(profileId, reason) {
    const { data: choreoSessions } = await supabase
      .from('sessions').select('id')
      .eq('choreographer_id', profileId).in('status', ['open', 'confirmed', 'draft'])

    const sessionIds = choreoSessions?.map(s => s.id) || []
    if (sessionIds.length > 0) {
      await supabase.from('bookings')
        .update({ status: 'cancelled', cancelled_reason: 'choreographer_revoked', cancelled_at: new Date().toISOString() })
        .in('session_id', sessionIds)
      await supabase.from('sessions').update({ status: 'cancelled' }).in('id', sessionIds)
    }

    const { error } = await supabase.from('profiles')
      .update({ role: 'learner', choreographer_approved: false, admin_notes: reason })
      .eq('id', profileId)

    if (error) alert(error.message)
    else { fetchAll(); setSelectedUser(null); setConfirmAction(null) }
  }

  async function suspendUser(profileId, reason) {
    const { error } = await supabase.from('profiles')
      .update({ suspended: true, suspension_reason: reason, suspended_at: new Date().toISOString() })
      .eq('id', profileId)
    if (error) alert(error.message)
    else { fetchAll(); setSelectedUser(null); setConfirmAction(null) }
  }

  async function reinstateUser(profileId) {
    const { error } = await supabase.from('profiles')
      .update({ suspended: false, suspension_reason: null, suspended_at: null })
      .eq('id', profileId)
    if (error) alert(error.message)
    else { fetchAll(); setSelectedUser(null) }
  }

  async function setUserRole(profileId, newRole) {
    const updates = {
      role: newRole,
      suspended: false,
      suspension_reason: null,
      suspended_at: null,
    }
    if (newRole === 'choreographer') {
      updates.choreographer_approved = true
      updates.choreographer_requested_at = new Date().toISOString()
    } else {
      updates.choreographer_approved = false
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', profileId)
    if (error) alert(error.message)
    else {
      fetchAll()
      const { data } = await supabase.from('profiles_with_email').select('*').eq('id', profileId).single()
      setSelectedUser(data)
    }
  }

  const [adminEditSession, setAdminEditSession] = useState(null)
  const [platformConfig, setPlatformConfig] = useState(null)
  const [waitlistCounts, setWaitlistCounts] = useState({})

  useEffect(() => {
    supabase.from('platform_config')
      .select('host_pre_join_minutes, guest_pre_join_minutes, host_grace_minutes, guest_grace_minutes')
      .eq('id', 1).single()
      .then(({ data }) => { if (data) setPlatformConfig(data) })
  }, [])

  async function adminCancelSession(sessionId) {
    if (!window.confirm('Cancel this session? All bookings will be cancelled.')) return
    await supabase.from('bookings').update({ status: 'cancelled', cancelled_reason: 'admin_cancelled', cancelled_at: new Date().toISOString() }).eq('session_id', sessionId)
    await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', sessionId)
    fetchAll()
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
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 36, fontWeight: 900, color: '#0f0c0c', marginBottom: 8 }}>Admin Panel</h1>
          <p style={{ color: '#7a6e65' }}>Manage users, sessions and choreographer applications</p>
        </div>

        {/* STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            ['Pending Applications', applications.length, '🕐', '#e8a020'],
            ['Total Users', users.length, '👥', '#5b4fcf'],
            ['Total Sessions', sessions.length, '🎭', '#c8430a'],
            ['Active Sessions', sessions.filter(s => ['open', 'confirmed'].includes(s.status)).length, '🔥', '#1a7a3c'],
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
            Applications {applications.length > 0 && (
              <span style={{ background: '#e8a020', color: 'white', borderRadius: 20, padding: '2px 8px', fontSize: 11, marginLeft: 6 }}>
                {applications.length}
              </span>
            )}
          </button>
          <button style={tabStyle('users')} onClick={() => setTab('users')}>Users</button>
          <button style={tabStyle('sessions')} onClick={() => setTab('sessions')}>Sessions</button>
          <button style={tabStyle('settings')} onClick={() => setTab('settings')}>⚙️ Settings</button>
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
              <div key={app.id} onClick={() => setSelectedUser(app)}
                style={{ padding: '24px', cursor: 'pointer', borderBottom: i < applications.length - 1 ? '1px solid #f0ebe6' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#c8430a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 700 }}>
                        {(app.full_name || app.email || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#0f0c0c' }}>{app.full_name || '— no name —'}</div>
                        <div style={{ fontSize: 13, color: '#7a6e65' }}>{app.email}</div>
                      </div>
                    </div>
                    {app.bio && <p style={{ fontSize: 13, color: '#5a4e47', marginBottom: 8, lineHeight: 1.5 }}>{app.bio}</p>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {app.style_tags?.map(t => (
                        <span key={t} style={{ background: '#f0ebe6', color: '#5a4e47', fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>{t}</span>
                      ))}
                      {app.teaching_language && (
                        <span style={{ background: '#e8f4fd', color: '#1a5db5', fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>🗣 {app.teaching_language}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginLeft: 16 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => rejectChoreographer(app.id)}
                      style={{ background: '#fff0f0', border: '1px solid #ffcccc', color: '#cc0000', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Reject</button>
                    <button onClick={() => approveChoreographer(app.id)}
                      style={{ background: '#1a7a3c', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>✓ Approve</button>
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
                  {['Name', 'Email', 'Role', 'Status', 'Joined'].map(h => (
                    <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} onClick={() => setSelectedUser(u)}
                    style={{ borderBottom: i < users.length - 1 ? '1px solid #f0ebe6' : 'none', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#faf7f2'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#c8430a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                          {u.avatar_url ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (u.full_name || u.email || '?')[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#0f0c0c' }}>{u.full_name || '—'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#7a6e65' }}>{u.email}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ background: '#f0ebe6', color: '#5a4e47', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'capitalize' }}>
                        {u.role || 'learner'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      {u.suspended ? (
                        <span style={{ background: '#fff0f0', color: '#cc0000', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>🚫 Suspended</span>
                      ) : u.role === 'choreographer' ? (
                        <span style={{ background: u.choreographer_approved ? '#e6f4ec' : '#fff8e6', color: u.choreographer_approved ? '#1a7a3c' : '#e8a020', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                          {u.choreographer_approved ? '✓ Approved' : '⏳ Pending'}
                        </span>
                      ) : (
                        <span style={{ background: '#e6f4ec', color: '#1a7a3c', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>Active</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#7a6e65' }}>{formatDate(u.auth_created_at || u.created_at)}</td>
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
                  {['Session', 'Choreographer', 'Date', 'Seats', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: i < sessions.length - 1 ? '1px solid #f0ebe6' : 'none' }}>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#f0ebe6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {s.cover_photo_url
                            ? <img src={s.cover_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ fontSize: 18 }}>🎭</span>
                          }
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#0f0c0c' }}>{s.title}</div>
                          <div style={{ fontSize: 12, color: '#7a6e65' }}>{s.style_tags?.join(', ')}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47' }}>
                      {s.profiles?.full_name || '—'}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47', whiteSpace: 'nowrap' }}>
                      {new Date(s.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47' }}>
                      {s.bookings_count || 0} / {s.max_seats || '—'}
                      {waitlistCounts[s.id] > 0 && (
                        <span style={{ marginLeft: 8, background: '#fff8e6', color: '#e8a020', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>
                          +{waitlistCounts[s.id]} waiting
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        background: s.status === 'confirmed' ? '#e6f4ec' : s.status === 'open' ? '#fff8e6' : '#f0ebe6',
                        color: s.status === 'confirmed' ? '#1a7a3c' : s.status === 'open' ? '#e8a020' : '#7a6e65',
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase'
                      }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {['open','draft','confirmed'].includes(s.status) && (
                          <button onClick={() => setAdminEditSession(s)} style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#5a4e47' }}>✏️ Edit</button>
                        )}
                        {['open','confirmed','draft'].includes(s.status) && (
                          <button onClick={() => adminCancelSession(s.id)} style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#cc0000' }}>✕ Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* PLATFORM SETTINGS TAB */}
        {tab === 'settings' && (
          <div style={{ padding: 32 }}>
            <PlatformSettingsTab
              config={platformConfig}
              onConfigSaved={(newConfig) => {
                setPlatformConfig(newConfig)
                if (onConfigChange) onConfigChange(newConfig)
              }}
            />
          </div>
        )}

      </div>

      {/* ADMIN SESSION EDIT MODAL */}
      {adminEditSession && (
        <AdminSessionEditModal
          session={adminEditSession}
          onClose={() => setAdminEditSession(null)}
          onSaved={() => { setAdminEditSession(null); fetchAll() }}
        />
      )}

      {/* USER PROFILE DRAWER */}
      {selectedUser && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => setSelectedUser(null)}
        >
          <div
            style={{ background: 'white', width: '100%', maxWidth: 480, height: '100vh', overflowY: 'auto', padding: 36 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif' }}>User Profile</h2>
              <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#7a6e65' }}>×</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#c8430a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 26, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                {selectedUser.avatar_url
                  ? <img src={selectedUser.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (selectedUser.full_name || selectedUser.email || '?')[0].toUpperCase()
                }
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 20, color: '#0f0c0c' }}>{selectedUser.full_name || '— no name —'}</div>
                <div style={{ fontSize: 13, color: '#7a6e65' }}>{selectedUser.email}</div>
                {selectedUser.suspended && (
                  <span style={{ background: '#fff0f0', color: '#cc0000', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, display: 'inline-block', marginTop: 4 }}>🚫 Suspended</span>
                )}
              </div>
            </div>

            <div style={{ background: '#faf7f2', borderRadius: 12, padding: '4px 0', marginBottom: 24 }}>
              {[
                ['Role', selectedUser.role || 'learner'],
                ['Choreo Status', selectedUser.role === 'choreographer' ? (selectedUser.choreographer_approved ? '✓ Approved' : '⏳ Pending') : '—'],
                ['Instagram', selectedUser.instagram_handle ? `@${selectedUser.instagram_handle}` : '—'],
                ['Joined', formatDate(selectedUser.auth_created_at || selectedUser.created_at)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #f0ebe6' }}>
                  <span style={{ fontSize: 12, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f0c0c', textTransform: 'capitalize' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Role switcher */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Set Role</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setUserRole(selectedUser.id, 'learner')}
                  disabled={selectedUser.role === 'learner' && !selectedUser.choreographer_approved}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid #e2dbd4',
                    background: selectedUser.role === 'learner' ? '#0f0c0c' : 'white',
                    color: selectedUser.role === 'learner' ? 'white' : '#5a4e47',
                  }}
                >
                  👤 Learner
                </button>
                <button
                  onClick={() => setUserRole(selectedUser.id, 'choreographer')}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', border: 'none',
                    background: (selectedUser.role === 'choreographer' && selectedUser.choreographer_approved && !selectedUser.suspended) ? '#c4b5fd' : '#5b4fcf',
                    color: 'white',
                  }}
                >
                  🎭 Promote to Choreo
                </button>
              </div>
            </div>

            {selectedUser.bio && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Bio</div>
                <p style={{ fontSize: 13, color: '#5a4e47', lineHeight: 1.6, background: '#faf7f2', padding: 14, borderRadius: 10 }}>
                  {selectedUser.bio}
                </p>
              </div>
            )}

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Internal Notes</div>
              <AdminNotes userId={selectedUser.id} existingNotes={selectedUser.admin_notes} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedUser.role === 'choreographer' && !selectedUser.choreographer_approved && !selectedUser.suspended && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { rejectChoreographer(selectedUser.id); setSelectedUser(null) }}
                    style={{ flex: 1, background: '#fff0f0', border: '1px solid #ffcccc', color: '#cc0000', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                    ✗ Reject Application
                  </button>
                  <button onClick={() => { approveChoreographer(selectedUser.id); setSelectedUser(null) }}
                    style={{ flex: 1, background: '#1a7a3c', border: 'none', color: 'white', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                    ✓ Approve Application
                  </button>
                </div>
              )}

              {selectedUser.role === 'choreographer' && selectedUser.choreographer_approved && !selectedUser.suspended && (
                <button onClick={() => initiateRevoke(selectedUser)}
                  style={{ width: '100%', background: '#fff0e6', border: '1px solid #e8a020', color: '#c8430a', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  ⚠️ Revoke Choreographer Status
                </button>
              )}

              {!selectedUser.suspended && (
                <button onClick={() => initiateSuspend(selectedUser)}
                  style={{ width: '100%', background: '#fff0f0', border: '1px solid #ffcccc', color: '#cc0000', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  🚫 Suspend Account
                </button>
              )}

              {selectedUser.suspended && (
                <div>
                  <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#cc0000', marginBottom: 4 }}>🚫 Account Suspended</div>
                    <div style={{ fontSize: 12, color: '#7a6e65' }}>{selectedUser.suspension_reason || 'No reason provided'}</div>
                  </div>
                  <button onClick={() => reinstateUser(selectedUser.id)}
                    style={{ width: '100%', background: '#1a7a3c', border: 'none', color: 'white', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                    ✓ Reinstate Account
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM ACTION DIALOG */}
      {confirmAction && (
        <ConfirmActionDialog
          action={confirmAction}
          onConfirm={(reason) => {
            if (confirmAction.type === 'revoke') revokeChoreographer(confirmAction.user.id, reason)
            else if (confirmAction.type === 'suspend') suspendUser(confirmAction.user.id, reason)
          }}
          onCancel={() => setConfirmAction(null)}
          formatDate={formatDate}
        />
      )}
    </div>
  )
}

// ── AdminNotes ─────────────────────────────────────────────────
function AdminNotes({ userId, existingNotes }) {
  const [notes, setNotes] = useState(existingNotes || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function saveNotes() {
    setSaving(true)
    await supabase.from('profiles').update({ admin_notes: notes }).eq('id', userId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <textarea
        value={notes}
        onChange={e => { setNotes(e.target.value); setSaved(false) }}
        placeholder="Internal notes — not visible to user"
        style={{ width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '10px 14px', fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#0f0c0c', minHeight: 80, resize: 'vertical', lineHeight: 1.5 }}
      />
      <button onClick={saveNotes} disabled={saving}
        style={{ marginTop: 8, background: saved ? '#1a7a3c' : '#0f0c0c', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
        {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save Notes'}
      </button>
    </div>
  )
}

// ── ConfirmActionDialog ────────────────────────────────────────
function ConfirmActionDialog({ action, onConfirm, onCancel, formatDate }) {
  const [reason, setReason] = useState('')
  const isRevoke = action.type === 'revoke'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 36, width: '100%', maxWidth: 520 }}>
        <div style={{ fontSize: 40, marginBottom: 16, textAlign: 'center' }}>
          {isRevoke ? '⚠️' : '🚫'}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f0c0c', marginBottom: 8, textAlign: 'center', fontFamily: 'Georgia, serif' }}>
          {isRevoke ? 'Revoke Choreographer Status' : 'Suspend Account'}
        </h2>
        <p style={{ fontSize: 14, color: '#7a6e65', marginBottom: 24, textAlign: 'center', lineHeight: 1.6 }}>
          {isRevoke
            ? `This will remove choreographer access for ${action.user.full_name || action.user.email} and cancel all their active sessions.`
            : `This will suspend ${action.user.full_name || action.user.email}'s account. They will not be able to use the platform.`
          }
        </p>

        {action.sessions?.length > 0 && (
          <div style={{ background: '#fff8e6', border: '1px solid #e8a020', borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#e8a020', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              {action.sessions.length} Active Session{action.sessions.length > 1 ? 's' : ''} will be cancelled
            </div>
            {action.sessions.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(232,160,32,0.2)', fontSize: 13 }}>
                <span style={{ color: '#0f0c0c', fontWeight: 600 }}>{s.title}</span>
                <span style={{ color: '#7a6e65' }}>{formatDate(s.scheduled_at)}</span>
              </div>
            ))}
            <div style={{ fontSize: 12, color: '#7a6e65', marginTop: 8 }}>
              All learner bookings on these sessions will also be cancelled.
            </div>
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>
            Reason (required)
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={isRevoke ? 'Why is choreographer status being revoked?' : 'Why is this account being suspended?'}
            style={{ width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box', color: '#0f0c0c', minHeight: 80, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel}
            style={{ flex: 1, background: 'transparent', border: '1px solid #e2dbd4', color: '#7a6e65', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            Cancel
          </button>
          <button
            onClick={() => { if (!reason.trim()) { alert('Please provide a reason'); return } onConfirm(reason) }}
            disabled={!reason.trim()}
            style={{ flex: 2, background: isRevoke ? '#c8430a' : '#cc0000', border: 'none', color: 'white', padding: '12px', borderRadius: 8, cursor: reason.trim() ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600, opacity: reason.trim() ? 1 : 0.5 }}>
            {isRevoke ? '⚠️ Confirm Revoke' : '🚫 Confirm Suspend'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Admin Session Edit Modal ─────────────────────────────────
const ADMIN_HOURS   = Array.from({ length: 24 }, (_, i) => i)
const ADMIN_MINUTES = ['00', '15', '30', '45']
function fmtAdminHour(h) {
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${h % 12 || 12} ${ampm}`
}
function parseAdminTime(utcStr) {
  if (!utcStr) return { hour: 9, minute: '00' }
  const d = new Date(utcStr)
  const h = d.getHours()
  const m = d.getMinutes()
  const mins = [0, 15, 30, 45]
  const nearest = mins.reduce((prev, curr) => Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev, 0)
  return { hour: h, minute: String(nearest).padStart(2, '0') }
}

// Helper: converts a UTC timestamp to a local YYYY-MM-DD string (IST-safe)
function toLocalDateString(utcStr) {
  const d = new Date(utcStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function AdminSessionEditModal({ session, onClose, onSaved }) {
  const [waitlist, setWaitlist] = useState([])

  useEffect(() => {
    supabase.from('waitlist').select('email, created_at')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setWaitlist(data || []))
  }, [session.id])

  const [form, setForm] = useState({
    title: session.title || '',
    description: session.description || '',
    // ✅ FIX: use local date (not UTC ISO date) so IST users don't get off-by-one day
    date: session.scheduled_at ? toLocalDateString(session.scheduled_at) : '',
    hour:   session.scheduled_at ? parseAdminTime(session.scheduled_at).hour   : 9,
    minute: session.scheduled_at ? parseAdminTime(session.scheduled_at).minute : '00',
    duration: session.duration_minutes || 60,
    price: session.price_tiers?.[0]?.price || 0,
    max_seats: session.max_seats || 20,
    min_seats: session.min_seats || 5,
    status: session.status || 'open',
    age_groups: session.age_groups || ['All Ages'],
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const inputStyle = { width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box', color: '#0f0c0c' }
  const labelStyle = { fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }

  async function handleSave() {
    if (!form.title || !form.date || form.hour === '' || !form.minute) { alert('Title, date and time required'); return }
    setSaving(true)
    const timeStr = `${String(form.hour).padStart(2,'0')}:${form.minute}:00`
    const scheduledAt = new Date(`${form.date}T${timeStr}`).toISOString()
    const { error } = await supabase.from('sessions').update({
      title: form.title,
      description: form.description,
      scheduled_at: scheduledAt,
      duration_minutes: Number(form.duration),
      price_tiers: [{ seats: form.max_seats, price: form.price }],
      max_seats: Number(form.max_seats),
      min_seats: Number(form.min_seats),
      status: form.status,
      age_groups: form.age_groups.length > 0 ? form.age_groups : ['All Ages'],
    }).eq('id', session.id)
    if (error) alert(error.message)
    else onSaved()
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 32, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif' }}>Edit Session</h2>
            <div style={{ fontSize: 11, color: '#e8a020', fontWeight: 600, marginTop: 2 }}>⚡ Admin Override</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#7a6e65' }}>×</button>
        </div>

        {session.cover_photo_url && (
          <div style={{ marginBottom: 20, borderRadius: 10, overflow: 'hidden' }}>
            <img src={session.cover_photo_url} alt="" style={{ width: '100%', height: 120, objectFit: 'cover' }} />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Session Title</label>
            <input style={inputStyle} value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input style={inputStyle} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
           <div>
              <label style={labelStyle}>Start Time</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select style={inputStyle} value={form.hour} onChange={e => set('hour', Number(e.target.value))}>
                  {ADMIN_HOURS.map(h => (
                    <option key={h} value={h}>{fmtAdminHour(h)}</option>
                  ))}
                </select>
                <select style={inputStyle} value={form.minute} onChange={e => set('minute', e.target.value)}>
                  {ADMIN_MINUTES.map(m => (
                    <option key={m} value={m}>:{m}</option>
                  ))}
                </select>
              </div>
            </div>          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Duration (mins)</label>
              <select style={inputStyle} value={form.duration} onChange={e => set('duration', Number(e.target.value))}>
                {[30, 45, 60, 75, 90, 120].map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={form.status} onChange={e => set('status', e.target.value)}>
                {['draft','open','confirmed','cancelled','completed'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Price (₹)</label>
              <input style={inputStyle} type="number" min="0" value={form.price} onChange={e => set('price', Number(e.target.value))} />
            </div>
            <div>
              <label style={labelStyle}>Min Seats</label>
              <input style={inputStyle} type="number" min="1" value={form.min_seats} onChange={e => set('min_seats', Number(e.target.value))} />
            </div>
            <div>
              <label style={labelStyle}>Max Seats</label>
              <input style={inputStyle} type="number" min="1" value={form.max_seats} onChange={e => set('max_seats', Number(e.target.value))} />
            </div>
          </div>
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
        </div>

        {/* Waitlist */}
        {waitlist.length > 0 && (
          <div style={{ marginTop: 24, borderTop: '1px solid #e2dbd4', paddingTop: 20 }}>
            <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontWeight: 700 }}>
              Waitlist ({waitlist.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
              {waitlist.map((w, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#faf7f2', padding: '8px 12px', borderRadius: 8 }}>
                  <span style={{ fontSize: 13, color: '#0f0c0c' }}>{w.email}</span>
                  <span style={{ fontSize: 11, color: '#7a6e65' }}>
                    {new Date(w.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, background: 'transparent', border: '1px solid #e2dbd4', color: '#7a6e65', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, background: '#c8430a', color: 'white', padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', border: 'none', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PlatformSettingsTab ────────────────────────────────────────
function PlatformSettingsTab({ onConfigSaved }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchConfig() }, [])

  async function fetchConfig() {
    const { data } = await supabase
      .from('platform_config')
      .select('*')
      .eq('id', 1)
      .single()
    if (data) {
      setForm({
        host_pre_join_minutes:  data.host_pre_join_minutes,
        guest_pre_join_minutes: data.guest_pre_join_minutes,
        host_grace_minutes:     data.host_grace_minutes,
        guest_grace_minutes:    data.guest_grace_minutes,
      })
    }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const { error } = await supabase
      .from('platform_config')
      .update({ ...form, updated_at: new Date().toISOString() })
      .eq('id', 1)
    setSaving(false)
    if (error) { alert(error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    if (onConfigSaved) onConfigSaved(form)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: Math.max(0, parseInt(v) || 0) }))

  const inputStyle = {
    width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4',
    borderRadius: 8, padding: '10px 14px', fontSize: 15, fontWeight: 600,
    outline: 'none', boxSizing: 'border-box', color: '#0f0c0c', textAlign: 'center',
  }
  const labelStyle = { fontSize: 12, color: '#7a6e65', fontWeight: 600, marginBottom: 6, display: 'block' }

  if (loading || !form) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#7a6e65' }}>Loading settings...</div>
  )

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 800, color: '#0f0c0c', marginBottom: 6 }}>
          Platform Settings
        </h2>
        <p style={{ fontSize: 14, color: '#7a6e65', lineHeight: 1.6 }}>
          Controls when the classroom becomes accessible before and after each session.
          Changes apply globally to all sessions. Individual sessions can override these values.
        </p>
      </div>

      <div style={{ background: 'white', borderRadius: 16, padding: 28, border: '1px solid #e2dbd4', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#c8430a', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20 }}>
          🎭 Choreographer (Host)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <label style={labelStyle}>Early entry (minutes before)</label>
            <input style={inputStyle} type="number" min="0" max="60" value={form.host_pre_join_minutes}
              onChange={e => set('host_pre_join_minutes', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Grace period (minutes after end)</label>
            <input style={inputStyle} type="number" min="0" max="120" value={form.host_grace_minutes}
              onChange={e => set('host_grace_minutes', e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 16, padding: 28, border: '1px solid #e2dbd4', marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#5b4fcf', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20 }}>
          💃 Learner (Guest)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <label style={labelStyle}>Early entry (minutes before)</label>
            <input style={inputStyle} type="number" min="0" max="30" value={form.guest_pre_join_minutes}
              onChange={e => set('guest_pre_join_minutes', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Grace period (minutes after end)</label>
            <input style={inputStyle} type="number" min="0" max="60" value={form.guest_grace_minutes}
              onChange={e => set('guest_grace_minutes', e.target.value)} />
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        style={{ background: saved ? '#1a7a3c' : '#c8430a', color: 'white', border: 'none', borderRadius: 10, padding: '14px 32px', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
        {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
