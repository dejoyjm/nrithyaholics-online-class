// supabase/functions/send-booking-confirmation/index.ts
// Manually sends a booking confirmation email for a given booking_id.
// Used by admin to resend confirmation when the automatic email failed.
// Deploy with: supabase functions deploy send-booking-confirmation --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL     = 'https://online.nrithyaholics.in'
const RESEND_FROM = 'bookings@nrithyaholics.in'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { booking_id } = await req.json()
    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: 'booking_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not set' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Fetch booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, session_id, booked_by, credits_paid, razorpay_payment_id, razorpay_order_id')
      .eq('id', booking_id)
      .single()

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: 'Booking not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Fetch session
    const { data: session } = await supabase
      .from('sessions')
      .select('title, scheduled_at, duration_minutes, choreographer_id')
      .eq('id', booking.session_id)
      .single()

    if (!session) {
      return new Response(
        JSON.stringify({ error: 'Session not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Fetch choreographer name
    let choreographerName = 'your choreographer'
    if (session.choreographer_id) {
      const { data: choreoProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.choreographer_id)
        .single()
      if (choreoProfile?.full_name) choreographerName = choreoProfile.full_name
    }

    // 4. Fetch learner name + email
    const [profileRes, authRes] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', booking.booked_by).single(),
      supabase.auth.admin.getUserById(booking.booked_by),
    ])

    const learnerEmail = authRes.data?.user?.email
    if (!learnerEmail) {
      return new Response(
        JSON.stringify({ error: 'Learner email not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const learnerName = profileRes.data?.full_name || learnerEmail.split('@')[0]
    const firstName   = learnerName.split(' ')[0] || 'there'

    // 5. Build and send the confirmation email (same template as verify-payment)
    const sessionDate = new Date(session.scheduled_at)
    const dateStr = sessionDate.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Asia/Kolkata',
    })
    const timeStr = sessionDate.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
    })
    const endTime = new Date(sessionDate.getTime() + (session.duration_minutes || 60) * 60 * 1000)
    const endTimeStr = endTime.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
    })
    const sessionUrl = `${APP_URL}/?session=${booking.session_id}`
    const gcalStart  = sessionDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const gcalEnd    = endTime.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

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

    <p style="font-size:16px; color:#0f0c0c; margin:0 0 24px;">
      Hi ${firstName} 👋
    </p>

    <p style="font-size:15px; color:#3a3330; line-height:1.6; margin:0 0 28px;">
      You're all set for your class. Here are your booking details:
    </p>

    <div style="background:#faf7f2; border:1px solid #e2dbd4; border-radius:12px; padding:20px; margin-bottom:28px;">
      <div style="font-size:18px; font-weight:800; color:#0f0c0c; margin-bottom:4px; font-family:Georgia,serif;">
        ${session.title}
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
          <td style="padding:6px 0; font-size:13px; color:#7a6e65;">💳 Paid</td>
          <td style="padding:6px 0; font-size:13px; color:#0f0c0c; font-weight:600;">₹${booking.credits_paid}</td>
        </tr>
      </table>
    </div>

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
      <a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(session.title)}&dates=${gcalStart}/${gcalEnd}&details=Join+your+NrithyaHolics+class+at+${encodeURIComponent(sessionUrl)}&location=online.nrithyaholics.in"
         target="_blank"
         style="display:block; background:white; color:#3a2e2e; text-decoration:none;
                padding:16px; border-radius:8px; font-size:14px; font-weight:600;
                text-align:center; border:1px solid #e2dbd4;">
        📅 Add to Google Calendar
      </a>
    </div>

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
        to:   [learnerEmail],
        subject: `Confirmed: ${session.title} on ${dateStr}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Resend error:', err)
      return new Response(
        JSON.stringify({ error: 'Email send failed: ' + err }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Stamp confirmation_email_sent_at
    await supabase.from('bookings')
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq('id', booking_id)

    console.log(`send-booking-confirmation: sent to ${learnerEmail} for booking ${booking_id}`)

    // 7. Return success
    return new Response(
      JSON.stringify({ success: true, email: learnerEmail }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('send-booking-confirmation error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
