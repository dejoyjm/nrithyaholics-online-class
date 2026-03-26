// Resolve active pricing rule for a session
// Returns { price, label } — first non-expired, non-sold-out rule wins
// Falls back to session's first price tier if no rule applies
export function resolveActivePrice(session, pricingRules) {
  const now = new Date()
  const confirmedBookings = session?.bookings_count || 0
  for (const rule of (pricingRules || [])) {
    if (rule.valid_until && new Date(rule.valid_until) < now) continue
    if (rule.max_tickets != null && confirmedBookings >= rule.max_tickets) continue
    return { price: rule.price, label: rule.label }
  }
  return { price: session?.price_tiers?.[0]?.price || 0, label: null }
}

// Resolve which policy applies to a session
// Priority: session policy > choreographer policy > default
export function resolvePolicy(session, choreographerProfile, policies) {
  if (!policies || policies.length === 0) return null
  if (session?.revenue_policy_id) {
    const p = policies.find(p => p.id === session.revenue_policy_id)
    if (p) return p
  }
  if (choreographerProfile?.revenue_policy_id) {
    const p = policies.find(p => p.id === choreographerProfile.revenue_policy_id)
    if (p) return p
  }
  return policies.find(p => p.is_default) || policies[0]
}

// Calculate NRH share given policy slabs and booking count
// Slabs are progressive — each slab only charges on students within it
// Flat mode: fixed amount for the entire slab regardless of student count
// Percentage mode: % of (students_in_slab × ticket_price)
export function calculateNRHShare(studentCount, ticketPrice, slabs) {
  if (!slabs || slabs.length === 0) return 0

  // Sort slabs by sort_order
  const sorted = [...slabs].sort((a, b) => a.sort_order - b.sort_order)

  let nrhShare = 0

  for (const slab of sorted) {
    const slabFrom = slab.from_student  // e.g. 1
    const slabTo = slab.to_student      // e.g. 10, or null for unlimited

    // How many students fall in this slab?
    const slabEnd = slabTo ?? Infinity

    if (studentCount < slabFrom) break  // haven't reached this slab

    // Students within this slab
    const studentsInSlab = Math.min(studentCount, slabEnd) - slabFrom + 1

    if (slab.mode === 'flat') {
      // Flat amount for entire slab — applies even if only 1 student in slab
      nrhShare += Number(slab.value)
    } else {
      // Percentage of revenue within this slab
      const slabRevenue = studentsInSlab * ticketPrice
      nrhShare += slabRevenue * (Number(slab.value) / 100)
    }

    if (slabTo === null || slabTo === undefined || studentCount <= slabEnd) break
  }

  return Math.round(nrhShare)
}

// Calculate gateway fee (on ticket price only, not added fees)
export function calculateGatewayFee(ticketPrice, gatewayFeePct) {
  return Math.round(ticketPrice * gatewayFeePct / 100)
}

// Full breakdown for one booking (per seat)
export function calculateBookingBreakdown(ticketPrice, gatewayFeePct) {
  const gatewayFee = calculateGatewayFee(ticketPrice, gatewayFeePct)
  const totalCharged = ticketPrice + gatewayFee
  return { ticketPrice, gatewayFee, totalCharged }
}

// Full settlement breakdown for a session
export function calculateSessionSettlement(
  bookingCount, ticketPrice, policy, slabs
) {
  if (!policy || bookingCount <= 0) {
    return {
      bookingCount,
      ticketPrice,
      grossRevenue: bookingCount * ticketPrice,
      totalGatewayFees: 0,
      netRevenue: bookingCount * ticketPrice,
      nrhShare: 0,
      choreoShare: bookingCount * ticketPrice,
    }
  }
  const grossRevenue = bookingCount * ticketPrice
  const totalGatewayFees = bookingCount *
    calculateGatewayFee(ticketPrice, policy.gateway_fee_pct)
  const nrhShare = calculateNRHShare(bookingCount, ticketPrice, slabs)
  const choreoShare = grossRevenue - nrhShare

  return {
    bookingCount,
    ticketPrice,
    grossRevenue,
    totalGatewayFees,
    netRevenue: grossRevenue,  // gateway fee not deducted from net
    nrhShare,
    choreoShare,
  }
}

// Per-slab breakdown for the simulator
export function calculateSlabBreakdown(studentCount, ticketPrice, slabs) {
  if (!slabs || slabs.length === 0) return []

  const sorted = [...slabs].sort((a, b) => a.sort_order - b.sort_order)
  const result = []

  for (const slab of sorted) {
    const slabFrom = slab.from_student
    const slabTo = slab.to_student
    const slabEnd = slabTo ?? Infinity

    if (studentCount < slabFrom) break

    const studentsInSlab = Math.min(studentCount, slabEnd) - slabFrom + 1
    let nrhAmount = 0

    if (slab.mode === 'flat') {
      nrhAmount = Number(slab.value)
    } else {
      const slabRevenue = studentsInSlab * ticketPrice
      nrhAmount = slabRevenue * (Number(slab.value) / 100)
    }

    result.push({
      label: `Slab ${slab.sort_order} (${slabFrom}–${slabTo ?? '∞'})`,
      mode: slab.mode,
      value: slab.value,
      studentsInSlab,
      slabRevenue: slab.mode === 'percentage' ? studentsInSlab * ticketPrice : null,
      nrhAmount: Math.round(nrhAmount),
    })

    if (slabTo === null || slabTo === undefined || studentCount <= slabEnd) break
  }

  return result
}
