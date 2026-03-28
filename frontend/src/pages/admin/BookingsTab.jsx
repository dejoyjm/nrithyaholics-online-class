import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

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
  const [progress, setProgress] = useState(null)
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
export default function BookingsTab({ allBookings, users, onRefresh }) {
  const [expandedSessions, setExpandedSessions] = useState({})
  const [filterStatus, setFilterStatus] = useState('active')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterDays, setFilterDays] = useState(60)
  const [filterResolved, setFilterResolved] = useState('hide_resolved')
  const [announcementData, setAnnouncementData] = useState(null)

  const now = Date.now()
  const FIVE_MINS = 5 * 60 * 1000

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

  function isConfirmEmailIssue(b) {
    if (b.confirmation_email_sent_at) return false
    if (!b.razorpay_payment_id) return false
    return new Date(b.created_at).getTime() < now - FIVE_MINS
  }
  function isManualRecovery(b) {
    return (b.razorpay_order_id || '').startsWith('manual_recovery_')
  }
  const allIssues = enriched.filter(b =>
    (isConfirmEmailIssue(b) || isManualRecovery(b)) &&
    ['open', 'confirmed'].includes(b.session_status) &&
    !b.admin_resolved_at
  )

  const nowMs = Date.now()
  const istOffsetMs = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(nowMs + istOffsetMs)
  const todayStartIST = new Date(Date.UTC(
    nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate(), 0, 0, 0, 0
  ))
  const todayStartUTC = new Date(todayStartIST.getTime() - istOffsetMs)

  let periodStart
  if (filterDays === 1) {
    periodStart = todayStartUTC
  } else {
    periodStart = new Date(nowMs - filterDays * 24 * 60 * 60 * 1000)
  }
  const todayBookings = enriched.filter(b =>
    new Date(b.created_at) >= periodStart && b.session_status !== 'cancelled'
  )
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
      return true
    })
    .filter(([, group]) => !filterSearch || group.session_title.toLowerCase().includes(filterSearch.toLowerCase()))
    .sort(([, a], [, b]) => new Date(b.scheduled_at) - new Date(a.scheduled_at))

  function toggleSession(sid) {
    setExpandedSessions(s => ({ ...s, [sid]: !s[sid] }))
  }

  function isExpanded(sid) {
    if (sid in expandedSessions) return expandedSessions[sid]
    const group = bySession[sid]
    return group?.bookings.some(b => isConfirmEmailIssue(b) || isManualRecovery(b)) || false
  }

  function formatISTShort(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
    })
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
    const durationMs = 60 * 60 * 1000
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

  const issues = allIssues.filter(b => filterResolved !== 'resolved_only')

  return (
    <div style={{ marginTop: 24 }}>

      {/* Attention Banner */}
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

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input
          placeholder="Search sessions..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: 200, outline: 'none' }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }}>
          <option value="active">Active sessions</option>
          <option value="all">All sessions</option>
          <option value="cancelled">Cancelled only</option>
        </select>
        <select value={filterDays} onChange={e => setFilterDays(Number(e.target.value))}
          style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }}>
          <option value={1}>Today</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
        </select>
        <select value={filterResolved} onChange={e => setFilterResolved(e.target.value)}
          style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }}>
          <option value="hide_resolved">Hide resolved</option>
          <option value="show_all">Show all</option>
          <option value="resolved_only">Resolved only</option>
        </select>
      </div>

      {/* Summary */}
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

      {/* Session Cards */}
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
            <div onClick={() => toggleSession(sid)}
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

      <AnnouncementModal
        sessionData={announcementData}
        onClose={() => setAnnouncementData(null)}
        onRefresh={onRefresh}
      />
    </div>
  )
}
