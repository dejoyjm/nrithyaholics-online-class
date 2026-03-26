# Handoff: Pre-Session 23

**Date:** 2026-03-27
**Branch:** master
**Last commit:** `5ea50c6` — fix: smarter isIST() using UTC offset + fix getTimezoneCode IST label

---

## What was built in Sessions 21–22

### Revenue Share System (Session 22)

**New DB tables (migrations applied):**
- `revenue_policies` — named policies with `gateway_fee_pct`, `is_default`
- `revenue_policy_slabs` — progressive slabs per policy (`from_student`, `to_student`, `mode` flat/pct, `value`)
- `pricing_rules` — early bird / sale pricing per session (`label`, `price`, `valid_until`, `max_tickets`, `sort_order`)
- Columns added: `sessions.revenue_policy_id`, `profiles.revenue_policy_id`, `bookings.ticket_price`, `bookings.gateway_fee`, `bookings.nrh_share`, `bookings.choreo_share`, `bookings.policy_id`, `bookings.policy_snapshot`

**`frontend/src/utils/revenue.js`** — pure math utility:
- `resolvePolicy(session, choreographerProfile, policies)` — priority: session > choreo > default
- `calculateNRHShare(studentCount, ticketPrice, slabs)` — progressive slab engine
- `calculateGatewayFee(ticketPrice, gatewayFeePct)`
- `calculateBookingBreakdown`, `calculateSessionSettlement`, `calculateSlabBreakdown`

**SessionPage changes:**
- Fetches `revenue_policies` and `pricing_rules` in parallel with session data
- `resolveActivePrice(session, pricingRules)` — picks active early bird rule
- Computed vars: `currentTierPrice`, `gatewayFeePerSeat`, `totalChargedPerSeat`, `totalChargedAmount`
- Fee breakdown box shown before Book Now button (ticket + gateway + total)
- Strike-through base price when active pricing rule applies

**ChoreoPage changes:**
- Fetches `revenue_policies` on mount
- `getActiveRule(s)` helper for pricing rule resolution
- `getSessionEarnings(s)` using `calculateSessionSettlement(...).choreoShare`
- Session cards show `Est. earnings: ₹X` and early bird badge when rule active
- Stats strip shows real choreo share estimate
- SessionModal: Pricing Rules section (label, price, valid_until, max_tickets per rule)

**AdminPage Revenue tab:**
- Section A: Policy list, create/edit/delete policies with `PolicyEditModal`, slab editor, assign policy to choreo or session
- Section B: Revenue simulator (policy + price + student count inputs, per-slab breakdown table)
- Section C: Booking Audit table — all bookings with financials, filter by choreo/session, CSV export

**verify-payment edge function:**
- After booking creation, fetches policy + slabs, computes marginal NRH/choreo share, updates booking with full financial snapshot

### Timezone Awareness (Session 21)

- `isIST()` uses UTC offset check (not Intl API) — reliable on all devices
- Non-IST users see banner + session times shown in both IST and local time
- Scheduling guard blocks non-IST users from booking (sessions are IST-based)
- Navbar shows timezone indicator

---

## Known Bugs Going into Session 23

### 1. Gateway fee not confirmed to be added to Razorpay amount

**Symptoms:** Learner may be charged only the base ticket price, not ticket + gateway fee.

**Analysis done:**
- `create-razorpay-order` edge function is correct: takes `amount_inr`, multiplies by 100 for paise. Architecture is sound.
- The risk point: if `revPolicy` is `null` when `handleBook` fires (race condition or RLS issue), `gatewayFeePct` falls back to 3 but the displayed fee may not match what's actually passed.
- Debug logging has NOT been added yet — this is the first task for Session 23.

**Likely root causes to rule out:**
1. `revPolicy` is null at time of booking → fallback to 3% fires, but displayed correctly?
2. `currentTierPrice` vs `baseTierPrice` mismatch when early bird active
3. The display shows fee but `handleBook` was not updated to use `totalChargedAmount`

---

## Session 23 Plan

### Bug Fix
- Add `console.log` debug in `handleBook` at each step: `currentTierPrice`, `gatewayFeePct`, `gatewayFeePerSeat`, `totalChargedPerSeat`, `totalChargedAmount`, `razorpayAmount`
- Fee breakdown box: only render when `gatewayFeePerSeat > 0`; keep styling light grey, non-alarming

### Improvements
1. **AdminPage Booking Audit** — date range filter (From/To), summary stat cards (total sessions, total revenue) above table, default sort descending by date
2. **SessionPage fee breakdown** — only show when fee > 0, styling must not alarm learner
3. **ChoreoPage early bird badge** — show expiry date ("expires Mar 30") or remaining ticket count ("3 of 5 left")
4. **AdminPage Revenue Simulator** — "Compare policies" toggle showing two policy columns side by side

---

## File Map

| File | Status |
|---|---|
| `frontend/src/utils/revenue.js` | Stable — pure math, no side effects |
| `frontend/src/pages/SessionPage.jsx` | Has fee breakdown logic; `handleBook` to be confirmed |
| `frontend/src/pages/ChoreoPage.jsx` | Has pricing rules + earnings; badge to be improved |
| `frontend/src/pages/AdminPage.jsx` | Revenue tab complete; audit + simulator to be improved |
| `supabase/functions/verify-payment/index.ts` | Has financial snapshot logic |
| `supabase/functions/create-razorpay-order/index.ts` | Correct — no changes needed |

---

## Constraints (unchanged)

- Learners see ONLY: ticket price + gateway fee + total. No NRH details.
- Choreographers see ONLY: booking count + their choreo share. No NRH details.
- Admin sees everything.
- `policy_snapshot` on bookings is immutable.
- All monetary values in whole rupees (paise only inside edge functions for Razorpay API).
- Do NOT touch `ClassroomPage.jsx` or music bot files.
