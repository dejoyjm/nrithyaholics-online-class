import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Email helper (identical to verify-payment) ───────────────
// Sends booking confirmation via Resend. Never throws — email
// failure never affects booking creation.
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
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const RESEND_FROM    = Deno.env.get('RESEND_FROM_EMAIL') || 'bookings@nrithyaholics.in'
    const APP_URL        = 'https://online.nrithyaholics.in'

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not set — skipping confirmation email')
      return
    }

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

  <div style="background:#0f0c0c; padding:24px 32px;">
    <div style="font-size:22px; font-weight:900; color:#faf7f2;">
      Nrithya<span style="color:#c8430a;">Holics</span>
      <span style="font-size:13px; font-weight:400; color:#7a6e65; margin-left:6px;">Online</span>
    </div>
  </div>

  <div style="background:#052e16; padding:16px 32px; display:flex; align-items:center; gap:12px;">
    <span style="font-size:24px;">✅</span>
    <div>
      <div style="font-size:16px; font-weight:700; color:#86efac;">Booking Confirmed!</div>
      <div style="font-size:13px; color:#4ade80;">Your spot is secured.</div>
    </div>
  </div>

  <div style="padding:32px;">
    <p style="font-size:16px; color:#0f0c0c; margin:0 0 24px;">Hi ${firstName} 👋</p>
    <p style="font-size:15px; color:#3a3330; line-height:1.6; margin:0 0 28px;">
      You're all set for your class. Here are your booking details:
    </p>

    <div style="background:#faf7f2; border:1px solid #e2dbd4; border-radius:12px; padding:20px; margin-bottom:28px;">
      <div style="font-size:18px; font-weight:800; color:#0f0c0c; margin-bottom:4px; font-family:Georgia,serif;">
        ${sessionTitle}
      </div>
      <div style="font-size:13px; color:#7a6e65; margin-bottom:16px;">with ${choreographerName}</div>
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
      console.error('Resend error:', await res.text())
    } else {
      console.log('Webhook: booking confirmation email sent to:', toEmail)
    }
  } catch (err) {
    console.error('sendBookingConfirmationEmail (webhook) failed silently:', err)
  }
}

serve(async (req) => {
  try {
    // Razorpay sends webhook secret in header for verification
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')
    if (webhookSecret) {
      const signature = req.headers.get('x-razorpay-signature')
      if (!signature) {
        return new Response('Unauthorized', { status: 401 })
      }
      // Verify webhook signature
      const body = await req.text()
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(webhookSecret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      )
      const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
      const expectedSig = Array.from(new Uint8Array(sigBytes))
        .map(b => b.toString(16).padStart(2, '0')).join('')
      if (expectedSig !== signature) {
        return new Response('Invalid signature', { status: 401 })
      }
      var payload = JSON.parse(body)
    } else {
      var payload = await req.json()
    }

    if (payload.event !== 'payment.captured') {
      return new Response('OK', { status: 200 })
    }

    const payment = payload.payload?.payment?.entity
    if (!payment) {
      return new Response('OK', { status: 200 })
    }

    const order_id   = payment.order_id
    const payment_id = payment.id
    const notes      = payment.notes || {}
    const session_id = notes.session_id
    const seats      = parseInt(notes.seats || '1')
    const amount_inr = payment.amount / 100

    if (!session_id || !order_id) {
      console.error('Missing session_id or order_id in payment notes')
      return new Response('OK', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // Check if booking already exists (created by verify-payment)
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('razorpay_order_id', order_id)
      .maybeSingle()

    if (existing) {
      console.log('Booking already exists for order:', order_id)
      return new Response('OK', { status: 200 })
    }

    // Booking missing — webhook beat the frontend. Create it now.
    const userEmail = payment.email
    if (!userEmail) {
      console.error('No email in payment, cannot create booking')
      return new Response('OK', { status: 200 })
    }

    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers()
    if (userError) {
      console.error('Failed to list users:', userError)
      return new Response('OK', { status: 200 })
    }

    const matchedUser = users.find(u => u.email === userEmail)
    if (!matchedUser) {
      console.error('No user found for email:', userEmail)
      return new Response('OK', { status: 200 })
    }

    const { error: bookingError } = await supabase
      .from('bookings')
      .insert({
        session_id,
        booked_by: matchedUser.id,
        credits_paid: amount_inr,
        status: 'confirmed',
        razorpay_order_id: order_id,
        razorpay_payment_id: payment_id,
      })

    if (bookingError) {
      console.error('Webhook booking insert failed:', bookingError)
      return new Response('OK', { status: 200 })
    }

    await supabase.rpc('increment_bookings_count', { session_id_input: session_id, seats_input: seats })
    console.log('Webhook: booking created successfully for order:', order_id)

    // ── Send booking confirmation email ──────────────────────────
    // Fetch session + choreographer + learner profile for email content
    const [sessionRes, profileRes] = await Promise.all([
      supabase
        .from('sessions')
        .select('title, scheduled_at, duration_minutes, choreographer_id')
        .eq('id', session_id)
        .single(),
      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', matchedUser.id)
        .single(),
    ])

    const sessionData     = sessionRes.data
    const learnerName     = profileRes.data?.full_name || userEmail.split('@')[0]
    let choreographerName = 'your choreographer'

    if (sessionData?.choreographer_id) {
      const { data: choreoProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', sessionData.choreographer_id)
        .single()
      if (choreoProfile?.full_name) choreographerName = choreoProfile.full_name
    }

    if (sessionData) {
      // Webhook runs server-side — we can await directly, no EdgeRuntime needed
      await sendBookingConfirmationEmail(
        userEmail,
        learnerName,
        sessionData.title,
        sessionData.scheduled_at,
        sessionData.duration_minutes || 60,
        amount_inr,
        seats,
        choreographerName,
        session_id,
      )
    }

    return new Response('OK', { status: 200 })

  } catch (err) {
    console.error('Webhook unexpected error:', err)
    return new Response('OK', { status: 200 }) // Always return 200 to Razorpay
  }
})