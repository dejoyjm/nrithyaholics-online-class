// supabase/functions/send-announcement/index.ts
// Sends a custom announcement email to all confirmed learners in a session.
// Accepts: { session_id, subject, message }
// Returns: { sent: N, failed: M }
// Deploy with: supabase functions deploy send-announcement --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_FROM = 'bookings@nrithyaholics.in'
const APP_URL     = 'https://online.nrithyaholics.in'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { session_id, subject, message } = await req.json()

    if (!session_id || !subject || !message) {
      return new Response(
        JSON.stringify({ error: 'session_id, subject, and message are required' }),
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

    // 1. Fetch session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, title, scheduled_at')
      .eq('id', session_id)
      .single()

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: 'Session not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Fetch confirmed bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, booked_by')
      .eq('session_id', session_id)
      .eq('status', 'confirmed')

    if (bookingsError || !bookings || bookings.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, message: 'No confirmed bookings' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Build date string for email header
    const sessionDate = new Date(session.scheduled_at)
    const dateStr = sessionDate.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Asia/Kolkata',
    })

    let sent = 0
    let failed = 0

    for (const booking of bookings) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', booking.booked_by)
        .single()

      const { data: authUser } = await supabase.auth.admin.getUserById(booking.booked_by)
      const email = authUser?.user?.email
      if (!email) { failed++; continue }

      const name      = profile?.full_name || email.split('@')[0]
      const firstName = name.split(' ')[0] || 'there'

      // Escape HTML in message then convert newlines to <br>
      const safeMessage = message
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>')

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#f5f1ee; font-family:Arial,sans-serif;">
<div style="max-width:520px; margin:32px auto; background:white; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08);">

  <div style="background:#0f0c0c; padding:24px 32px;">
    <div style="font-size:22px; font-weight:900; color:#faf7f2;">
      Nrithya<span style="color:#c8430a;">Holics</span>
      <span style="font-size:13px; font-weight:400; color:#7a6e65; margin-left:6px;">Online</span>
    </div>
  </div>

  <div style="background:#1e3a5f; padding:16px 32px;">
    <div style="font-size:14px; font-weight:700; color:#93c5fd;">📢 Announcement</div>
    <div style="font-size:13px; color:#bfdbfe; margin-top:2px;">${session.title} · ${dateStr}</div>
  </div>

  <div style="padding:32px;">
    <p style="font-size:16px; color:#0f0c0c; margin:0 0 20px;">Hi ${firstName} 👋</p>
    <div style="font-size:15px; color:#3a3330; line-height:1.7; margin:0 0 28px;">${safeMessage}</div>
    <div style="border-top:1px solid #f0ebe6; padding-top:20px;">
      <p style="font-size:13px; color:#7a6e65; margin:0;">
        This message is about your booking for <strong>${session.title}</strong>.
      </p>
    </div>
  </div>

  <div style="background:#faf7f2; border-top:1px solid #e2dbd4; padding:20px 32px;">
    <p style="font-size:13px; font-weight:700; color:#0f0c0c; margin:0 0 4px;">NrithyaHolics Online</p>
    <p style="font-size:12px; color:#7a6e65; line-height:1.8; margin:0;">
      Dance has no address.<br/>
      💬 <a href="https://wa.me/916238186174" style="color:#c8430a; text-decoration:none;">WhatsApp us</a>
      &nbsp;·&nbsp;
      🌐 <a href="${APP_URL}" style="color:#c8430a; text-decoration:none;">online.nrithyaholics.in</a>
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
          from:    `NrithyaHolics Online <${RESEND_FROM}>`,
          to:      [email],
          subject,
          html,
        }),
      })

      if (res.ok) {
        sent++
        console.log(`Announcement sent to ${email} for session ${session_id}`)
      } else {
        failed++
        const err = await res.text()
        console.error(`Failed to send announcement to ${email}:`, err)
      }
    }

    return new Response(
      JSON.stringify({ sent, failed }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('send-announcement error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
