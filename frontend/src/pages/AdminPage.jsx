import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import ImageCropUploader from '../components/ImageCropUploader'

export default function AdminPage({ user, onLogout, onConfigChange }) {
  const [tab, setTab] = useState('applications')
  const [applications, setApplications] = useState([])
  const [users, setUsers] = useState([])
  const [sessions, setSessions] = useState([])
  const [allBookings, setAllBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const since60d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const [appsRes, usersRes, sessionsRes, waitlistRes, bookingsRes] = await Promise.all([
      supabase.from('profiles_with_email').select('*')
        .eq('role', 'choreographer').eq('choreographer_approved', false)
        .order('choreographer_requested_at', { ascending: false }),
      supabase.from('profiles_with_email').select('*')
        .order('auth_created_at', { ascending: false }),
      supabase.from('sessions').select('*, profiles(full_name, avatar_url)')
        .order('scheduled_at', { ascending: false }),
      supabase.from('waitlist').select('session_id'),
      supabase.from('bookings')
        .select('id, status, credits_paid, razorpay_payment_id, razorpay_order_id, created_at, confirmation_email_sent_at, reminder_email_sent_at, join_link_sent_at, joined_at, left_at, booked_by, session_id, admin_resolved_at, profiles!booked_by(full_name), sessions(id, title, scheduled_at, status)')
        .gt('created_at', since60d)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false }),
    ])
    setApplications(appsRes.data || [])
    setUsers(usersRes.data || [])
    setSessions(sessionsRes.data || [])
    console.log('[fetchAll] bookingsRes data count:', bookingsRes.data?.length,
      'error:', bookingsRes.error?.message,
      'sample:', bookingsRes.data?.[0])
    setAllBookings(bookingsRes.data || [])
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
          <button style={tabStyle('bookings')} onClick={() => setTab('bookings')}>📊 Bookings</button>
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

        {/* BOOKINGS TAB */}
        {tab === 'bookings' && (
          <BookingsTab
            allBookings={allBookings}
            users={users}
            onRefresh={fetchAll}
          />
        )}

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

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, color: '#e8a020', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>⚡ Admin Override</div>
              <AdminAvatarUploader
                userId={selectedUser.id}
                avatarUrl={selectedUser.avatar_url}
                onUpdate={(url) => setSelectedUser(s => ({ ...s, avatar_url: url }))}
              />
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

// ── AdminAvatarUploader ────────────────────────────────────────
function AdminAvatarUploader({ userId, avatarUrl, onUpdate }) {
  const [path] = useState(() => `${userId}/avatar_${Date.now()}.jpg`)
  return (
    <ImageCropUploader
      bucket="avatars"
      path={path}
      aspectRatio={1}
      currentUrl={avatarUrl}
      allowCropAdjust={true}
      label="Profile Photo"
      onUploadComplete={async (url) => {
        await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
        onUpdate(url)
      }}
    />
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
    choreo_reference_url: session.choreo_reference_url || '',
    cover_photo_url: session.cover_photo_url || '',
    cover_photo_focal_x: session.cover_photo_focal_x ?? 50,
    cover_photo_focal_y: session.cover_photo_focal_y ?? 50,
    card_thumbnail_url: session.card_thumbnail_url || '',
    card_thumbnail_focal_x: session.card_thumbnail_focal_x ?? 50,
    card_thumbnail_focal_y: session.card_thumbnail_focal_y ?? 50,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const [coverPath] = useState(() => `hero/${session.id}_${Date.now()}.jpg`)
  const [thumbnailPath] = useState(() => `card/${session.id}_${Date.now()}.jpg`)

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
      choreo_reference_url: form.choreo_reference_url.trim() || null,
      cover_photo_url: form.cover_photo_url.trim() || null,
      cover_photo_focal_x: form.cover_photo_url.trim() ? form.cover_photo_focal_x : null,
      cover_photo_focal_y: form.cover_photo_url.trim() ? form.cover_photo_focal_y : null,
      card_thumbnail_url: form.card_thumbnail_url.trim() || null,
      card_thumbnail_focal_x: form.card_thumbnail_url.trim() ? form.card_thumbnail_focal_x : null,
      card_thumbnail_focal_y: form.card_thumbnail_url.trim() ? form.card_thumbnail_focal_y : null,
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

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#e8a020', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>⚡ Admin Override</div>
          <ImageCropUploader
            bucket="session-covers"
            path={coverPath}
            aspectRatio={4 / 5}
            currentUrl={form.cover_photo_url}
            allowCropAdjust={true}
            label="Session Cover Photo (4:5)"
            onUploadComplete={(url, fx, fy) => {
              set('cover_photo_url', url)
              set('cover_photo_focal_x', fx ?? 50)
              set('cover_photo_focal_y', fy ?? 50)
            }}
          />
        </div>

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

        {/* Choreo reference URL */}
        <div>
          <label style={labelStyle}>Choreography Reference Link (optional)</label>
          <input style={inputStyle} value={form.choreo_reference_url}
            onChange={e => set('choreo_reference_url', e.target.value)}
            placeholder="Instagram reel, YouTube video, or any link showing the dance..." />
        </div>

        {/* Card thumbnail uploader */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, color: '#e8a020', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>⚡ Admin Override</div>
          <ImageCropUploader
            bucket="session-covers"
            path={thumbnailPath}
            aspectRatio={16 / 9}
            currentUrl={form.card_thumbnail_url}
            allowCropAdjust={true}
            label="Card Thumbnail (16:9)"
            onUploadComplete={(url, fx, fy) => {
              set('card_thumbnail_url', url)
              set('card_thumbnail_focal_x', fx ?? 50)
              set('card_thumbnail_focal_y', fy ?? 50)
            }}
          />
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

// ── RowActionsDropdown ─────────────────────────────────────────
function RowActionsDropdown({ booking, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (btnRef.current && !btnRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function callEdge(fnName, body) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(body) }
    )
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || res.statusText) }
    return res.json()
  }

  async function doAction(key) {
    setOpen(false)
    setSending(key)
    try {
      if (key === 'confirm') {
        await callEdge('send-booking-confirmation', { booking_id: booking.id })
      } else if (key === 'joinlink') {
        await callEdge('send-join-links', { session_id: booking.session_id, single_user_email: booking.email })
      } else if (key === 'reminder') {
        await callEdge('send-reminders', { session_id: booking.session_id, single_user_email: booking.email })
      } else if (key === 'resolve') {
        await supabase.from('bookings').update({ admin_resolved_at: new Date().toISOString() }).eq('id', booking.id)
      } else if (key === 'unresolve') {
        await supabase.from('bookings').update({ admin_resolved_at: null }).eq('id', booking.id)
      }
      onRefresh()
    } catch (e) { alert(e.message) }
    setSending(null)
  }

  const isResolved = !!booking.admin_resolved_at
  const actions = [
    { key: 'confirm',   label: '✉️ Send Confirmation Email', disabled: !!booking.confirmation_email_sent_at },
    { key: 'joinlink',  label: '🔗 Send Join Link',          disabled: !!booking.join_link_sent_at },
    { key: 'reminder',  label: '🔔 Send 24h Reminder',       disabled: !!booking.reminder_email_sent_at },
    { key: isResolved ? 'unresolve' : 'resolve', label: isResolved ? '↩️ Unmark Resolved' : '✅ Mark Resolved', disabled: false },
  ]

  return (
    <div ref={btnRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={!!sending}
        style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer', color: '#5a4e47', whiteSpace: 'nowrap' }}
      >
        {sending ? '⏳' : '⚡'} Actions ▾
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'white', border: '1px solid #e2dbd4', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 220, overflow: 'hidden' }}>
          {actions.map(a => (
            <button
              key={a.key}
              onClick={() => doAction(a.key)}
              disabled={a.disabled}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 13, background: 'white', border: 'none', cursor: a.disabled ? 'not-allowed' : 'pointer', color: a.disabled ? '#c0b8b2' : '#0f0c0c', fontWeight: 500 }}
              onMouseEnter={e => { if (!a.disabled) e.currentTarget.style.background = '#faf7f2' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white' }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── SessionActionsDropdown ─────────────────────────────────────
function SessionActionsDropdown({ sid, group, onRefresh, onAnnouncement }) {
  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState(null) // { label, current, total }
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (btnRef.current && !btnRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function callEdge(fnName, body) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(body) }
    )
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || res.statusText) }
    return res.json()
  }

  async function doConfirmAll() {
    setOpen(false)
    const pending = group.bookings.filter(b => !b.confirmation_email_sent_at)
    if (pending.length === 0) { alert('All confirmation emails already sent.'); return }
    for (let i = 0; i < pending.length; i++) {
      setProgress({ label: 'Sending confirmations', current: i + 1, total: pending.length })
      try { await callEdge('send-booking-confirmation', { booking_id: pending[i].id }) }
      catch (e) { console.error('Confirm email failed for', pending[i].id, e) }
    }
    setProgress(null)
    onRefresh()
  }

  async function doJoinLinksAll() {
    setOpen(false)
    setProgress({ label: 'Sending join links', current: 1, total: 1 })
    try { await callEdge('send-join-links', { session_id: sid }) }
    catch (e) { alert(e.message) }
    setProgress(null)
    onRefresh()
  }

  async function doReminderAll() {
    setOpen(false)
    setProgress({ label: 'Sending reminders', current: 1, total: 1 })
    try { await callEdge('send-reminders', { session_id: sid }) }
    catch (e) { alert(e.message) }
    setProgress(null)
    onRefresh()
  }

  const busy = !!progress
  const items = [
    { label: '✉️ Send Confirmation to All', action: doConfirmAll },
    { label: '🔗 Send Join Links to All',   action: doJoinLinksAll },
    { label: '🔔 Send 24h Reminder to All', action: doReminderAll },
    { label: '📢 Send Custom Announcement', action: () => { setOpen(false); onAnnouncement(sid, group.session_title, group.bookings) } },
  ]

  return (
    <div ref={btnRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => { if (!busy) setOpen(o => !o) }}
        disabled={busy}
        style={{ background: busy ? '#a09890' : '#0f0c0c', color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
      >
        {busy ? `${progress.label} ${progress.current}/${progress.total}...` : '⚡ Session Actions ▾'}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'white', border: '1px solid #e2dbd4', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 240, overflow: 'hidden' }}>
          {items.map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 13, background: 'white', border: 'none', cursor: 'pointer', color: '#0f0c0c', fontWeight: 500 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#faf7f2' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white' }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AnnouncementModal ─────────────────────────────────────────
function AnnouncementModal({ sessionData, onClose, onRefresh }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  if (!sessionData) return null
  const recipientCount = sessionData.bookings.length

  async function handleSend() {
    if (!subject.trim() || !message.trim()) { alert('Subject and message are required.'); return }
    if (!window.confirm(`Send announcement to ${recipientCount} learner(s)?`)) return
    setSending(true)
    setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-announcement`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ session_id: sessionData.sid, subject: subject.trim(), message: message.trim() }) }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      setResult(data)
      if (onRefresh) onRefresh()
    } catch (e) { alert(e.message) }
    setSending(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 32, width: '100%', maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif', margin: 0 }}>📢 Custom Announcement</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#7a6e65' }}>×</button>
        </div>
        <div style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#7a6e65', marginBottom: 20 }}>
          📦 <strong style={{ color: '#0f0c0c' }}>{sessionData.title}</strong> — {recipientCount} recipient{recipientCount !== 1 ? 's' : ''}
        </div>
        {result ? (
          <div>
            <div style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a7a3c', marginBottom: 6 }}>Sent!</div>
              <div style={{ fontSize: 14, color: '#5a4e47' }}>{result.sent} sent{result.failed > 0 ? `, ${result.failed} failed` : ''}</div>
            </div>
            <button onClick={onClose} style={{ width: '100%', background: '#0f0c0c', color: 'white', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Close</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Important update about your class" style={{ width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box', color: '#0f0c0c' }} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>Message</label>
              <textarea value={message} onChange={e => setMessage(e.target.value.slice(0, 500))} placeholder="Write your message here..." rows={6} style={{ width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box', color: '#0f0c0c', resize: 'vertical', lineHeight: 1.5 }} />
              <div style={{ fontSize: 12, color: '#a09890', textAlign: 'right' }}>{message.length}/500</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid #e2dbd4', color: '#7a6e65', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Cancel</button>
              <button onClick={handleSend} disabled={sending} style={{ flex: 2, background: sending ? '#a09890' : '#c8430a', color: 'white', padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer', border: 'none' }}>
                {sending ? '⏳ Sending...' : `📢 Send to ${recipientCount} learner${recipientCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── BookingsTab ────────────────────────────────────────────────
function BookingsTab({ allBookings, users, onRefresh }) {
  const [expandedSessions, setExpandedSessions] = useState({})
  const [filterStatus, setFilterStatus] = useState('active')
  // 'active' = open+confirmed+completed, 'all' = everything, 'cancelled' = cancelled only
  const [filterSearch, setFilterSearch] = useState('')
  const [filterDays, setFilterDays] = useState(60)
  // 60, 30, 7, 1 (today only)
  const [filterResolved, setFilterResolved] = useState('hide_resolved')
  // 'hide_resolved' | 'show_all' | 'resolved_only'
  const [announcementData, setAnnouncementData] = useState(null) // { sid, title, bookings }

  const now = Date.now()
  const FIVE_MINS = 5 * 60 * 1000

  // Flatten bookings with email from users state
  const enriched = allBookings.map(b => ({
    ...b,
    full_name: b.profiles?.full_name,
    email: users.find(u => u.id === b.booked_by)?.email || '',
    session_title: b.sessions?.title || '',
    scheduled_at: b.sessions?.scheduled_at || '',
    session_status: b.sessions?.status || '',
  }))
  console.log('[BookingsTab] enriched count:', enriched.length,
    'sample created_at:', enriched[0]?.created_at,
    'todayStart UTC:', (() => {
      const n = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
      const d = new Date(n); d.setUTCHours(0,0,0,0); d.setTime(d.getTime() - 5.5*60*60*1000)
      return d.toISOString()
    })())

  // Issue detection
  function isConfirmEmailIssue(b) {
    if (b.confirmation_email_sent_at) return false
    if (!b.razorpay_payment_id) return false
    return new Date(b.created_at).getTime() < now - FIVE_MINS
  }
  function isManualRecovery(b) {
    return (b.razorpay_order_id || '').startsWith('manual_recovery_')
  }
  const allIssues = enriched.filter(b => isConfirmEmailIssue(b) || isManualRecovery(b))
  const issues = allIssues.filter(b => {
    if (filterResolved === 'hide_resolved') return !b.admin_resolved_at
    if (filterResolved === 'resolved_only') return !!b.admin_resolved_at
    return true
  })

  // Period stats (filterDays-aware, IST-correct for today)
  let periodStart
  if (filterDays === 1) {
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
    periodStart = new Date(nowIST)
    periodStart.setUTCHours(0, 0, 0, 0)
    periodStart.setTime(periodStart.getTime() - 5.5 * 60 * 60 * 1000)
  } else {
    periodStart = new Date(Date.now() - filterDays * 24 * 60 * 60 * 1000)
  }
  const todayBookings = enriched.filter(b => new Date(b.created_at) >= periodStart)
  console.log('[BookingsTab] todayBookings count:', todayBookings.length)
  const todayRevenue = todayBookings.reduce((s, b) => s + (b.credits_paid || 0), 0)
  const pendingEmails = enriched.filter(b => isConfirmEmailIssue(b)).length

  const periodLabel = filterDays === 1 ? 'bookings today'
    : filterDays === 7 ? 'bookings this week'
    : filterDays === 30 ? 'bookings last 30d'
    : 'bookings last 60d'
  const revenuePeriodLabel = filterDays === 1 ? 'revenue today'
    : filterDays === 7 ? 'revenue this week'
    : filterDays === 30 ? 'revenue last 30d'
    : 'revenue last 60d'

  // Group by session
  const bySession = {}
  enriched.forEach(b => {
    const sid = b.session_id
    if (!bySession[sid]) bySession[sid] = { session_title: b.session_title, scheduled_at: b.scheduled_at, session_status: b.session_status, bookings: [] }
    bySession[sid].bookings.push(b)
  })
  const sessionGroups = Object.entries(bySession)
    .filter(([, group]) => {
      if (filterStatus === 'active') return ['open', 'confirmed', 'completed'].includes(group.session_status)
      if (filterStatus === 'cancelled') return group.session_status === 'cancelled'
      return true // 'all'
    })
    .filter(([, group]) => !filterSearch || group.session_title.toLowerCase().includes(filterSearch.toLowerCase()))
    .sort(([, a], [, b]) => new Date(b.scheduled_at) - new Date(a.scheduled_at))

  function toggleSession(sid) {
    setExpandedSessions(s => ({ ...s, [sid]: !s[sid] }))
  }

  function isExpanded(sid) {
    if (sid in expandedSessions) return expandedSessions[sid]
    // Default: expand if has issues
    const group = bySession[sid]
    return group?.bookings.some(b => isConfirmEmailIssue(b) || isManualRecovery(b)) || false
  }

  function formatISTShort(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
    })
  }

  function cellStatus(ts, label) {
    return ts
      ? <span title={formatISTShort(ts)} style={{ color: '#1a7a3c', cursor: 'default' }}>✅</span>
      : <span style={{ color: '#a09890' }}>—</span>
  }

  function confEmailCell(b) {
    if (b.confirmation_email_sent_at) return <span title={formatISTShort(b.confirmation_email_sent_at)} style={{ color: '#1a7a3c', cursor: 'default' }}>✅</span>
    if (isConfirmEmailIssue(b)) return <span style={{ color: '#c8430a', fontWeight: 700 }}>⚠️</span>
    return <span style={{ color: '#a09890' }}>—</span>
  }

  function reminderCell(b) {
    if (b.reminder_email_sent_at) return <span title={formatISTShort(b.reminder_email_sent_at)} style={{ color: '#1a7a3c', cursor: 'default' }}>✅</span>
    const sessionMs = new Date(b.scheduled_at).getTime()
    if (now < sessionMs - 25 * 60 * 60 * 1000) return <span style={{ color: '#a09890' }}>—</span>
    if (!b.reminder_email_sent_at && now >= sessionMs - 24 * 60 * 60 * 1000) return <span style={{ color: '#c8430a', fontWeight: 700 }}>⚠️</span>
    return <span style={{ color: '#a09890' }}>—</span>
  }

  function joinLinkCell(b) {
    if (b.join_link_sent_at) return <span title={formatISTShort(b.join_link_sent_at)} style={{ color: '#1a7a3c', cursor: 'default' }}>✅</span>
    const sessionMs = new Date(b.scheduled_at).getTime()
    if (now < sessionMs - 30 * 60 * 1000) return <span style={{ color: '#a09890' }}>—</span>
    if (!b.join_link_sent_at && now >= sessionMs) return <span style={{ color: '#c8430a', fontWeight: 700 }}>⚠️</span>
    return <span style={{ color: '#a09890' }}>—</span>
  }

  function joinedCell(b) {
    if (b.joined_at) return <span title={formatISTShort(b.joined_at)} style={{ color: '#1a7a3c', cursor: 'default' }}>✅ {formatISTShort(b.joined_at)}</span>
    const sessionMs = new Date(b.scheduled_at).getTime()
    const durationMs = 60 * 60 * 1000 // assume 60min fallback
    if (now > sessionMs + durationMs && !b.joined_at) return <span style={{ color: '#7a6e65', fontStyle: 'italic' }}>✗ No show</span>
    if (now < sessionMs) return <span style={{ color: '#a09890' }}>—</span>
    return <span style={{ color: '#a09890' }}>—</span>
  }

  function paidCell(b) {
    if (isManualRecovery(b)) return <span style={{ color: '#e8a020', fontWeight: 700, fontSize: 12 }}>🔧 Manual</span>
    if (b.razorpay_payment_id) return <span title={b.razorpay_payment_id} style={{ color: '#1a7a3c', cursor: 'default' }}>✅</span>
    return <span style={{ color: '#a09890' }}>—</span>
  }

  function rowHasIssue(b) {
    return isConfirmEmailIssue(b) || isManualRecovery(b)
  }

  function downloadCSV(sessionId) {
    const group = bySession[sessionId]
    if (!group) return
    const rows = [
      ['Full Name', 'Email', 'Amount Paid (₹)', 'Payment ID', 'Order ID', 'Booking Time (IST)', 'Payment Type', 'Conf Email Sent', 'Reminder Sent', 'Join Link Sent', 'Joined Class', 'Time Joined (IST)', 'Notes']
    ]
    group.bookings.forEach(b => {
      const userEmail = users.find(u => u.id === b.booked_by)?.email || ''
      rows.push([
        b.profiles?.full_name || '',
        userEmail,
        b.credits_paid || '',
        b.razorpay_payment_id || '',
        b.razorpay_order_id || '',
        formatISTShort(b.created_at),
        isManualRecovery(b) ? 'Manual Recovery' : 'Razorpay',
        b.confirmation_email_sent_at ? formatISTShort(b.confirmation_email_sent_at) : '',
        b.reminder_email_sent_at ? formatISTShort(b.reminder_email_sent_at) : '',
        b.join_link_sent_at ? formatISTShort(b.join_link_sent_at) : '',
        b.joined_at ? 'Yes' : 'No',
        b.joined_at ? formatISTShort(b.joined_at) : '',
        '',
      ])
    })
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const safeName = (group.session_title || sessionId).replace(/[^a-zA-Z0-9 ]/g, '').replace(/ /g, '_')
    const dateStr = new Date(group.scheduled_at).toISOString().slice(0, 10)
    const filename = `${safeName}_${dateStr}_bookings.csv`
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const statPillStyle = { background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 20, padding: '6px 16px', fontSize: 13, fontWeight: 600, color: '#0f0c0c' }
  const thStyle = { padding: '8px 10px', fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'left', whiteSpace: 'nowrap' }
  const tdStyle = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f0ebe6', verticalAlign: 'middle' }

  return (
    <div style={{ marginTop: 24 }}>

      {/* SECTION 1 — Attention Banner */}
      {issues.length > 0 && (
        <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#cc0000', marginBottom: 12 }}>
            ⚠️ {issues.length} booking{issues.length > 1 ? 's' : ''} need attention
          </div>
          {issues.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #ffcccc', gap: 12 }}>
              <div style={{ fontSize: 13, color: '#0f0c0c', flex: 1 }}>
                {isManualRecovery(b) ? '🔧 ' : '✉️ '}
                <strong>{b.email || b.full_name}</strong> — {b.session_title}
                {isConfirmEmailIssue(b) && !isManualRecovery(b) && (
                  <span style={{ color: '#7a6e65', marginLeft: 6 }}>— confirmation email not sent</span>
                )}
              </div>
              <RowActionsDropdown booking={b} onRefresh={onRefresh} />
            </div>
          ))}
        </div>
      )}

      {/* FILTER BAR */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input
          placeholder="Search sessions..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: 200, outline: 'none' }}
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }}
        >
          <option value="active">Active sessions</option>
          <option value="all">All sessions</option>
          <option value="cancelled">Cancelled only</option>
        </select>
        <select
          value={filterDays}
          onChange={e => setFilterDays(Number(e.target.value))}
          style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }}
        >
          <option value={1}>Today</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
        </select>
        <select
          value={filterResolved}
          onChange={e => setFilterResolved(e.target.value)}
          style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }}
        >
          <option value="hide_resolved">Hide resolved</option>
          <option value="show_all">Show all</option>
          <option value="resolved_only">Resolved only</option>
        </select>
      </div>

      {/* SECTION 2 — Today's Summary */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <span style={statPillStyle}>📦 {todayBookings.length} {periodLabel}</span>
        <span style={statPillStyle}>₹{todayRevenue} {revenuePeriodLabel}</span>
        <span style={{ ...statPillStyle, background: pendingEmails > 0 ? '#fff8e6' : undefined, borderColor: pendingEmails > 0 ? '#e8a020' : undefined, color: pendingEmails > 0 ? '#c8430a' : '#a09890' }}>
          ✉️ {pendingEmails} emails pending
        </span>
        <span style={{ ...statPillStyle, background: allIssues.length > 0 ? '#fff0f0' : undefined, borderColor: allIssues.length > 0 ? '#ffcccc' : undefined, color: allIssues.length > 0 ? '#cc0000' : '#a09890' }}>
          ⚠️ {allIssues.length} issues
        </span>
      </div>

      {/* SECTION 3 — Session Cards */}
      {sessionGroups.length === 0 && (
        <div style={{ textAlign: 'center', color: '#a09890', padding: 40 }}>No bookings in the last 60 days</div>
      )}
      {sessionGroups.map(([sid, group]) => {
        const groupIssues = group.bookings.filter(b => rowHasIssue(b))
        const groupRevenue = group.bookings.reduce((s, b) => s + (b.credits_paid || 0), 0)
        const expanded = isExpanded(sid)
        const visibleBookings = group.bookings.filter(b => {
          if (filterResolved === 'hide_resolved') return !b.admin_resolved_at
          if (filterResolved === 'resolved_only') return !!b.admin_resolved_at
          return true
        })
        return (
          <div key={sid} style={{ background: 'white', border: '1px solid #e2dbd4', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
            {/* Card header */}
            <div
              onClick={() => toggleSession(sid)}
              style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', cursor: 'pointer', gap: 12, borderBottom: expanded ? '1px solid #f0ebe6' : 'none' }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#0f0c0c' }}>{group.session_title}</span>
                  <span style={{ fontSize: 12, color: '#7a6e65' }}>
                    {new Date(group.scheduled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase',
                    background: group.session_status === 'confirmed' ? '#e6f4ec' : group.session_status === 'open' ? '#fff8e6' : '#f0ebe6',
                    color: group.session_status === 'confirmed' ? '#1a7a3c' : group.session_status === 'open' ? '#e8a020' : '#7a6e65',
                  }}>{group.session_status}</span>
                </div>
                <div style={{ fontSize: 12, color: '#7a6e65', marginTop: 4 }}>
                  {group.bookings.length} bookings · ₹{groupRevenue} revenue
                  {groupIssues.length > 0 && (
                    <span style={{ marginLeft: 8, background: '#fff8e6', color: '#c8430a', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                      ⚠️ {groupIssues.length} issues
                    </span>
                  )}
                </div>
              </div>
              <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <SessionActionsDropdown
                  sid={sid}
                  group={group}
                  onRefresh={onRefresh}
                  onAnnouncement={(s, title, bookings) => setAnnouncementData({ sid: s, title, bookings })}
                />
                <button
                  onClick={e => { e.stopPropagation(); downloadCSV(sid) }}
                  style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#5a4e47', whiteSpace: 'nowrap' }}
                >
                  📥 CSV
                </button>
              </div>
              <span style={{ fontSize: 18, color: '#a09890' }}>{expanded ? '▾' : '▸'}</span>
            </div>

            {/* Card body */}
            {expanded && (
              <div style={{ overflowX: 'auto' }}>
                {visibleBookings.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#a09890', fontSize: 13 }}>No bookings match the current filter.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#faf7f2' }}>
                        <th style={thStyle}>Name</th>
                        <th style={thStyle}>Email</th>
                        <th style={thStyle}>Paid</th>
                        <th style={thStyle}>Conf Email</th>
                        <th style={thStyle}>Reminder</th>
                        <th style={thStyle}>Join Link</th>
                        <th style={thStyle}>Joined</th>
                        <th style={thStyle}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleBookings.map(b => {
                        const hasIssue = rowHasIssue(b)
                        const isResolved = !!b.admin_resolved_at
                        const didJoin = !!b.joined_at
                        const rowBg = isResolved ? '#f0faf4' : hasIssue ? '#fff8f5' : didJoin ? '#f0f8f0' : 'white'
                        const borderLeft = hasIssue && !isResolved ? '3px solid #c8430a' : 'none'
                        return (
                          <tr key={b.id} style={{ background: rowBg, borderLeft }}>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>
                              {b.full_name || '—'}
                              {isResolved && <span style={{ marginLeft: 6, fontSize: 11, color: '#1a7a3c', fontWeight: 400 }}>✓ resolved</span>}
                            </td>
                            <td style={{ ...tdStyle, color: '#5a4e47' }}>{b.email}</td>
                            <td style={tdStyle}>{paidCell(b)}</td>
                            <td style={tdStyle}>{confEmailCell(b)}</td>
                            <td style={tdStyle}>{reminderCell(b)}</td>
                            <td style={tdStyle}>{joinLinkCell(b)}</td>
                            <td style={{ ...tdStyle, fontSize: 12 }}>{joinedCell(b)}</td>
                            <td style={tdStyle}>
                              <RowActionsDropdown booking={b} onRefresh={onRefresh} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* ANNOUNCEMENT MODAL */}
      <AnnouncementModal
        sessionData={announcementData}
        onClose={() => setAnnouncementData(null)}
        onRefresh={onRefresh}
      />
    </div>
  )
}
