// supabase/functions/verify-payment/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const sessionUrl = `${APP_URL}/#session-${sessionId}`
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

    <!-- Join button -->
    <div style="text-align:center; margin-bottom:28px;">
      <a href="${sessionUrl}"
         style="display:inline-block; background:#c8430a; color:white;
                text-decoration:none; padding:14px 36px; border-radius:10px;
                font-size:15px; font-weight:700;">
        🎬 Join Class
      </a>
      <p style="font-size:12px; color:#a09890; margin-top:10px;">
        The join button becomes active 5 minutes before class starts.
      </p>
    </div>

    <!-- Info box -->
    <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:16px; margin-bottom:28px;">
      <div style="font-size:13px; color:#78350f; line-height:1.7;">
        <strong>📌 Before your class:</strong><br/>
        • Test your camera and microphone at online.nrithyaholics.in<br/>
        • Join from a device with a stable internet connection<br/>
        • Find a space with enough room to move freely<br/>
        • You'll be muted on entry — unmute when asked
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
    } else {
      console.log('Booking confirmation email sent to:', toEmail)
    }
  } catch (err) {
    // Never block the booking response due to email failure
    console.error('sendBookingConfirmationEmail failed silently:', err)
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
    } = await req.json()

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !session_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required payment fields' }),
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

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // Get user from token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check not already booked
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('session_id', session_id)
      .eq('booked_by', user.id)
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
        booked_by: user.id,
        credits_paid: amount_inr,
        status: 'confirmed',
        razorpay_order_id,
        razorpay_payment_id,
      })
      .select()
      .single()

    if (bookingError) {
      console.error('Booking insert failed:', bookingError)
      return new Response(
        JSON.stringify({ error: 'Failed to create booking: ' + bookingError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
        .eq('id', user.id)
        .single(),
    ])

    const sessionData     = sessionRes.data
    const learnerName     = profileRes.data?.full_name || user.email?.split('@')[0] || 'there'
    let choreographerName = 'your choreographer'

    if (sessionData?.choreographer_id) {
      const { data: choreoProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', sessionData.choreographer_id)
        .single()
      if (choreoProfile?.full_name) choreographerName = choreoProfile.full_name
    }

    if (sessionData && user.email) {
      // Don't await — fire and forget so email never delays the response
      sendBookingConfirmationEmail(
        user.email,
        learnerName,
        sessionData.title,
        sessionData.scheduled_at,
        sessionData.duration_minutes || 60,
        amount_inr,
        seats || 1,
        choreographerName,
        session_id,
      )
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