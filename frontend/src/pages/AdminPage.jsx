import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import BookingsTab from './admin/BookingsTab'
import UsersTab from './admin/UsersTab'
import SessionsTab from './admin/SessionsTab'
import RevenueTab from './admin/RevenueTab'
import RecordingsTab from './admin/RecordingsTab'
import SettingsTab from './admin/SettingsTab'

export default function AdminPage({ user, onLogout, onConfigChange }) {
  const [tab, setTab] = useState('applications')
  const [applications, setApplications] = useState([])
  const [users, setUsers] = useState([])
  const [sessions, setSessions] = useState([])
  const [allBookings, setAllBookings] = useState([])
  const [waitlistCounts, setWaitlistCounts] = useState({})
  const [loading, setLoading] = useState(true)

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
    setAllBookings(bookingsRes.data || [])
    const counts = {}
    waitlistRes.data?.forEach(w => { counts[w.session_id] = (counts[w.session_id] || 0) + 1 })
    setWaitlistCounts(counts)
    setLoading(false)
  }

  const tabStyle = (t) => ({
    padding: '10px 20px', border: 'none', borderRadius: 8,
    cursor: 'pointer', fontSize: 14, fontWeight: 600,
    background: tab === t ? '#c8430a' : 'transparent',
    color: tab === t ? 'white' : '#7a6e65',
  })

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
          <button style={tabStyle('revenue')} onClick={() => setTab('revenue')}>💰 Revenue</button>
          <button style={tabStyle('recordings')} onClick={() => setTab('recordings')}>🎬 Recordings</button>
          <button style={tabStyle('settings')} onClick={() => setTab('settings')}>⚙️ Settings</button>
        </div>

        {/* CONTENT */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2dbd4', overflow: 'hidden' }}>

          {(tab === 'applications' || tab === 'users') && (
            <UsersTab
              section={tab}
              applications={applications}
              users={users}
              loading={loading}
              onRefresh={fetchAll}
            />
          )}

          {tab === 'sessions' && (
            <SessionsTab
              sessions={sessions}
              waitlistCounts={waitlistCounts}
              onRefresh={fetchAll}
            />
          )}

          {tab === 'bookings' && (
            <BookingsTab
              allBookings={allBookings}
              users={users}
              onRefresh={fetchAll}
            />
          )}

          {tab === 'revenue' && (
            <div style={{ padding: 32 }}>
              <RevenueTab
                choreographers={users.filter(u => u.role === 'choreographer' && u.choreographer_approved)}
                sessions={sessions}
              />
            </div>
          )}

          {tab === 'recordings' && (
            <div style={{ padding: 32 }}>
              <RecordingsTab />
            </div>
          )}

          {tab === 'settings' && (
            <div style={{ padding: 32 }}>
              <SettingsTab
                onConfigSaved={(newConfig) => {
                  if (onConfigChange) onConfigChange(newConfig)
                }}
              />
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
