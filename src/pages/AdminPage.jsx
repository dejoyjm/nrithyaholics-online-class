import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AdminPage({ user, onLogout }) {
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
      supabase.from('profiles_with_email').select('*').eq('role', 'choreographer').eq('choreographer_approved', false).order('choreographer_requested_at', { ascending: false }),
      supabase.from('profiles_with_email').select('*').order('auth_created_at', { ascending: false }),
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

  async function initiateRevoke(user) {
    const { data: activeSessions } = await supabase
      .from('sessions')
      .select('id, title, scheduled_at, max_seats')
      .eq('choreographer_id', user.id)
      .in('status', ['open', 'confirmed', 'draft'])
    setConfirmAction({ type: 'revoke', user, sessions: activeSessions || [] })
  }

  async function initiateSuspend(user) {
    const { data: activeSessions } = await supabase
      .from('sessions')
      .select('id, title, scheduled_at')
      .eq('choreographer_id', user.id)
      .in('status', ['open', 'confirmed'])
    setConfirmAction({ type: 'suspend', user, sessions: activeSessions || [] })
  }

  async function revokeChoreographer(profileId, reason) {
    // 1. Get all sessions for this choreographer
    const { data: choreoSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('choreographer_id', profileId)
      .in('status', ['open', 'confirmed', 'draft'])

    const sessionIds = choreoSessions?.map(s => s.id) || []

    // 2. Cancel all bookings on those sessions
    if (sessionIds.length > 0) {
      await supabase.from('bookings')
        .update({
          status: 'cancelled',
          cancelled_reason: 'choreographer_revoked',
          cancelled_at: new Date().toISOString()
        })
        .in('session_id', sessionIds)

      // 3. Cancel all sessions
      await supabase.from('sessions')
        .update({ status: 'cancelled' })
        .in('id', sessionIds)
    }

    // 4. Revoke choreographer status
    const { error } = await supabase.from('profiles')
      .update({
        role: 'learner',
        choreographer_approved: false,
        admin_notes: reason
      })
      .eq('id', profileId)

    if (error) alert(error.message)
    else { fetchAll(); setSelectedUser(null); setConfirmAction(null) }
  }

  async function suspendUser(profileId, reason) {
    const { error } = await supabase.from('profiles')
      .update({
        suspended: true,
        suspension_reason: reason,
        suspended_at: new Date().toISOString()
      })
      .eq('id', profileId)
    if (error) alert(error.message)
    else { fetchAll(); setSelectedUser(null); setConfirmAction(null) }
  }

  async function reinstateUser(profileId) {
    const { error } = await supabase.from('profiles')
      .update({
        suspended: false,
        suspension_reason: null,
        suspended_at: null
      })
      .eq('id', profileId)
    if (error) alert(error.message)
    else { fetchAll(); setSelectedUser(null) }
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
              <div key={app.id} onClick={() => setSelectedUser(app)}
                style={{ padding: '24px', cursor: 'pointer', borderBottom: i < applications.length - 1 ? '1px solid #f0ebe6' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#c8430a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 700 }}>
                        {(app.full_name || app.email || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#0f0c0c' }}>{app.full_name || app.email || 'No name'}</div>
                        <div style={{ fontSize: 13, color: '#7a6e65' }}>{app.email} · Applied {formatDate(app.choreographer_requested_at)}</div>
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
                          <span key={tag} style={{ background: '#f0ebe6', color: '#5a4e47', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase' }}>{tag}</span>
                        ))}
                      </div>
                    )}
                    {app.bio && <p style={{ fontSize: 13, color: '#5a4e47', lineHeight: 1.6, maxWidth: 600 }}>{app.bio}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginLeft: 24 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => rejectChoreographer(app.id)} style={{ background: 'transparent', border: '1px solid #e2dbd4', color: '#7a6e65', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Reject</button>
                    <button onClick={() => approveChoreographer(app.id)} style={{ background: '#1a7a3c', border: 'none', color: 'white', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>✓ Approve</button>
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
                      <span style={{ background: u.role === 'choreographer' ? '#f0e8ff' : '#f0ebe6', color: u.role === 'choreographer' ? '#5b4fcf' : '#5a4e47', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase' }}>
                        {u.role || 'learner'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      {u.role === 'choreographer' && (
                        <span style={{ background: u.choreographer_approved ? '#e6f4ec' : '#fff8e6', color: u.choreographer_approved ? '#1a7a3c' : '#e8a020', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                          {u.choreographer_approved ? '✓ Approved' : '⏳ Pending'}
                        </span>
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
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47' }}>{s.profiles?.full_name || '—'}</td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47' }}>{formatDate(s.scheduled_at)}</td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#5a4e47' }}>{s.max_seats} seats</td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ background: s.status === 'confirmed' ? '#e6f4ec' : s.status === 'open' ? '#fff8e6' : '#f0ebe6', color: s.status === 'confirmed' ? '#1a7a3c' : s.status === 'open' ? '#e8a020' : '#7a6e65', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase' }}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* PROFILE DRAWER */}
      {selectedUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => setSelectedUser(null)}>
          <div style={{ background: 'white', width: '100%', maxWidth: 480, height: '100vh', overflowY: 'auto', padding: 36 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif' }}>User Profile</h2>
              <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#7a6e65' }}>×</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#c8430a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 26, fontWeight: 700 }}>
                {(selectedUser.full_name || selectedUser.email || '?')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 20, color: '#0f0c0c' }}>{selectedUser.full_name || '— no name —'}</div>
                <div style={{ fontSize: 13, color: '#7a6e65' }}>{selectedUser.email}</div>
              </div>
            </div>
            {[
              ['Role', selectedUser.role || 'learner'],
              ['Status', selectedUser.role === 'choreographer' ? (selectedUser.choreographer_approved ? '✓ Approved' : '⏳ Pending') : 'Active'],
              ['Instagram', selectedUser.instagram_handle ? `@${selectedUser.instagram_handle}` : '—'],
              ['Teaching Language', selectedUser.teaching_language || '—'],
              ['Applied', selectedUser.choreographer_requested_at ? formatDate(selectedUser.choreographer_requested_at) : '—'],
              ['Last Sign In', selectedUser.last_sign_in_at ? formatDate(selectedUser.last_sign_in_at) : '—'],
              ['Joined', formatDate(selectedUser.auth_created_at || selectedUser.created_at)],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0ebe6' }}>
                <span style={{ fontSize: 13, color: '#7a6e65' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f0c0c', textAlign: 'right', maxWidth: 280 }}>{value}</span>
              </div>
            ))}
            {selectedUser.style_tags?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Dance Styles</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selectedUser.style_tags.map(tag => (
                    <span key={tag} style={{ background: '#f0ebe6', color: '#5a4e47', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase' }}>{tag}</span>
                  ))}
                </div>
              </div>
            )}
            {selectedUser.bio && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Bio</div>
                <p style={{ fontSize: 14, color: '#3a3230', lineHeight: 1.6 }}>{selectedUser.bio}</p>
              </div>
            )}
            {selectedUser.sample_video_url && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Sample Video</div>
                <a href={selectedUser.sample_video_url} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: '#c8430a', textDecoration: 'none' }}>🎥 View Sample →</a>
              </div>
            )}
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Admin Notes</div>
              <AdminNotes userId={selectedUser.id} existingNotes={selectedUser.admin_notes} />
            </div>
            {/* ACTIONS */}
            <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Pending → approve/reject */}
              {selectedUser.role === 'choreographer' && !selectedUser.choreographer_approved && !selectedUser.suspended && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { rejectChoreographer(selectedUser.id); setSelectedUser(null) }}
                    style={{ flex: 1, background: 'transparent', border: '1px solid #e2dbd4', color: '#7a6e65', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                    Reject Application
                  </button>
                  <button onClick={() => { approveChoreographer(selectedUser.id); setSelectedUser(null) }}
                    style={{ flex: 2, background: '#1a7a3c', border: 'none', color: 'white', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                    ✓ Approve
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

              {/* Any active user → suspend */}
              {!selectedUser.suspended && (
                <button onClick={() => initiateSuspend(selectedUser)}
                  style={{ width: '100%', background: '#fff0f0', border: '1px solid #ffcccc', color: '#cc0000', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  🚫 Suspend Account
                </button>
              )}

              {/* Suspended → reinstate */}
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
      <textarea value={notes} onChange={e => { setNotes(e.target.value); setSaved(false) }}
        placeholder="Internal notes — not visible to user"
        style={{ width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '10px 14px', fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#0f0c0c', minHeight: 80, resize: 'vertical', lineHeight: 1.5 }} />
      <button onClick={saveNotes} disabled={saving} style={{ marginTop: 8, background: saved ? '#1a7a3c' : '#0f0c0c', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
        {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save Notes'}
      </button>
    </div>
  )
}

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