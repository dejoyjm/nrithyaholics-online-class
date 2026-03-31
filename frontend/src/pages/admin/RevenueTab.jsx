import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { calculateSessionSettlement, calculateSlabBreakdown } from '../../utils/revenue'

export default function RevenueTab({ choreographers, sessions }) {
  const [policies, setPolicies] = useState([])
  const [loading, setLoading] = useState(true)
  const [editPolicy, setEditPolicy] = useState(null)  // null=closed, 'new', or policy object
  const [saving, setSaving] = useState(false)
  const [assignChoreoId, setAssignChoreoId] = useState('')
  const [assignChoreoPolicyId, setAssignChoreoPolicyId] = useState('')
  const [assignSessionId, setAssignSessionId] = useState('')
  const [assignSessionPolicyId, setAssignSessionPolicyId] = useState('')
  const [assignMsg, setAssignMsg] = useState('')

  // Simulator
  const [simPolicyId, setSimPolicyId] = useState('')
  const [simPrice, setSimPrice] = useState(500)
  const [simStudents, setSimStudents] = useState(25)
  const [simGatewayPct, setSimGatewayPct] = useState(3)
  const [simResult, setSimResult] = useState(null)
  const [simCompareMode, setSimCompareMode] = useState(false)
  const [simPolicy2Id, setSimPolicy2Id] = useState('')
  const [simGatewayPct2, setSimGatewayPct2] = useState(3)
  const [simResult2, setSimResult2] = useState(null)

  // Payout section
  const [payouts, setPayouts] = useState([])
  const [loadingPayouts, setLoadingPayouts] = useState(true)
  const [payoutChoreoFilter, setPayoutChoreoFilter] = useState('')
  const [payoutStatusFilter, setPayoutStatusFilter] = useState('pending')
  const [expandedChoreos, setExpandedChoreos] = useState({})

  // Booking audit
  const [allBookings, setAllBookings] = useState([])
  const [loadingBookings, setLoadingBookings] = useState(true)
  const [filterChoreoId, setFilterChoreoId] = useState('')
  const [filterSessionId, setFilterSessionId] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  useEffect(() => { fetchPolicies() }, [])
  useEffect(() => { fetchPayouts() }, [])
  useEffect(() => { fetchAuditBookings(filterDateFrom, filterDateTo) }, [filterDateFrom, filterDateTo])

  async function fetchPolicies() {
    const { data } = await supabase
      .from('revenue_policies')
      .select('*, revenue_policy_slabs(*)')
      .order('created_at')
    const loaded = data || []
    setPolicies(loaded)
    if (!simPolicyId && loaded.length > 0) {
      const def = loaded.find(p => p.is_default) || loaded[0]
      setSimPolicyId(def.id)
      setSimGatewayPct(def.gateway_fee_pct)
    }
    setLoading(false)
  }

  async function fetchAuditBookings(fromDate = '', toDate = '') {
    setLoadingBookings(true)
    // Step 1: fetch bookings + sessions (no nested profile joins to avoid 400)
    let query = supabase
      .from('bookings')
      .select(`
        id, created_at, status, credits_paid, ticket_price, gateway_fee,
        nrh_share, choreo_share, razorpay_payment_id, booked_by, session_id,
        sessions(id, title, scheduled_at, choreographer_id)
      `)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
    if (fromDate) query = query.gte('created_at', new Date(fromDate).toISOString())
    if (toDate) query = query.lte('created_at', new Date(toDate + 'T23:59:59').toISOString())

    const { data: bookingsData, error } = await query
    if (error) { console.error('[audit fetch error]', error); setLoadingBookings(false); return }

    if (!bookingsData || bookingsData.length === 0) {
      setAllBookings([])
      setLoadingBookings(false)
      return
    }

    // Step 2: collect all unique user IDs (learners + choreographers)
    const userIds = [...new Set([
      ...bookingsData.map(b => b.booked_by),
      ...bookingsData.map(b => b.sessions?.choreographer_id),
    ].filter(Boolean))]

    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles_with_email')
      .select('id, full_name, email')
      .in('id', userIds)
    if (profilesError) console.error('[profiles fetch]', profilesError)
    console.log('[profiles fetched]', profilesData?.length, 'for', userIds.length, 'userIds')

    const profileMap = Object.fromEntries((profilesData || []).map(p => [p.id, p]))

    // Step 3: merge client-side
    const enriched = bookingsData.map(b => ({
      ...b,
      learnerProfile: profileMap[b.booked_by] || null,
      choreoProfile: profileMap[b.sessions?.choreographer_id] || null,
    }))

    console.log('[audit fetch]', { fromDate, toDate, count: enriched.length })
    setAllBookings(enriched)
    setLoadingBookings(false)
  }

  async function fetchPayouts() {
    setLoadingPayouts(true)
    const { data: sessionsData } = await supabase
      .from('sessions')
      .select('*')
      .in('status', ['confirmed', 'completed'])
      .order('scheduled_at', { ascending: false })
    if (!sessionsData || sessionsData.length === 0) { setPayouts([]); setLoadingPayouts(false); return }
    const sessionIds = sessionsData.map(s => s.id)
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('*')
      .in('session_id', sessionIds)
      .eq('status', 'confirmed')
      .gt('choreo_share', 0)
    if (!bookingsData || bookingsData.length === 0) { setPayouts([]); setLoadingPayouts(false); return }
    const choreoIds = [...new Set(sessionsData.map(s => s.choreographer_id).filter(Boolean))]
    const { data: profilesData } = await supabase.from('profiles').select('*').in('id', choreoIds)
    const profileMap = Object.fromEntries((profilesData || []).map(p => [p.id, p]))
    const sessionMap = Object.fromEntries(sessionsData.map(s => [s.id, s]))
    const sessionGroups = {}
    bookingsData.forEach(b => {
      if (!sessionGroups[b.session_id]) sessionGroups[b.session_id] = { session: sessionMap[b.session_id], bookings: [] }
      sessionGroups[b.session_id].bookings.push(b)
    })
    const rows = Object.values(sessionGroups)
      .filter(({ session }) => session)
      .map(({ session, bookings }) => {
        const choreo = profileMap[session.choreographer_id]
        const totalShare = bookings.reduce((sum, b) => sum + (b.choreo_share || 0), 0)
        const settledAts = bookings.map(b => b.choreo_share_settled_at).filter(Boolean)
        const settledAt = settledAts.length === bookings.length && settledAts.length > 0
          ? [...settledAts].sort().at(-1) : null
        return {
          sessionId: session.id, sessionTitle: session.title,
          sessionDate: session.scheduled_at, sessionStatus: session.status,
          choreoId: session.choreographer_id,
          choreoName: choreo?.full_name || 'Unknown', choreoAvatar: choreo?.avatar_url || null,
          totalShare, bookingCount: bookings.length, settledAt,
        }
      })
    rows.sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate))
    setPayouts(rows)
    setLoadingPayouts(false)
  }

  async function markSettled(row) {
    if (!window.confirm(`Mark ₹${row.totalShare.toLocaleString('en-IN')} payout to ${row.choreoName} for "${row.sessionTitle}" as settled?`)) return
    const { data: authData } = await supabase.auth.getSession()
    const adminId = authData?.session?.user?.id || null
    await supabase.from('bookings')
      .update({ choreo_share_settled_at: new Date().toISOString(), choreo_share_settled_by: adminId })
      .eq('session_id', row.sessionId).eq('status', 'confirmed')
    fetchPayouts()
  }

  async function markSettledAll(choreoId, choreoName) {
    const pendingRows = payouts.filter(r => r.choreoId === choreoId && !r.settledAt)
    if (pendingRows.length === 0) return
    const total = pendingRows.reduce((sum, r) => sum + r.totalShare, 0)
    if (!window.confirm(`Mark all pending payouts (₹${total.toLocaleString('en-IN')}) to ${choreoName} as settled? Covers ${pendingRows.length} session(s).`)) return
    const { data: authData } = await supabase.auth.getSession()
    const adminId = authData?.session?.user?.id || null
    for (const row of pendingRows) {
      await supabase.from('bookings')
        .update({ choreo_share_settled_at: new Date().toISOString(), choreo_share_settled_by: adminId })
        .eq('session_id', row.sessionId).eq('status', 'confirmed')
    }
    fetchPayouts()
  }

  async function handleSavePolicy(form, slabs) {
    setSaving(true)
    try {
      let policyId = form.id
      if (form.id) {
        // Update existing
        if (form.is_default) {
          await supabase.from('revenue_policies').update({ is_default: false })
            .neq('id', form.id)
        }
        await supabase.from('revenue_policies').update({
          name: form.name,
          gateway_fee_pct: form.gateway_fee_pct,
          is_default: form.is_default,
        }).eq('id', form.id)
        await supabase.from('revenue_policy_slabs').delete().eq('policy_id', form.id)
      } else {
        // Create new
        if (form.is_default) {
          await supabase.from('revenue_policies').update({ is_default: false }).neq('id', 'never')
        }
        const { data } = await supabase.from('revenue_policies').insert({
          name: form.name,
          gateway_fee_pct: form.gateway_fee_pct,
          is_default: form.is_default,
        }).select('id').single()
        policyId = data.id
      }
      if (slabs.length > 0) {
        await supabase.from('revenue_policy_slabs').insert(
          slabs.map((s, i) => ({
            policy_id: policyId,
            from_student: s.from_student,
            to_student: s.to_student || null,
            mode: s.mode,
            value: s.value,
            sort_order: i + 1,
          }))
        )
      }
      await fetchPolicies()
      setEditPolicy(null)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  async function handleAssignChoreo() {
    if (!assignChoreoId) return
    await supabase.from('profiles').update({
      revenue_policy_id: assignChoreoPolicyId || null,
    }).eq('id', assignChoreoId)
    setAssignMsg('Saved!')
    setTimeout(() => setAssignMsg(''), 2000)
  }

  async function handleAssignSession() {
    if (!assignSessionId) return
    await supabase.from('sessions').update({
      revenue_policy_id: assignSessionPolicyId || null,
    }).eq('id', assignSessionId)
    setAssignMsg('Saved!')
    setTimeout(() => setAssignMsg(''), 2000)
  }

  function runSimulation() {
    const policy = policies.find(p => p.id === simPolicyId)
    if (!policy) return
    const slabs = policy.revenue_policy_slabs || []
    const settlement = calculateSessionSettlement(simStudents, simPrice, { ...policy, gateway_fee_pct: simGatewayPct }, slabs)
    const slabBreakdown = calculateSlabBreakdown(simStudents, simPrice, slabs)
    setSimResult({ ...settlement, slabBreakdown, gatewayPct: simGatewayPct, policyName: policy.name })

    if (simCompareMode && simPolicy2Id) {
      const policy2 = policies.find(p => p.id === simPolicy2Id)
      if (policy2) {
        const slabs2 = policy2.revenue_policy_slabs || []
        const settlement2 = calculateSessionSettlement(simStudents, simPrice, { ...policy2, gateway_fee_pct: simGatewayPct2 }, slabs2)
        const slabBreakdown2 = calculateSlabBreakdown(simStudents, simPrice, slabs2)
        setSimResult2({ ...settlement2, slabBreakdown: slabBreakdown2, gatewayPct: simGatewayPct2, policyName: policy2.name })
      }
    } else {
      setSimResult2(null)
    }
  }

  const inp = { width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#0f0c0c' }
  const lbl = { fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, display: 'block' }

  if (loading) return <div style={{ padding: 40, color: '#7a6e65' }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* SECTION 0: Choreographer Payouts */}
      {(() => {
        const choreoSummaryMap = {}
        payouts.forEach(row => {
          if (!choreoSummaryMap[row.choreoId]) {
            choreoSummaryMap[row.choreoId] = { choreoId: row.choreoId, choreoName: row.choreoName, choreoAvatar: row.choreoAvatar, sessionCount: 0, pendingAmount: 0, settledAmount: 0 }
          }
          choreoSummaryMap[row.choreoId].sessionCount += 1
          if (row.settledAt) choreoSummaryMap[row.choreoId].settledAmount += row.totalShare
          else choreoSummaryMap[row.choreoId].pendingAmount += row.totalShare
        })
        const choreoSummaryList = Object.values(choreoSummaryMap).sort((a, b) => b.pendingAmount - a.pendingAmount)
        const payoutChoreosForFilter = choreoSummaryList.map(c => ({ id: c.choreoId, name: c.choreoName }))
        const filteredPayouts = payouts.filter(row => {
          if (payoutChoreoFilter && row.choreoId !== payoutChoreoFilter) return false
          if (payoutStatusFilter === 'pending' && row.settledAt) return false
          if (payoutStatusFilter === 'settled' && !row.settledAt) return false
          return true
        })
        function exportPayoutsCSV() {
          if (filteredPayouts.length === 0) return
          const rows = [['Choreographer', 'Session', 'Date', 'Bookings', 'Choreo Share', 'Status', 'Settled At', 'Settled By']]
          filteredPayouts.forEach(row => rows.push([
            row.choreoName, row.sessionTitle,
            new Date(row.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
            row.bookingCount, row.totalShare,
            row.settledAt ? 'Settled' : 'Pending',
            row.settledAt ? new Date(row.settledAt).toLocaleDateString('en-IN') : '', '',
          ]))
          const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
          const blob = new Blob([csv], { type: 'text/csv' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = `nrh-payouts-${new Date().toISOString().split('T')[0]}.csv`; a.click()
          URL.revokeObjectURL(url)
        }
        const thP = { padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #f0ebe6', whiteSpace: 'nowrap' }
        const tdP = { padding: '10px 12px', fontSize: 13, color: '#0f0c0c', borderBottom: '1px solid #f8f4f0' }
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif', margin: 0 }}>💸 Choreographer Payouts</h3>
              <button onClick={exportPayoutsCSV} disabled={filteredPayouts.length === 0}
                style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: filteredPayouts.length === 0 ? 'not-allowed' : 'pointer', color: '#5a4e47', opacity: filteredPayouts.length === 0 ? 0.5 : 1 }}>
                📥 Export CSV
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={payoutChoreoFilter} onChange={e => setPayoutChoreoFilter(e.target.value)}
                style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', background: 'white' }}>
                <option value="">All Choreographers</option>
                {payoutChoreosForFilter.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 4, background: '#f0ebe6', borderRadius: 8, padding: 3 }}>
                {['all', 'pending', 'settled'].map(s => (
                  <button key={s} onClick={() => setPayoutStatusFilter(s)}
                    style={{ background: payoutStatusFilter === s ? 'white' : 'transparent', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: payoutStatusFilter === s ? '#0f0c0c' : '#7a6e65', boxShadow: payoutStatusFilter === s ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 13, color: '#7a6e65' }}>{loadingPayouts ? 'Loading...' : `${filteredPayouts.length} session${filteredPayouts.length !== 1 ? 's' : ''}`}</span>
            </div>
            {loadingPayouts ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#7a6e65' }}>Loading payouts...</div>
            ) : payouts.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#7a6e65', background: '#faf7f2', borderRadius: 12, border: '1px solid #e2dbd4' }}>
                No sessions with choreo_share found. Confirmed bookings with choreo_share &gt; 0 will appear here.
              </div>
            ) : (
              <>
                {/* Per-choreographer summary strips */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {choreoSummaryList.filter(c => !payoutChoreoFilter || c.choreoId === payoutChoreoFilter).map(choreo => {
                    const isExpanded = !!expandedChoreos[choreo.choreoId]
                    const choreoRows = filteredPayouts.filter(r => r.choreoId === choreo.choreoId)
                    return (
                      <div key={choreo.choreoId}>
                        <div onClick={() => setExpandedChoreos(e => ({ ...e, [choreo.choreoId]: !e[choreo.choreoId] }))}
                          style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: isExpanded ? '12px 12px 0 0' : 12, padding: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e2dbd4', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#7a6e65', fontWeight: 700 }}>
                            {choreo.choreoAvatar ? <img src={choreo.choreoAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (choreo.choreoName?.[0] || '?')}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f0c0c', flex: 1, minWidth: 120 }}>{choreo.choreoName}</div>
                          <div style={{ fontSize: 13, color: '#7a6e65', whiteSpace: 'nowrap' }}>{choreo.sessionCount} session{choreo.sessionCount !== 1 ? 's' : ''}</div>
                          {choreo.pendingAmount > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: '#e8a020', whiteSpace: 'nowrap' }}>₹{choreo.pendingAmount.toLocaleString('en-IN')} pending</div>}
                          {choreo.settledAmount > 0 && <div style={{ fontSize: 13, color: '#1a7a3c', whiteSpace: 'nowrap' }}>₹{choreo.settledAmount.toLocaleString('en-IN')} settled</div>}
                          {choreo.pendingAmount > 0 && (
                            <button onClick={e => { e.stopPropagation(); markSettledAll(choreo.choreoId, choreo.choreoName) }}
                              style={{ background: '#c8430a', color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              Settle All Pending →
                            </button>
                          )}
                          <span style={{ color: '#7a6e65', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>
                        {isExpanded && choreoRows.length > 0 && (
                          <div style={{ border: '1px solid #e2dbd4', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <tbody>
                                {choreoRows.map(row => (
                                  <tr key={row.sessionId} style={{ background: 'white', borderBottom: '1px solid #f8f4f0' }}>
                                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#0f0c0c' }}>{row.sessionTitle}</td>
                                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#7a6e65', whiteSpace: 'nowrap' }}>
                                      {new Date(row.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                                    </td>
                                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#0f0c0c', whiteSpace: 'nowrap' }}>₹{row.totalShare.toLocaleString('en-IN')}</td>
                                    <td style={{ padding: '10px 12px' }}>
                                      {row.settledAt
                                        ? <span style={{ background: '#e6f4ec', color: '#1a7a3c', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>✓ Settled</span>
                                        : <span style={{ background: '#fff8e6', color: '#e8a020', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>⏳ Pending</span>}
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                      {row.settledAt
                                        ? <span style={{ fontSize: 11, color: '#a09890' }}>{new Date(row.settledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        : <button onClick={() => markSettled(row)} style={{ background: '#c8430a', color: 'white', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Mark Settled</button>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {isExpanded && choreoRows.length === 0 && (
                          <div style={{ border: '1px solid #e2dbd4', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 16, textAlign: 'center', color: '#7a6e65', fontSize: 13, background: 'white' }}>
                            No sessions match current filters
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {/* Main table */}
                {filteredPayouts.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: '#7a6e65', background: '#faf7f2', borderRadius: 12, border: '1px solid #e2dbd4' }}>No sessions match the current filters</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2dbd4' }}>
                      <thead>
                        <tr style={{ background: '#faf7f2' }}>
                          <th style={thP}>Choreographer</th>
                          <th style={thP}>Session</th>
                          <th style={thP}>Date</th>
                          <th style={{ ...thP, textAlign: 'right' }}>Bookings</th>
                          <th style={{ ...thP, textAlign: 'right' }}>Choreo Share</th>
                          <th style={thP}>Status</th>
                          <th style={thP}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPayouts.map(row => (
                          <tr key={row.sessionId}>
                            <td style={tdP}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e2dbd4', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#7a6e65', fontWeight: 700 }}>
                                  {row.choreoAvatar ? <img src={row.choreoAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (row.choreoName?.[0] || '?')}
                                </div>
                                <span>{row.choreoName}</span>
                              </div>
                            </td>
                            <td style={tdP}>{row.sessionTitle}</td>
                            <td style={{ ...tdP, whiteSpace: 'nowrap', color: '#7a6e65' }}>
                              {new Date(row.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                            </td>
                            <td style={{ ...tdP, textAlign: 'right' }}>{row.bookingCount}</td>
                            <td style={{ ...tdP, textAlign: 'right', fontWeight: 700 }}>₹{row.totalShare.toLocaleString('en-IN')}</td>
                            <td style={tdP}>
                              {row.settledAt
                                ? <span style={{ background: '#e6f4ec', color: '#1a7a3c', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>✓ Settled</span>
                                : <span style={{ background: '#fff8e6', color: '#e8a020', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>⏳ Pending</span>}
                            </td>
                            <td style={tdP}>
                              {row.settledAt
                                ? <span style={{ fontSize: 11, color: '#a09890' }}>{new Date(row.settledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                : <button onClick={() => markSettled(row)} style={{ background: '#c8430a', color: 'white', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Mark Settled</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })()}

      {/* SECTION A: Policy Management */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif', margin: 0 }}>Revenue Policies</h3>
          <button onClick={() => setEditPolicy({ name: '', gateway_fee_pct: 3, is_default: false })}
            style={{ background: '#c8430a', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            + New Policy
          </button>
        </div>

        {/* Policy list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {policies.map(policy => (
            <div key={policy.id} style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#0f0c0c' }}>{policy.name}</span>
                  {policy.is_default && (
                    <span style={{ marginLeft: 8, background: '#1a7a3c', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>DEFAULT</span>
                  )}
                  <div style={{ fontSize: 12, color: '#7a6e65', marginTop: 2 }}>Gateway fee: {policy.gateway_fee_pct}%</div>
                </div>
                <button onClick={() => setEditPolicy({ ...policy, slabs: policy.revenue_policy_slabs || [] })}
                  style={{ background: 'white', border: '1px solid #e2dbd4', borderRadius: 8, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: '#5a4e47' }}>
                  ✏️ Edit
                </button>
              </div>
              {(policy.revenue_policy_slabs || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[...policy.revenue_policy_slabs].sort((a, b) => a.sort_order - b.sort_order).map((slab, i) => (
                    <span key={i} style={{ background: 'white', border: '1px solid #e2dbd4', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: '#5a4e47' }}>
                      {slab.from_student}–{slab.to_student ?? '∞'}: {slab.mode === 'flat' ? `₹${slab.value} flat` : `${slab.value}%`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Assign to choreographer */}
        <div style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f0c0c', marginBottom: 12 }}>Assign Policy to Choreographer</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
            <div>
              <label style={lbl}>Choreographer</label>
              <select style={inp} value={assignChoreoId} onChange={e => setAssignChoreoId(e.target.value)}>
                <option value="">Select...</option>
                {choreographers.map(c => <option key={c.id} value={c.id}>{c.full_name || c.email}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Policy</label>
              <select style={inp} value={assignChoreoPolicyId} onChange={e => setAssignChoreoPolicyId(e.target.value)}>
                <option value="">Use default</option>
                {policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <button onClick={handleAssignChoreo}
              style={{ background: '#0f0c0c', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Save
            </button>
          </div>
        </div>

        {/* Assign to session */}
        <div style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f0c0c', marginBottom: 12 }}>Assign Policy to Session</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
            <div>
              <label style={lbl}>Session</label>
              <select style={inp} value={assignSessionId} onChange={e => setAssignSessionId(e.target.value)}>
                <option value="">Select...</option>
                {sessions.filter(s => ['open','confirmed','draft'].includes(s.status)).map(s => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Policy</label>
              <select style={inp} value={assignSessionPolicyId} onChange={e => setAssignSessionPolicyId(e.target.value)}>
                <option value="">Use choreographer/default</option>
                {policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <button onClick={handleAssignSession}
              style={{ background: '#0f0c0c', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Save
            </button>
          </div>
          {assignMsg && <div style={{ fontSize: 12, color: '#1a7a3c', fontWeight: 700, marginTop: 8 }}>✓ {assignMsg}</div>}
        </div>
      </div>

      {/* SECTION B: Simulation Engine */}
      <div style={{ borderTop: '2px solid #f0ebe6', paddingTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif', margin: 0 }}>💡 Revenue Simulator</h3>
          <div style={{ display: 'flex', gap: 4, background: '#f0ebe6', borderRadius: 8, padding: 3 }}>
            <button onClick={() => { setSimCompareMode(false); setSimResult2(null) }}
              style={{ background: simCompareMode ? 'transparent' : 'white', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: simCompareMode ? '#7a6e65' : '#0f0c0c', boxShadow: simCompareMode ? 'none' : '0 1px 3px rgba(0,0,0,0.1)' }}>
              Single policy
            </button>
            <button onClick={() => setSimCompareMode(true)}
              style={{ background: simCompareMode ? 'white' : 'transparent', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: simCompareMode ? '#0f0c0c' : '#7a6e65', boxShadow: simCompareMode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
              Compare two
            </button>
          </div>
        </div>
        <div style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: simCompareMode ? '1fr 1fr 1fr' : 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>{simCompareMode ? 'Policy A' : 'Policy'}</label>
              <select style={inp} value={simPolicyId} onChange={e => {
                setSimPolicyId(e.target.value)
                const p = policies.find(x => x.id === e.target.value)
                if (p) setSimGatewayPct(p.gateway_fee_pct)
              }}>
                {policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {simCompareMode && (
              <div>
                <label style={lbl}>Policy B</label>
                <select style={inp} value={simPolicy2Id} onChange={e => {
                  setSimPolicy2Id(e.target.value)
                  const p = policies.find(x => x.id === e.target.value)
                  if (p) setSimGatewayPct2(p.gateway_fee_pct)
                }}>
                  <option value="">Select policy</option>
                  {policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>Ticket Price (₹)</label>
              <input type="number" style={inp} value={simPrice} onChange={e => setSimPrice(Number(e.target.value))} min="1" />
            </div>
            <div>
              <label style={lbl}>Number of students</label>
              <input type="number" style={inp} value={simStudents} onChange={e => setSimStudents(Number(e.target.value))} min="1" />
            </div>
            {!simCompareMode && (
              <div>
                <label style={lbl}>Gateway fee %</label>
                <input type="number" style={inp} value={simGatewayPct} onChange={e => setSimGatewayPct(Number(e.target.value))} min="0" step="0.01" />
              </div>
            )}
          </div>
          <button onClick={runSimulation}
            style={{ background: '#5b4fcf', color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Calculate
          </button>
        </div>

        {simResult && (
          <div style={{ display: 'grid', gridTemplateColumns: simCompareMode && simResult2 ? '1fr 1fr' : '1fr', gap: 16 }}>
            {[simResult, simCompareMode ? simResult2 : null].filter(Boolean).map((res, idx) => (
              <div key={idx} style={{ background: 'white', border: `1px solid ${idx === 0 ? '#e2dbd4' : '#5b4fcf44'}`, borderRadius: 12, padding: 20 }}>
                {simCompareMode && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: idx === 0 ? '#5a4e47' : '#5b4fcf', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {idx === 0 ? 'Policy A' : 'Policy B'}: {res.policyName}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {[
                    ['Gross revenue', `₹${res.grossRevenue.toLocaleString('en-IN')}`],
                    [`Gateway fees (${res.gatewayPct}%)`, `₹${res.totalGatewayFees.toLocaleString('en-IN')} (learner)`],
                    ['NRH share', `₹${res.nrhShare.toLocaleString('en-IN')}`],
                    ['Choreographer', `₹${res.choreoShare.toLocaleString('en-IN')}`],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0ebe6' }}>
                      <span style={{ fontSize: 13, color: '#5a4e47' }}>{label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f0c0c' }}>{value}</span>
                    </div>
                  ))}
                </div>
                {res.slabBreakdown.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Slab breakdown</div>
                    {res.slabBreakdown.map((slab, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#5a4e47', padding: '3px 0' }}>
                        {slab.label}: {slab.mode === 'flat'
                          ? `flat ₹${slab.value}`
                          : `${slab.value}% × ₹${slab.slabRevenue?.toLocaleString('en-IN')}`} = ₹{slab.nrhAmount.toLocaleString('en-IN')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION C: Booking Audit */}
      {(() => {
        // Unique choreographers from bookings (for filter dropdown)
        const choreoMap = {}
        allBookings.forEach(b => {
          const cid = b.sessions?.choreographer_id
          const cname = b.choreoProfile?.full_name
          if (cid && cname) choreoMap[cid] = cname
        })
        const choreoList = Object.entries(choreoMap).map(([id, name]) => ({ id, name }))

        // Sessions for selected choreo
        const sessionMap = {}
        allBookings.forEach(b => {
          if (!filterChoreoId || b.sessions?.choreographer_id === filterChoreoId) {
            const sid = b.sessions?.id
            const stitle = b.sessions?.title
            if (sid && stitle) sessionMap[sid] = stitle
          }
        })
        const sessionList = Object.entries(sessionMap).map(([id, title]) => ({ id, title }))

        // Filter by choreo/session (client-side); date filtering is server-side via fetchAuditBookings
        const filtered = allBookings.filter(b => {
          if (filterChoreoId && b.sessions?.choreographer_id !== filterChoreoId) return false
          if (filterSessionId && b.sessions?.id !== filterSessionId) return false
          return true
        })

        // Totals
        const totals = filtered.reduce((acc, b) => {
          const tp = b.ticket_price ?? b.credits_paid ?? 0
          acc.tickets += 1
          acc.ticketPrice += tp
          acc.gatewayFee += b.gateway_fee || 0
          acc.nrhShare += b.nrh_share || 0
          acc.choreoShare += b.choreo_share || 0
          return acc
        }, { tickets: 0, ticketPrice: 0, gatewayFee: 0, nrhShare: 0, choreoShare: 0 })

        function exportCSV() {
          if (filtered.length === 0) return
          const rows = filtered.map(b => ({
            Date: new Date(b.created_at).toLocaleDateString('en-IN'),
            Session: b.sessions?.title || '',
            Choreographer: b.choreoProfile?.full_name || '',
            Learner: b.learnerProfile?.email || b.learnerProfile?.full_name || '',
            Tickets: 1,
            'Ticket Price': b.ticket_price ?? b.credits_paid ?? 0,
            'Gateway Fee': b.gateway_fee || 0,
            'NRH Share': b.nrh_share || 0,
            'Choreo Share': b.choreo_share || 0,
            'Razorpay ID': b.razorpay_payment_id || 'N/A',
            Status: b.status,
          }))
          const csv = [
            Object.keys(rows[0]).join(','),
            ...rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
          ].join('\n')
          const blob = new Blob([csv], { type: 'text/csv' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `nrh-bookings-${new Date().toISOString().split('T')[0]}.csv`
          a.click()
          URL.revokeObjectURL(url)
        }

        const thStyle = { padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #f0ebe6', whiteSpace: 'nowrap' }
        const tdStyle = (isLegacy) => ({ padding: '10px 12px', fontSize: 12, color: isLegacy ? '#a09890' : '#0f0c0c', borderBottom: '1px solid #f8f4f0' })

        return (
          <div style={{ borderTop: '2px solid #f0ebe6', paddingTop: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif', margin: 0 }}>📋 Booking Audit</h3>
              <button onClick={exportCSV} disabled={filtered.length === 0}
                style={{ background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: filtered.length === 0 ? 'not-allowed' : 'pointer', color: '#5a4e47', opacity: filtered.length === 0 ? 0.5 : 1 }}>
                📥 Export CSV
              </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#7a6e65', whiteSpace: 'nowrap' }}>From</label>
                <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); fetchAuditBookings(e.target.value, filterDateTo) }}
                  style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '7px 10px', fontSize: 13, outline: 'none', background: 'white' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#7a6e65', whiteSpace: 'nowrap' }}>To</label>
                <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); fetchAuditBookings(filterDateFrom, e.target.value) }}
                  style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '7px 10px', fontSize: 13, outline: 'none', background: 'white' }} />
              </div>
              <select
                value={filterChoreoId}
                onChange={e => { setFilterChoreoId(e.target.value); setFilterSessionId('') }}
                style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', background: 'white' }}>
                <option value="">All choreographers</option>
                {choreoList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                value={filterSessionId}
                onChange={e => setFilterSessionId(e.target.value)}
                style={{ border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', background: 'white' }}>
                <option value="">All sessions</option>
                {sessionList.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              {(filterDateFrom || filterDateTo || filterChoreoId || filterSessionId) && (
                <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterChoreoId(''); setFilterSessionId('') }}
                  style={{ background: 'none', border: 'none', fontSize: 12, color: '#c8430a', cursor: 'pointer', padding: '4px 8px' }}>
                  Clear filters
                </button>
              )}
              <span style={{ fontSize: 13, color: '#7a6e65', alignSelf: 'center' }}>
                {loadingBookings ? 'Loading...' : `${filtered.length} booking${filtered.length !== 1 ? 's' : ''}`}
              </span>
            </div>

            {/* Summary stat cards */}
            {!loadingBookings && filtered.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Bookings', value: filtered.length, color: '#5b4fcf' },
                  { label: 'Sessions', value: new Set(filtered.map(b => b.sessions?.id).filter(Boolean)).size, color: '#5b4fcf' },
                  { label: 'Gross revenue', value: `₹${totals.ticketPrice.toLocaleString('en-IN')}`, color: '#0f0c0c' },
                  { label: 'Gateway fees', value: `₹${totals.gatewayFee.toLocaleString('en-IN')}`, color: '#7a6e65' },
                  { label: 'NRH share', value: `₹${totals.nrhShare.toLocaleString('en-IN')}`, color: '#c8430a' },
                  { label: 'Choreo share', value: `₹${totals.choreoShare.toLocaleString('en-IN')}`, color: '#1a7a3c' },
                ].map(card => (
                  <div key={card.label} style={{ background: 'white', border: '1px solid #e2dbd4', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{card.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: card.color }}>{card.value}</div>
                  </div>
                ))}
              </div>
            )}

            {loadingBookings ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#7a6e65' }}>Loading bookings...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#7a6e65' }}>No bookings found</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2dbd4' }}>
                  <thead>
                    <tr style={{ background: '#faf7f2' }}>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Session</th>
                      <th style={thStyle}>Learner</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Tickets</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Ticket ₹</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Gateway ₹</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>NRH ₹</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Choreo ₹</th>
                      <th style={thStyle}>Payment ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(b => {
                      const isLegacy = b.ticket_price == null
                      const tp = b.ticket_price ?? b.credits_paid ?? 0
                      return (
                        <tr key={b.id} style={{ background: isLegacy ? '#fefcf9' : 'white' }}>
                          <td style={tdStyle(isLegacy)}>{new Date(b.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                          <td style={tdStyle(isLegacy)}>
                            <div style={{ fontWeight: 600 }}>{b.sessions?.title || '—'}</div>
                            <div style={{ fontSize: 11, color: '#a09890' }}>{b.choreoProfile?.full_name || ''}</div>
                          </td>
                          <td style={tdStyle(isLegacy)}>{b.learnerProfile?.email || b.learnerProfile?.full_name || '—'}</td>
                          <td style={{ ...tdStyle(isLegacy), textAlign: 'right' }}>{1}</td>
                          <td style={{ ...tdStyle(isLegacy), textAlign: 'right', fontWeight: 600 }}>₹{tp.toLocaleString('en-IN')}{isLegacy && <span title="Pre-revenue system booking" style={{ marginLeft: 3, fontSize: 10 }}>*</span>}</td>
                          <td style={{ ...tdStyle(isLegacy), textAlign: 'right' }}>₹{(b.gateway_fee || 0).toLocaleString('en-IN')}</td>
                          <td style={{ ...tdStyle(isLegacy), textAlign: 'right' }}>₹{(b.nrh_share || 0).toLocaleString('en-IN')}</td>
                          <td style={{ ...tdStyle(isLegacy), textAlign: 'right', color: isLegacy ? '#a09890' : '#1a7a3c', fontWeight: 600 }}>₹{(b.choreo_share || 0).toLocaleString('en-IN')}</td>
                          <td style={{ ...tdStyle(isLegacy), fontFamily: 'monospace', fontSize: 11 }}>{b.razorpay_payment_id || 'N/A'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#faf7f2', borderTop: '2px solid #e2dbd4' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 13, color: '#0f0c0c' }} colSpan={3}>
                        Total ({filtered.length} bookings)
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{totals.tickets}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>₹{totals.ticketPrice.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>₹{totals.gatewayFee.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>₹{totals.nrhShare.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#1a7a3c' }}>₹{totals.choreoShare.toLocaleString('en-IN')}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
                {filtered.some(b => b.ticket_price == null) && (
                  <div style={{ fontSize: 11, color: '#a09890', marginTop: 8 }}>
                    * Rows marked with * are pre-revenue-system bookings. ticket_price shows credits_paid.
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Policy Edit Modal */}
      {editPolicy && (
        <PolicyEditModal
          policy={editPolicy}
          onClose={() => setEditPolicy(null)}
          onSave={handleSavePolicy}
          saving={saving}
        />
      )}
    </div>
  )
}

function PolicyEditModal({ policy, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    id: policy.id || null,
    name: policy.name || '',
    gateway_fee_pct: policy.gateway_fee_pct ?? 3,
    is_default: policy.is_default || false,
  })
  const [slabs, setSlabs] = useState(
    (policy.revenue_policy_slabs || policy.slabs || []).length > 0
      ? [...(policy.revenue_policy_slabs || policy.slabs)].sort((a, b) => a.sort_order - b.sort_order).map(s => ({
          from_student: s.from_student,
          to_student: s.to_student ?? '',
          mode: s.mode,
          value: s.value,
        }))
      : []
  )

  const inp = { background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', color: '#0f0c0c', boxSizing: 'border-box' }

  function addSlab() {
    const last = slabs[slabs.length - 1]
    const fromStudent = last ? (last.to_student ? Number(last.to_student) + 1 : 99) : 1
    setSlabs(s => [...s, { from_student: fromStudent, to_student: '', mode: 'percentage', value: 10 }])
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f0c0c', fontFamily: 'Georgia, serif', margin: 0 }}>
            {form.id ? 'Edit Policy' : 'New Revenue Policy'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#7a6e65' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, display: 'block' }}>Policy Name</label>
            <input style={{ ...inp, width: '100%' }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Standard" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, display: 'block' }}>Gateway Fee %</label>
              <input type="number" style={{ ...inp, width: '100%' }} value={form.gateway_fee_pct} onChange={e => setForm(f => ({ ...f, gateway_fee_pct: Number(e.target.value) }))} min="0" step="0.01" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', paddingTop: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#0f0c0c' }}>
                <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
                Set as default policy
              </label>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1 }}>NRH Share Slabs</label>
              <button type="button" onClick={addSlab}
                style={{ background: '#faf7f2', border: '1px solid #c8430a', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#c8430a', fontWeight: 600, cursor: 'pointer' }}>
                + Add slab
              </button>
            </div>
            {slabs.length === 0 && (
              <div style={{ fontSize: 12, color: '#a09890', padding: '8px 0' }}>No slabs — NRH share will be ₹0</div>
            )}
            {slabs.map((slab, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, color: '#7a6e65', marginBottom: 2 }}>From student</div>
                  <input type="number" style={{ ...inp, width: '100%' }} value={slab.from_student}
                    onChange={e => setSlabs(s => s.map((x, j) => j === i ? { ...x, from_student: Number(e.target.value) } : x))} min="1" />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#7a6e65', marginBottom: 2 }}>To student (blank=∞)</div>
                  <input type="number" style={{ ...inp, width: '100%' }} value={slab.to_student ?? ''}
                    onChange={e => setSlabs(s => s.map((x, j) => j === i ? { ...x, to_student: e.target.value === '' ? '' : Number(e.target.value) } : x))} min="1" />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#7a6e65', marginBottom: 2 }}>Mode</div>
                  <select style={{ ...inp, width: '100%' }} value={slab.mode}
                    onChange={e => setSlabs(s => s.map((x, j) => j === i ? { ...x, mode: e.target.value } : x))}>
                    <option value="flat">Flat ₹</option>
                    <option value="percentage">Percentage %</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#7a6e65', marginBottom: 2 }}>{slab.mode === 'flat' ? 'Amount (₹)' : 'Percentage (%)'}</div>
                  <input type="number" style={{ ...inp, width: '100%' }} value={slab.value}
                    onChange={e => setSlabs(s => s.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x))} min="0" step="0.01" />
                </div>
                <button type="button" onClick={() => setSlabs(s => s.filter((_, j) => j !== i))}
                  style={{ background: 'transparent', border: 'none', color: '#cc0000', fontSize: 18, cursor: 'pointer', paddingTop: 16 }}>×</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={onClose}
              style={{ flex: 1, background: 'transparent', border: '1px solid #e2dbd4', color: '#7a6e65', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              Cancel
            </button>
            <button onClick={() => onSave(form, slabs)} disabled={!form.name || saving}
              style={{ flex: 2, background: '#c8430a', color: 'white', border: 'none', padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving || !form.name ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Policy →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
