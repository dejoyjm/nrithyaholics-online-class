import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AdminPage({ user, onLogout, onConfigChange }) {
  const [tab, setTab] = useState('applications')
  const [applications, setApplications] = useState([])
  const [users, setUsers] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null) // { type, user, sessions }

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [appsRes, usersRes, sessionsRes] = await Promise.all([
      supabase.from('profiles_with_email').select('*')
        .eq('role', 'choreographer').eq('choreographer_approved', false)
        .order('choreographer_requested_at', { ascending: false }),
      supabase.from('profiles_with_email').select('*')
        .order('auth_created_at', { ascending: false }),
      supabase.from('sessions').select('*, profiles(full_name, avatar_url)')
        .order('scheduled_at', { ascending: false }),
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

  // ── Supreme Leader: set any user to any role ───────────────
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
      // Demoting to learner
      updates.choreographer_approved = false
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', profileId)
    if (error) alert(error.message)
    else {
      fetchAll()
      // Refresh the selected user panel
      const { data } = await supabase.from('profiles_with_email').select('*').eq('id', profileId).single()
      setSelectedUser(data)
    }
  }

  const [adminEditSession, setAdminEditSession] = useState(null)
  const [platformConfig, setPlatformConfig] = useState(null)
  // Load platform config for the settings tab
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
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f0c0c' }}>{u.full_name || '—'}</div>
                      {u.instagram_handle && <div style={{ fontSize: 12, color: '#7a6e65' }}>@{u.instagram_handle}</div>}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#7a6e65' }}>{u.email}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        background: u.role === 'choreographer' ? '#f0e8ff' : '#f0ebe6',
                        color: u.role === 'choreographer' ? '#5b4fcf' : '#5a4e47',
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase'
                      }}>
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
                          <div style={{ fontSize: 12, color: '#7a6e65' }}>{s.style_tags?.[0]} · {s.skill_level?.replace(/_/g, ' ')}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#c8430a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                          {s.profiles?.avatar_url
                            ? <img src={s.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : (s.profiles?.full_name || '?')[0].toUpperCase()
                          }
                        </div>
                        <span style={{ fontSize: 13, color: '#5a4e47' }}>{s.profiles?.full_name || '—'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47' }}>{formatDate(s.scheduled_at)}</td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47' }}>{s.bookings_count || 0}/{s.max_seats}</td>
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
            {/* Drawer header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif' }}>User Profile</h2>
              <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#7a6e65' }}>×</button>
            </div>

            {/* Avatar + name */}
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

            {/* Meta rows */}
            <div style={{ background: '#faf7f2', borderRadius: 12, padding: '4px 0', marginBottom: 24 }}>
              {[
                ['Role', selectedUser.role || 'learner'],
                ['Choreo Status', selectedUser.role === 'choreographer' ? (selectedUser.choreographer_approved ? '✓ Approved' : '⏳ Pending') : '—'],
                ['Instagram', selectedUser.instagram_handle ? `@${selectedUser.instagram_handle}` : '—'],
                ['Teaching Language', selectedUser.teaching_language || '—'],
                ['Applied', formatDate(selectedUser.choreographer_requested_at)],
                ['Last Sign In', formatDate(selectedUser.last_sign_in_at)],
                ['Joined', formatDate(selectedUser.auth_created_at || selectedUser.created_at)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #e2dbd4' }}>
                  <span style={{ fontSize: 12, color: '#7a6e65' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f0c0c', textTransform: 'capitalize' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* ── SUPREME LEADER: Role Assignment ── */}
            <div style={{ marginBottom: 24, background: '#f5f0ff', border: '1px solid #c4b5fd', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5b4fcf', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                ⚡ Supreme Leader — Role Assignment
              </div>
              <p style={{ fontSize: 12, color: '#7a6e65', marginBottom: 16, lineHeight: 1.5 }}>
                Directly set this user's role. Promoting to Choreographer bypasses the application and auto-approves. Also clears any suspension.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setUserRole(selectedUser.id, 'learner')}
                  disabled={selectedUser.role === 'learner' && !selectedUser.suspended}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: (selectedUser.role === 'learner' && !selectedUser.suspended) ? 'not-allowed' : 'pointer',
                    border: '1px solid #e2dbd4',
                    background: (selectedUser.role === 'learner' && !selectedUser.suspended) ? '#f0ebe6' : 'white',
                    color: (selectedUser.role === 'learner' && !selectedUser.suspended) ? '#7a6e65' : '#0f0c0c',
                  }}
                >
                  👤 Set as Learner
                </button>
                <button
                  onClick={() => setUserRole(selectedUser.id, 'choreographer')}
                  disabled={selectedUser.role === 'choreographer' && selectedUser.choreographer_approved && !selectedUser.suspended}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: (selectedUser.role === 'choreographer' && selectedUser.choreographer_approved && !selectedUser.suspended) ? 'not-allowed' : 'pointer',
                    border: 'none',
                    background: (selectedUser.role === 'choreographer' && selectedUser.choreographer_approved && !selectedUser.suspended) ? '#c4b5fd' : '#5b4fcf',
                    color: 'white',
                  }}
                >
                  🎭 Promote to Choreo
                </button>
              </div>
            </div>

            {/* Bio */}
            {selectedUser.bio && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Bio</div>
                <p style={{ fontSize: 13, color: '#5a4e47', lineHeight: 1.6, background: '#faf7f2', padding: 14, borderRadius: 10 }}>
                  {selectedUser.bio}
                </p>
              </div>
            )}

            {/* Admin Notes */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Internal Notes</div>
              <AdminNotes userId={selectedUser.id} existingNotes={selectedUser.admin_notes} />
            </div>

            {/* ── ACTION BUTTONS ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Pending choreo → approve from drawer */}
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

              {/* Approved choreographer → revoke */}
              {selectedUser.role === 'choreographer' && selectedUser.choreographer_approved && !selectedUser.suspended && (
                <button onClick={() => initiateRevoke(selectedUser)}
                  style={{ width: '100%', background: '#fff0e6', border: '1px solid #e8a020', color: '#c8430a', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  ⚠️ Revoke Choreographer Status
                </button>
              )}

              {/* Suspend — any active user */}
              {!selectedUser.suspended && (
                <button onClick={() => initiateSuspend(selectedUser)}
                  style={{ width: '100%', background: '#fff0f0', border: '1px solid #ffcccc', color: '#cc0000', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  🚫 Suspend Account
                </button>
              )}

              {/* Reinstate suspended user */}
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

        {/* Active sessions warning */}
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

        {/* Reason input */}
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
const TIME_SLOTS_ADMIN = [
  '06:00','06:30','07:00','07:30','08:00','08:30','09:00','09:30',
  '10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30',
  '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30',
  '18:00','18:30','19:00','19:30','20:00','20:30','21:00','21:30','22:00','22:30',
]
function fmtTimeAdmin(t) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${h % 12 || 12}:${m.toString().padStart(2,'0')} ${ampm}`
}

function AdminSessionEditModal({ session, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: session.title || '',
    description: session.description || '',
    date: session.scheduled_at ? new Date(session.scheduled_at).toISOString().split('T')[0] : '',
    time: session.scheduled_at ? (() => {
      const d = new Date(session.scheduled_at)
      return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes() < 30 ? '00' : '30'}`
    })() : '',
    duration: session.duration_minutes || 60,
    price: session.price_tiers?.[0]?.price || 0,
    max_seats: session.max_seats || 20,
    min_seats: session.min_seats || 5,
    status: session.status || 'open',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const inputStyle = { width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box', color: '#0f0c0c' }
  const labelStyle = { fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }

  async function handleSave() {
    if (!form.title || !form.date || !form.time) { alert('Title, date and time required'); return }
    setSaving(true)
    const scheduledAt = new Date(`${form.date}T${form.time}:00`).toISOString()
    const { error } = await supabase.from('sessions').update({
      title: form.title,
      description: form.description,
      scheduled_at: scheduledAt,
      duration_minutes: form.duration,
      price_tiers: [{ seats: form.max_seats, price: form.price }],
      max_seats: form.max_seats,
      min_seats: form.min_seats,
      status: form.status,
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
              <select style={inputStyle} value={form.time} onChange={e => set('time', e.target.value)}>
                {TIME_SLOTS_ADMIN.map(t => <option key={t} value={t}>{fmtTimeAdmin(t)}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Duration</label>
              <select style={inputStyle} value={form.duration} onChange={e => set('duration', +e.target.value)}>
                {[45,60,75,90,120].map(d => <option key={d} value={d}>{d}m</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Price ₹</label>
              <input style={inputStyle} type="number" value={form.price} onChange={e => set('price', +e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Max Seats</label>
              <input style={inputStyle} type="number" value={form.max_seats} onChange={e => set('max_seats', +e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Min Seats</label>
              <input style={inputStyle} type="number" value={form.min_seats} onChange={e => set('min_seats', +e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select style={inputStyle} value={form.status} onChange={e => set('status', e.target.value)}>
              {['draft','open','confirmed','full','cancelled','completed'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={handleSave} disabled={saving} style={{ width: '100%', background: '#c8430a', color: 'white', border: 'none', borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes →'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ── PlatformSettingsTab ────────────────────────────────────────
// Drop this as a component at the bottom of AdminPage.jsx
// Then add to the tabs bar and render in the content section

function PlatformSettingsTab({ onConfigSaved }) {
  const [config, setConfig] = useState(null)
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
      setConfig(data)
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
    outline: 'none', boxSizing: 'border-box', color: '#0f0c0c',
    textAlign: 'center',
  }
  const labelStyle = { fontSize: 12, color: '#7a6e65', fontWeight: 600, marginBottom: 6, display: 'block' }
  const sectionStyle = {
    background: 'white', borderRadius: 16, padding: 28,
    border: '1px solid #e2dbd4', marginBottom: 20,
  }

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

      {/* PRE-JOIN */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 20 }}>🚪</span>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f0c0c' }}>Early Entry</div>
        </div>
        <p style={{ fontSize: 13, color: '#7a6e65', marginBottom: 20, lineHeight: 1.5 }}>
          How many minutes before the scheduled start time can each role enter the classroom.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <label style={labelStyle}>🎭 Choreographer (host)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number" min="0" max="120"
                value={form.host_pre_join_minutes}
                onChange={e => set('host_pre_join_minutes', e.target.value)}
                style={inputStyle}
              />
              <span style={{ fontSize: 13, color: '#7a6e65', whiteSpace: 'nowrap' }}>mins early</span>
            </div>
          </div>
          <div>
            <label style={labelStyle}>💃 Learner (guest)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number" min="0" max="60"
                value={form.guest_pre_join_minutes}
                onChange={e => set('guest_pre_join_minutes', e.target.value)}
                style={inputStyle}
              />
              <span style={{ fontSize: 13, color: '#7a6e65', whiteSpace: 'nowrap' }}>mins early</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', background: '#faf7f2', borderRadius: 8, fontSize: 12, color: '#7a6e65' }}>
          Example: If class starts at <strong>5:00 PM</strong> and host early entry is <strong>{form.host_pre_join_minutes} mins</strong>,
          the choreographer can enter from <strong>{formatExampleTime(17 * 60, -form.host_pre_join_minutes)}</strong>.
          Learners can enter from <strong>{formatExampleTime(17 * 60, -form.guest_pre_join_minutes)}</strong>.
        </div>
      </div>

      {/* GRACE PERIOD */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 20 }}>⏱️</span>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f0c0c' }}>Grace Period After Session Ends</div>
        </div>
        <p style={{ fontSize: 13, color: '#7a6e65', marginBottom: 20, lineHeight: 1.5 }}>
          How many minutes after the scheduled end time the classroom token stays valid.
          Tokens expire hard at this point — no re-entry possible after.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <label style={labelStyle}>🎭 Choreographer (host)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number" min="0" max="120"
                value={form.host_grace_minutes}
                onChange={e => set('host_grace_minutes', e.target.value)}
                style={inputStyle}
              />
              <span style={{ fontSize: 13, color: '#7a6e65', whiteSpace: 'nowrap' }}>mins grace</span>
            </div>
          </div>
          <div>
            <label style={labelStyle}>💃 Learner (guest)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number" min="0" max="60"
                value={form.guest_grace_minutes}
                onChange={e => set('guest_grace_minutes', e.target.value)}
                style={inputStyle}
              />
              <span style={{ fontSize: 13, color: '#7a6e65', whiteSpace: 'nowrap' }}>mins grace</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', background: '#faf7f2', borderRadius: 8, fontSize: 12, color: '#7a6e65' }}>
          Example: For a <strong>60-min class starting 5:00 PM</strong>, it ends at 6:00 PM.
          Learner tokens expire at <strong>{formatExampleTime(18 * 60, form.guest_grace_minutes)}</strong>.
          Host token expires at <strong>{formatExampleTime(18 * 60, form.host_grace_minutes)}</strong>.
        </div>
      </div>

      {/* SAVE */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: saved ? '#1a7a3c' : '#c8430a',
            color: 'white', border: 'none', borderRadius: 10,
            padding: '13px 32px', fontSize: 15, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1, transition: 'background 0.3s',
          }}
        >
          {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saved && (
          <span style={{ fontSize: 13, color: '#1a7a3c', fontWeight: 600 }}>
            Changes will apply to all new token requests immediately.
          </span>
        )}
      </div>

    </div>
  )
}

function formatExampleTime(baseMinutes, offsetMinutes) {
  const total = baseMinutes + offsetMinutes
  const h = Math.floor(((total % (24 * 60)) + 24 * 60) % (24 * 60) / 60)
  const m = ((total % 60) + 60) % 60
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 || 12
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}