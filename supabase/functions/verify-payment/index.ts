// supabase/functions/verify-payment/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Revenue calculation helpers ───────────────────────────────
function calculateNRHShare(studentCount: number, ticketPrice: number, slabs: any[]): number {
  if (!slabs || slabs.length === 0) return 0
  const sorted = [...slabs].sort((a, b) => a.sort_order - b.sort_order)
  let nrhShare = 0
  for (const slab of sorted) {
    const slabFrom = slab.from_student
    const slabTo = slab.to_student
    const slabEnd = slabTo ?? Infinity
    if (studentCount < slabFrom) break
    const studentsInSlab = Math.min(studentCount, slabEnd) - slabFrom + 1
    if (slab.mode === 'flat') {
      nrhShare += Number(slab.value)
    } else {
      const slabRevenue = studentsInSlab * ticketPrice
      nrhShare += slabRevenue * (Number(slab.value) / 100)
    }
    if (slabTo === null || slabTo === undefined || studentCount <= slabEnd) break
  }
  return Math.round(nrhShare)
}

// ── Email helper ─────────────────────────────────────────────
// Sends booking confirmation via Resend. Fire-and-forget —
// never throws, never blocks the booking success response.
async function sendBookingConfirmationEmail(
  toEmail: string,
  toName: string,
  sessionTitle: string,
  scheduledAt: string,
  durationMinutes: number,
  amountInr: number,
  seats: number,
  choreographerName: string,
  sessionId: string,
) {
  try {
    const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')
    const RESEND_FROM      = Deno.env.get('RESEND_FROM_EMAIL') || 'bookings@nrithyaholics.in'
    const APP_URL          = 'https://online.nrithyaholics.in'

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not set — skipping confirmation email')
      return
    }

    // Format the session date/time in IST-friendly format
    const sessionDate = new Date(scheduledAt)
    const dateStr = sessionDate.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Asia/Kolkata',
    })
    const timeStr = sessionDate.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Kolkata',
    })
    const endTime = new Date(sessionDate.getTime() + durationMinutes * 60 * 1000)
    const endTimeStr = endTime.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Kolkata',
    })

    const sessionUrl = `${APP_URL}/?session=${sessionId}`

    // Google Calendar date format: YYYYMMDDTHHmmssZ
    const gcalStart = sessionDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const gcalEnd   = endTime.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const firstName  = toName?.split(' ')[0] || 'there'

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#f5f1ee; font-family: Arial, sans-serif;">

<div style="max-width:520px; margin:32px auto; background:white; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08);">

  <!-- Header -->
  <div style="background:#0f0c0c; padding:24px 32px;">
    <div style="font-size:22px; font-weight:900; color:#faf7f2;">
      Nrithya<span style="color:#c8430a;">Holics</span>
      <span style="font-size:13px; font-weight:400; color:#7a6e65; margin-left:6px;">Online</span>
    </div>
  </div>

  <!-- Green confirmation bar -->
  <div style="background:#052e16; padding:16px 32px; display:flex; align-items:center; gap:12px;">
    <span style="font-size:24px;">✅</span>
    <div>
      <div style="font-size:16px; font-weight:700; color:#86efac;">Booking Confirmed!</div>
      <div style="font-size:13px; color:#4ade80;">Your spot is secured.</div>
    </div>
  </div>

  <!-- Body -->
  <div style="padding:32px;">

    <p style="font-size:16px; color:#0f0c0c; margin:0 0 24px;">
      Hi ${firstName} 👋
    </p>

    <p style="font-size:15px; color:#3a3330; line-height:1.6; margin:0 0 28px;">
      You're all set for your class. Here are your booking details:
    </p>

    <!-- Session details card -->
    <div style="background:#faf7f2; border:1px solid #e2dbd4; border-radius:12px; padding:20px; margin-bottom:28px;">
      <div style="font-size:18px; font-weight:800; color:#0f0c0c; margin-bottom:4px; font-family:Georgia,serif;">
        ${sessionTitle}
      </div>
      <div style="font-size:13px; color:#7a6e65; margin-bottom:16px;">
        with ${choreographerName}
      </div>

      <table style="width:100%; border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0; font-size:13px; color:#7a6e65; width:40%;">📅 Date</td>
          <td style="padding:6px 0; font-size:13px; color:#0f0c0c; font-weight:600;">${dateStr}</td>
        </tr>
        <tr>
          <td style="padding:6px 0; font-size:13px; color:#7a6e65;">⏰ Time</td>
          <td style="padding:6px 0; font-size:13px; color:#0f0c0c; font-weight:600;">${timeStr} – ${endTimeStr} IST</td>
        </tr>
        <tr>
          <td style="padding:6px 0; font-size:13px; color:#7a6e65;">🎟️ Seats</td>
          <td style="padding:6px 0; font-size:13px; color:#0f0c0c; font-weight:600;">${seats} seat${seats > 1 ? 's' : ''}</td>
        </tr>
        <tr>
          <td style="padding:6px 0; font-size:13px; color:#7a6e65;">💳 Paid</td>
          <td style="padding:6px 0; font-size:13px; color:#0f0c0c; font-weight:600;">₹${amountInr}</td>
        </tr>
      </table>
    </div>

    <!-- Join link coming notice -->
    <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:20px 24px; margin-bottom:24px; text-align:center;">
      <div style="font-size:20px; margin-bottom:8px;">🔔</div>
      <div style="font-size:15px; font-weight:700; color:#0c4a6e; margin-bottom:6px;">
        Your join link is on its way
      </div>
      <div style="font-size:13px; color:#0369a1; line-height:1.6;">
        We'll email you a one-tap join link when the class opens,<br/>
        <strong>5 minutes before it starts.</strong>
      </div>
    </div>

    <!-- Action buttons -->
    <div style="max-width:400px; margin:0 auto 24px;">
      <a href="${APP_URL}/?test=1"
         style="display:block; background:#c8430a; color:white; text-decoration:none;
                padding:16px; border-radius:8px; font-size:14px; font-weight:700;
                text-align:center; margin-bottom:8px;">
        🎤 Test Your Camera &amp; Mic
        <div style="font-size:12px; font-weight:400; margin-top:4px; opacity:0.85;">
          Takes 30 seconds — do this a day before class
        </div>
      </a>
      <a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(sessionTitle)}&dates=${gcalStart}/${gcalEnd}&details=Join+your+NrithyaHolics+class+at+${encodeURIComponent(sessionUrl)}&location=online.nrithyaholics.in"
         target="_blank"
         style="display:block; background:white; color:#3a2e2e; text-decoration:none;
                padding:16px; border-radius:8px; font-size:14px; font-weight:600;
                text-align:center; border:1px solid #e2dbd4;">
        📅 Add to Google Calendar
      </a>
    </div>

    <!-- Tips box -->
    <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:16px; margin-bottom:28px;">
      <div style="font-size:13px; color:#78350f; line-height:1.7;">
        <strong>📌 Before your class:</strong><br/>
        • Please mute your mic when you join<br/>
        • Find a space with enough room to move freely<br/>
        • Join from a device with a stable internet connection
      </div>
    </div>

    <p style="font-size:14px; color:#3a3330; line-height:1.6; margin:0 0 8px;">
      Questions? We're here to help.
    </p>

  </div>

  <!-- Footer -->
  <div style="background:#faf7f2; border-top:1px solid #e2dbd4; padding:20px 32px;">
    <p style="font-size:13px; font-weight:700; color:#0f0c0c; margin:0 0 4px;">NrithyaHolics Online</p>
    <p style="font-size:12px; color:#7a6e65; line-height:1.8; margin:0;">
      Dance has no address.<br/>
      Live classes with India's finest dance artists — from wherever you are.<br/><br/>
      💬 <a href="https://wa.me/916238186174" style="color:#c8430a; text-decoration:none;">WhatsApp us</a>
      &nbsp;·&nbsp;
      📸 <a href="https://instagram.com/nrithyaholics" style="color:#c8430a; text-decoration:none;">@nrithyaholics</a>
      &nbsp;·&nbsp;
      🌐 <a href="https://online.nrithyaholics.in" style="color:#c8430a; text-decoration:none;">online.nrithyaholics.in</a>
    </p>
  </div>

</div>
</body>
</html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `NrithyaHolics Online <${RESEND_FROM}>`,
        to:   [toEmail],
        subject: `Confirmed: ${sessionTitle} on ${dateStr}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Resend error:', err)
      return false
    }
    console.log('Booking confirmation email sent to:', toEmail)
    return true
  } catch (err) {
    // Never block the booking response due to email failure
    console.error('sendBookingConfirmationEmail failed silently:', err)
    return false
  }
}

// ── Admin notification email ──────────────────────────────────
// Fires on every booking attempt (success or failure). Never throws.
async function sendAdminNotification(opts: {
  resendApiKey: string
  success: boolean
  learnerName: string
  learnerEmail: string
  sessionTitle: string
  scheduledAt?: string
  amountInr: number
  paymentId: string
  orderId: string
  sessionId: string
  errorMessage?: string
}) {
  try {
    if (!opts.resendApiKey) return
    const nowStr = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric',
      month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    })
    const row = (label: string, value: string) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap;"><b>${label}</b></td><td style="padding:4px 0;">${value}</td></tr>`

    let subject: string
    let html: string

    if (opts.success) {
      const dateStr = opts.scheduledAt
        ? new Date(opts.scheduledAt).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric',
            month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
          }) + ' IST'
        : 'N/A'
      subject = `✅ New booking — ${opts.learnerName} for ${opts.sessionTitle}`
      html = `<html><body style="font-family:Arial,sans-serif;padding:24px;background:#f5f5f5;">
<div style="max-width:520px;background:white;border-radius:12px;padding:24px;border-top:4px solid #166534;">
<h2 style="color:#166534;margin:0 0 16px;">✅ New Booking Confirmed</h2>
<table style="border-collapse:collapse;width:100%;font-size:14px;">
${row('Student', `${opts.learnerName} (${opts.learnerEmail})`)}
${row('Session', opts.sessionTitle)}
${row('Date', dateStr)}
${row('Amount', `₹${opts.amountInr}`)}
${row('Payment ID', opts.paymentId)}
${row('Order ID', opts.orderId)}
${row('Time', `${nowStr} IST`)}
${row('Status', '<b style="color:#166534;">CONFIRMED ✅</b>')}
</table></div></body></html>`
    } else {
      subject = `❌ Booking FAILED — ${opts.paymentId} — ${opts.sessionTitle}`
      html = `<html><body style="font-family:Arial,sans-serif;padding:24px;background:#f5f5f5;">
<div style="max-width:520px;background:white;border-radius:12px;padding:24px;border-top:4px solid #991b1b;">
<h2 style="color:#991b1b;margin:0 0 8px;">❌ Booking FAILED</h2>
<p style="color:#991b1b;font-weight:bold;margin:0 0 16px;">Payment captured but booking insert failed.<br/>ACTION NEEDED: Manual booking required.</p>
<table style="border-collapse:collapse;width:100%;font-size:14px;">
${row('Payment ID', opts.paymentId)}
${row('Order ID', opts.orderId)}
${row('Error', opts.errorMessage || 'unknown')}
${row('Student email', opts.learnerEmail || 'N/A')}
${row('Session ID', opts.sessionId)}
${row('Time', `${nowStr} IST`)}
</table></div></body></html>`
    }

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${opts.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'NrithyaHolics Online <bookings@nrithyaholics.in>',
        to: ['nrithyaholics@gmail.com'],
        subject,
        html,
      }),
    })
  } catch (err) {
    console.error('sendAdminNotification failed silently:', err)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      session_id,
      seats,
      amount_inr,
      ticket_price,
      user_id,
    } = await req.json()

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !session_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required payment fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (user_id && !UUID_REGEX.test(user_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify HMAC signature
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
    const body = `${razorpay_order_id}|${razorpay_payment_id}`

    const encoder    = new TextEncoder()
    const keyData    = encoder.encode(keySecret)
    const messageData = encoder.encode(body)

    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
    const signatureArray  = Array.from(new Uint8Array(signatureBuffer))
    const expectedSignature = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('')

    if (expectedSignature !== razorpay_signature) {
      console.error('Signature mismatch', { expected: expectedSignature, got: razorpay_signature })
      return new Response(
        JSON.stringify({ error: 'Payment signature verification failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // ── Resolve user identity ─────────────────────────────────────────────────
    // user_id from the request body is the primary identifier. It is set at
    // payment initiation (before Razorpay modal opens) from the live React state,
    // so it is always valid even when the JWT has since expired.
    // Email is fetched best-effort from the token; if the token is expired we
    // fall back to the admin API using user_id — no 401 for expired tokens.
    const authHeader = req.headers.get('Authorization')
    let resolvedUserId: string
    let resolvedEmail: string = ''

    if (user_id) {
      resolvedUserId = user_id
      // Best-effort: get email from JWT (may be expired — that's OK)
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '')
        const { data: { user: tokenUser } } = await supabase.auth.getUser(token)
        if (tokenUser?.email) resolvedEmail = tokenUser.email
      }
      // Fallback: look up email via admin API when token is expired/missing
      if (!resolvedEmail) {
        const { data: adminUser } = await supabase.auth.admin.getUserById(user_id)
        if (adminUser?.user?.email) resolvedEmail = adminUser.user.email
      }
    } else {
      // Legacy path — no user_id in body; token must be valid
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Not authenticated' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid auth token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      resolvedUserId = user.id
      resolvedEmail  = user.email || ''
    }

    if (!resolvedUserId) {
      return new Response(
        JSON.stringify({ error: 'Could not resolve user identity' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check not already booked
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('session_id', session_id)
      .eq('booked_by', resolvedUserId)
      .eq('status', 'confirmed')
      .maybeSingle()

    if (existing) {
      return new Response(
        JSON.stringify({ success: true, booking_id: existing.id, already_existed: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        session_id,
        booked_by: resolvedUserId,
        credits_paid: amount_inr,
        status: 'confirmed',
        razorpay_order_id,
        razorpay_payment_id,
      })
      .select()
      .single()

    if (bookingError) {
      console.error('Booking insert failed:', bookingError)
      const adminFailPromise = sendAdminNotification({
        resendApiKey: Deno.env.get('RESEND_API_KEY') || '',
        success: false,
        learnerName: resolvedEmail?.split('@')[0] || 'unknown',
        learnerEmail: resolvedEmail,
        sessionTitle: session_id,
        amountInr: amount_inr,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        sessionId: session_id,
        errorMessage: bookingError.message,
      })
      try {
        // @ts-ignore
        EdgeRuntime.waitUntil(adminFailPromise)
      } catch {
        await adminFailPromise
      }
      return new Response(
        JSON.stringify({ error: 'Failed to create booking: ' + bookingError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Compute and store financial breakdown ─────────────────────
    // Fire-and-forget: never blocks the booking success response
    const financialsPromise = (async () => {
      try {
        console.log('[financials] starting', { session_id, booking_id: booking.id })
        // Fetch session info + all policies
        const [sessionPolicyRes, policiesRes, bookingCountRes] = await Promise.all([
          supabase.from('sessions')
            .select('revenue_policy_id, choreographer_id, price_tiers')
            .eq('id', session_id).single(),
          supabase.from('revenue_policies').select('*, revenue_policy_slabs(*)'),
          supabase.from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session_id).eq('status', 'confirmed'),
        ])

        const sessionInfo = sessionPolicyRes.data
        const policies = policiesRes.data || []

        // Resolve policy: session > choreo > default
        let resolvedPolicy: any = null
        if (sessionInfo?.revenue_policy_id) {
          resolvedPolicy = policies.find((p: any) => p.id === sessionInfo.revenue_policy_id)
        }
        if (!resolvedPolicy && sessionInfo?.choreographer_id) {
          const { data: choreoProfile } = await supabase
            .from('profiles').select('revenue_policy_id')
            .eq('id', sessionInfo.choreographer_id).single()
          if (choreoProfile?.revenue_policy_id) {
            resolvedPolicy = policies.find((p: any) => p.id === choreoProfile.revenue_policy_id)
          }
        }
        if (!resolvedPolicy) {
          resolvedPolicy = policies.find((p: any) => p.is_default) || policies[0] || null
        }

        const slabs: any[] = resolvedPolicy?.revenue_policy_slabs || []

        // Resolve ticket price: from request or fallback to session price_tiers
        const sessionSeats = seats || 1
        const ticketPricePerSeat: number = ticket_price
          || sessionInfo?.price_tiers?.[0]?.price
          || Math.round(amount_inr / sessionSeats)

        const gatewayFeePct: number = resolvedPolicy?.gateway_fee_pct ?? 3
        const gatewayFeePerSeat = Math.round(ticketPricePerSeat * gatewayFeePct / 100)

        // Marginal NRH share for this booking (current count includes this booking)
        const currentCount: number = bookingCountRes.count || 1
        const prevCount = Math.max(0, currentCount - sessionSeats)
        const nrhForCurrent = calculateNRHShare(currentCount, ticketPricePerSeat, slabs)
        const nrhForPrev = calculateNRHShare(prevCount, ticketPricePerSeat, slabs)
        const marginalNrhShare = nrhForCurrent - nrhForPrev
        const choreoShareForBooking = ticketPricePerSeat * sessionSeats - marginalNrhShare

        const policySnapshot = resolvedPolicy
          ? { ...resolvedPolicy, revenue_policy_slabs: slabs }
          : null

        console.log('[financials] computed', {
          ticketPricePerSeat, gatewayFeePerSeat, marginalNrhShare, choreoShareForBooking,
          policyName: resolvedPolicy?.name || 'none', currentCount,
        })
        const { error: finUpdateError } = await supabase.from('bookings').update({
          ticket_price: ticketPricePerSeat * sessionSeats,
          gateway_fee: gatewayFeePerSeat * sessionSeats,
          nrh_share: marginalNrhShare,
          choreo_share: choreoShareForBooking,
          policy_id: resolvedPolicy?.id || null,
          policy_snapshot: policySnapshot,
        }).eq('id', booking.id)
        if (finUpdateError) {
          console.error('[financials] update failed', finUpdateError)
        } else {
          console.log('[financials] update ok', booking.id)
        }
      } catch (err) {
        console.error('Financial breakdown update failed silently:', err)
      }
    })()
    try {
      // @ts-ignore
      EdgeRuntime.waitUntil(financialsPromise)
    } catch {
      financialsPromise.catch(() => {})
    }

    // Increment bookings_count on session
    await supabase.rpc('increment_bookings_count', { session_id_input: session_id, seats_input: seats })

    // ── Send booking confirmation email (fire-and-forget) ────────
    // Fetch session + choreographer + user profile for email content.
    // All failures are caught inside sendBookingConfirmationEmail —
    // they never affect the booking success response.
    const [sessionRes, profileRes] = await Promise.all([
      supabase
        .from('sessions')
        .select('title, scheduled_at, duration_minutes, choreographer_id')
        .eq('id', session_id)
        .single(),
      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', resolvedUserId)
        .single(),
    ])

    const sessionData     = sessionRes.data
    const learnerName     = profileRes.data?.full_name || resolvedEmail?.split('@')[0] || 'there'
    let choreographerName = 'your choreographer'

    if (sessionData?.choreographer_id) {
      const { data: choreoProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', sessionData.choreographer_id)
        .single()
      if (choreoProfile?.full_name) choreographerName = choreoProfile.full_name
    }

    if (sessionData && resolvedEmail) {
      // Use EdgeRuntime.waitUntil so Supabase keeps the function alive
      // long enough for the email fetch to complete, without delaying
      // the response back to the user.
      const emailAndStampPromise = (async () => {
        const sent = await sendBookingConfirmationEmail(
          resolvedEmail,
          learnerName,
          sessionData.title,
          sessionData.scheduled_at,
          sessionData.duration_minutes || 60,
          amount_inr,
          seats || 1,
          choreographerName,
          session_id,
        )
        if (sent) {
          await supabase.from('bookings')
            .update({ confirmation_email_sent_at: new Date().toISOString() })
            .eq('razorpay_order_id', razorpay_order_id)
            .eq('status', 'confirmed')
        }
      })()
      const adminPromise = sendAdminNotification({
        resendApiKey: Deno.env.get('RESEND_API_KEY') || '',
        success: true,
        learnerName,
        learnerEmail: resolvedEmail,
        sessionTitle: sessionData.title,
        scheduledAt: sessionData.scheduled_at,
        amountInr: amount_inr,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        sessionId: session_id,
      })
      try {
        // @ts-ignore — EdgeRuntime is available in Supabase Deno environment
        EdgeRuntime.waitUntil(Promise.all([emailAndStampPromise, adminPromise]))
      } catch {
        // EdgeRuntime not available in local dev — just await directly
        await Promise.all([emailAndStampPromise, adminPromise])
      }
    }

    // ── Late booking: if join window already open, send join link immediately ──
    // e.g. someone books 4 mins before class — cron already fired, won't catch them
    const preJoinMins = sessionData.guest_pre_join_minutes_override ?? 5
    const windowOpenTime = new Date(sessionData.scheduled_at).getTime() - (preJoinMins * 60 * 1000)
    if (Date.now() >= windowOpenTime) {
      const joinLinkPromise = (async () => {
        try {
          await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-join-links`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                session_id,
                single_user_email: resolvedEmail,
              }),
            }
          )
        } catch (err) {
          console.error('Late join link send failed:', err)
        }
      })()
      try {
        // @ts-ignore
        EdgeRuntime.waitUntil(joinLinkPromise)
      } catch {
        joinLinkPromise.catch(() => {})
      }
    }

    return new Response(
      JSON.stringify({ success: true, booking_id: booking.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})