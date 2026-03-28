import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import ImageCropUploader from '../../components/ImageCropUploader'

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

// section = 'applications' | 'users'
export default function UsersTab({ section, applications, users, loading, onRefresh }) {
  const [selectedUser, setSelectedUser] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [drawerEditMode, setDrawerEditMode] = useState(false)
  const [drawerEditForm, setDrawerEditForm] = useState(null)
  const [usersSearch, setUsersSearch] = useState('')
  const [usersRoleFilter, setUsersRoleFilter] = useState('all')
  const [usersStatusFilter, setUsersStatusFilter] = useState('active')

  async function approveChoreographer(profileId) {
    const { error } = await supabase.from('profiles')
      .update({ choreographer_approved: true })
      .eq('id', profileId)
    if (error) alert(error.message)
    else onRefresh()
  }

  async function rejectChoreographer(profileId) {
    const { error } = await supabase.from('profiles')
      .update({ role: 'learner', choreographer_approved: false })
      .eq('id', profileId)
    if (error) alert(error.message)
    else onRefresh()
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
    else { onRefresh(); setSelectedUser(null); setConfirmAction(null) }
  }

  async function suspendUser(profileId, reason) {
    const { error } = await supabase.from('profiles')
      .update({ suspended: true, suspension_reason: reason, suspended_at: new Date().toISOString() })
      .eq('id', profileId)
    if (error) alert(error.message)
    else { onRefresh(); setSelectedUser(null); setConfirmAction(null) }
  }

  async function reinstateUser(profileId) {
    const { error } = await supabase.from('profiles')
      .update({ suspended: false, suspension_reason: null, suspended_at: null })
      .eq('id', profileId)
    if (error) alert(error.message)
    else { onRefresh(); setSelectedUser(null) }
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
      onRefresh()
      const { data } = await supabase.from('profiles_with_email').select('*').eq('id', profileId).single()
      setSelectedUser(data)
    }
  }

  function getUserStatus(u) {
    if (u.suspended) return { label: '🚫 Suspended', bg: '#fff0f0', color: '#cc0000' }
    if (!u.last_sign_in_at) return { label: 'Never logged in', bg: '#f5f5f5', color: '#a09890' }
    const daysSince = (Date.now() - new Date(u.last_sign_in_at)) / (1000 * 60 * 60 * 24)
    if (daysSince <= 30) return { label: 'Active', bg: '#e6f4ec', color: '#1a7a3c' }
    return { label: 'Inactive', bg: '#fff8e6', color: '#e8a020' }
  }

  // ── APPLICATIONS SECTION ──────────────────────────────────────
  if (section === 'applications') {
    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#7a6e65' }}>Loading...</div>
    if (applications.length === 0) return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', marginBottom: 8 }}>All caught up!</h3>
        <p style={{ color: '#7a6e65' }}>No pending choreographer applications</p>
      </div>
    )
    return (
      <>
        {applications.map((app, i) => (
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
        ))}
        {selectedUser && renderDrawer()}
        {confirmAction && renderConfirmDialog()}
      </>
    )
  }

  // ── USERS SECTION ─────────────────────────────────────────────
  const filteredUsers = users.filter(u => {
    const q = usersSearch.toLowerCase()
    if (q && !(u.full_name || '').toLowerCase().includes(q) && !(u.email || '').toLowerCase().includes(q)) return false
    if (usersRoleFilter === 'learner' && u.role !== 'learner') return false
    if (usersRoleFilter === 'choreographer' && u.role !== 'choreographer') return false
    if (usersRoleFilter === 'admin' && !u.is_admin) return false
    if (usersStatusFilter === 'suspended') return u.suspended
    if (usersStatusFilter === 'never') return !u.last_sign_in_at
    if (usersStatusFilter === 'active') {
      if (u.suspended || !u.last_sign_in_at) return false
      return (Date.now() - new Date(u.last_sign_in_at)) / (1000 * 60 * 60 * 24) <= 30
    }
    if (usersStatusFilter === 'inactive') {
      if (u.suspended || !u.last_sign_in_at) return false
      return (Date.now() - new Date(u.last_sign_in_at)) / (1000 * 60 * 60 * 24) > 30
    }
    return true
  })

  function downloadUsersCSV() {
    const rows = [['Name', 'Email', 'Phone', 'Role', 'Choreo Status', 'First Seen', 'Last Login', 'Status', 'Suspended']]
    filteredUsers.forEach(u => rows.push([
      u.full_name || '',
      u.email || '',
      u.phone || '',
      u.role || 'learner',
      u.role === 'choreographer' ? (u.choreographer_approved ? 'Approved' : 'Pending') : '—',
      formatDate(u.auth_created_at || u.created_at),
      u.last_sign_in_at ? formatDate(u.last_sign_in_at) : 'Never',
      getUserStatus(u).label,
      u.suspended ? 'Yes' : 'No',
    ]))
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'users.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function renderDrawer() {
    if (!selectedUser) return null
    return (
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
        onClick={() => { setSelectedUser(null); setDrawerEditMode(false); setDrawerEditForm(null) }}
      >
        <div
          style={{ background: 'white', width: '100%', maxWidth: 480, height: '100vh', overflowY: 'auto', padding: 36 }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif' }}>User Profile</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {!drawerEditMode && (
                <button
                  onClick={() => { setDrawerEditMode(true); setDrawerEditForm({ full_name: selectedUser.full_name || '', phone: selectedUser.phone || '', admin_notes: selectedUser.admin_notes || '' }) }}
                  style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#5a4e47' }}
                >
                  ✏️ Edit
                </button>
              )}
              <button onClick={() => { setSelectedUser(null); setDrawerEditMode(false); setDrawerEditForm(null) }} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#7a6e65' }}>×</button>
            </div>
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

          {/* EDIT MODE */}
          {drawerEditMode && drawerEditForm && (() => {
            const inputStyle = { width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box', color: '#0f0c0c' }
            const labelStyle = { fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }
            async function saveEdits() {
              const { error } = await supabase.from('profiles').update({
                full_name: drawerEditForm.full_name.trim() || null,
                phone: drawerEditForm.phone.trim() || null,
                admin_notes: drawerEditForm.admin_notes.trim() || null,
              }).eq('id', selectedUser.id)
              if (error) { alert(error.message); return }
              await onRefresh()
              const { data } = await supabase.from('profiles_with_email').select('*').eq('id', selectedUser.id).single()
              if (data) setSelectedUser(data)
              setDrawerEditMode(false)
              setDrawerEditForm(null)
            }
            return (
              <div style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: '#e8a020', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>✏️ Edit User</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Full Name</label>
                    <input style={inputStyle} value={drawerEditForm.full_name} onChange={e => setDrawerEditForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Full name" />
                  </div>
                  <div>
                    <label style={labelStyle}>Phone</label>
                    <input style={inputStyle} value={drawerEditForm.phone} onChange={e => setDrawerEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <label style={labelStyle}>Admin Notes</label>
                    <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }} value={drawerEditForm.admin_notes} onChange={e => setDrawerEditForm(f => ({ ...f, admin_notes: e.target.value }))} placeholder="Internal notes — not visible to user" />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setDrawerEditMode(false); setDrawerEditForm(null) }}
                      style={{ flex: 1, background: 'white', border: '1px solid #e2dbd4', color: '#7a6e65', padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      Cancel
                    </button>
                    <button onClick={saveEdits}
                      style={{ flex: 2, background: '#0f0c0c', color: 'white', border: 'none', padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

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
              ['Phone', selectedUser.phone || '—'],
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

          {!drawerEditMode && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Internal Notes</div>
              <AdminNotes userId={selectedUser.id} existingNotes={selectedUser.admin_notes} />
            </div>
          )}

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
    )
  }

  function renderConfirmDialog() {
    if (!confirmAction) return null
    return (
      <ConfirmActionDialog
        action={confirmAction}
        onConfirm={(reason) => {
          if (confirmAction.type === 'revoke') revokeChoreographer(confirmAction.user.id, reason)
          else if (confirmAction.type === 'suspend') suspendUser(confirmAction.user.id, reason)
        }}
        onCancel={() => setConfirmAction(null)}
        formatDate={formatDate}
      />
    )
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, padding: '16px 20px', borderBottom: '1px solid #f0ebe6', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Search users..."
          value={usersSearch}
          onChange={e => setUsersSearch(e.target.value)}
          style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: 200, outline: 'none' }}
        />
        <select value={usersRoleFilter} onChange={e => setUsersRoleFilter(e.target.value)}
          style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }}>
          <option value="all">All roles</option>
          <option value="learner">Learner</option>
          <option value="choreographer">Choreographer</option>
          <option value="admin">Admin</option>
        </select>
        <select value={usersStatusFilter} onChange={e => setUsersStatusFilter(e.target.value)}
          style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="never">Never logged in</option>
          <option value="suspended">Suspended</option>
        </select>
        <button onClick={downloadUsersCSV}
          style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#5a4e47', marginLeft: 'auto' }}>
          📥 Download CSV
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #f0ebe6' }}>
            {['Name', 'Email', 'Role', 'Status', 'First Seen', 'Last Login'].map(h => (
              <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map((u, i) => {
            const status = getUserStatus(u)
            return (
              <tr key={u.id} onClick={() => { setSelectedUser(u); setDrawerEditMode(false); setDrawerEditForm(null) }}
                style={{ borderBottom: i < filteredUsers.length - 1 ? '1px solid #f0ebe6' : 'none', cursor: 'pointer' }}
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
                  <span style={{ background: status.bg, color: status.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                    {status.label}
                  </span>
                </td>
                <td style={{ padding: '14px 20px', fontSize: 13, color: '#7a6e65' }}>{formatDate(u.auth_created_at || u.created_at)}</td>
                <td style={{ padding: '14px 20px', fontSize: 13, color: u.last_sign_in_at ? '#7a6e65' : '#a09890', fontStyle: u.last_sign_in_at ? 'normal' : 'italic' }}>
                  {u.last_sign_in_at ? formatDate(u.last_sign_in_at) : '— never —'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {selectedUser && renderDrawer()}
      {confirmAction && renderConfirmDialog()}
    </>
  )
}

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
