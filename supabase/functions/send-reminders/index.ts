// supabase/functions/send-reminders/index.ts
// Called by pg_cron every 30 minutes.
// Finds sessions starting ~24 hours from now, sends a warm reminder email
// to every confirmed learner, then marks reminder_24h_sent_at on the session.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL     = 'https://online.nrithyaholics.in'
const RESEND_FROM = 'bookings@nrithyaholics.in'

// ── Format a Date to Google Calendar's compact UTC string ─────────────────────

function toGCalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

// ── Send 24-hour reminder email via Resend ────────────────────────────────────

async function sendReminderEmail(
  resendApiKey: string,
  toEmail: string,
  toName: string,
  sessionId: string,
  sessionTitle: string,
  scheduledAt: string,
  durationMinutes: number,
  choreographerName: string,
) {
  const firstName   = toName?.split(' ')[0] || 'there'
  const sessionDate = new Date(scheduledAt)
  const endDate     = new Date(sessionDate.getTime() + durationMinutes * 60 * 1000)

  const timeStr = sessionDate.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  })
  const endTimeStr = endDate.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  })
  const dateStr = sessionDate.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Asia/Kolkata',
  })

  const calUrl = `https://www.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(sessionTitle + ' — NrithyaHolics')}` +
    `&dates=${toGCalDate(sessionDate)}/${toGCalDate(endDate)}` +
    `&details=${encodeURIComponent(`Live dance class with ${choreographerName} on NrithyaHolics.\n\nJoin at: ${APP_URL}/#/session/${sessionId}`)}`

  const testSetupUrl = `${APP_URL}/#/session/${sessionId}`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#f5f1ee; font-family:Arial,sans-serif;">
<div style="max-width:520px; margin:32px auto; background:white; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08);">

  <!-- Header -->
  <div style="background:#0f0c0c; padding:24px 32px;">
    <div style="font-size:22px; font-weight:900; color:#faf7f2;">
      Nrithya<span style="color:#c8430a;">Holics</span>
      <span style="font-size:13px; font-weight:400; color:#7a6e65; margin-left:6px;">Online</span>
    </div>
  </div>

  <!-- Tomorrow bar -->
  <div style="background:#1e1b4b; padding:16px 32px; display:flex; align-items:center; gap:12px;">
    <span style="font-size:24px;">🎶</span>
    <div>
      <div style="font-size:16px; font-weight:700; color:#c7d2fe;">Your class is tomorrow!</div>
      <div style="font-size:13px; color:#a5b4fc;">${dateStr} · ${timeStr} – ${endTimeStr} IST</div>
    </div>
  </div>

  <!-- Body -->
  <div style="padding:32px;">

    <p style="font-size:16px; color:#0f0c0c; margin:0 0 8px;">Hi ${firstName} 👋</p>
    <p style="font-size:15px; color:#3a3330; line-height:1.6; margin:0 0 24px;">
      Get ready — <strong>${sessionTitle}</strong> with <strong>${choreographerName}</strong> is happening
      tomorrow at <strong>${timeStr} IST</strong> (${durationMinutes} mins).
      <br/><br/>
      ✅ <strong>Your spot is confirmed.</strong> We'll send you the join link 5 minutes before class starts — keep an eye on your inbox!
    </p>

    <!-- Details card -->
    <div style="background:#faf7f2; border:1px solid #e2dbd4; border-radius:12px; padding:20px; margin-bottom:24px;">
      <table style="width:100%; border-collapse:collapse;">
        <tr>
          <td style="font-size:12px; color:#7a6e65; text-transform:uppercase; letter-spacing:0.8px; padding-bottom:10px; width:40%;">Class</td>
          <td style="font-size:14px; color:#0f0c0c; font-weight:600; padding-bottom:10px;">${sessionTitle}</td>
        </tr>
        <tr>
          <td style="font-size:12px; color:#7a6e65; text-transform:uppercase; letter-spacing:0.8px; padding-bottom:10px;">Instructor</td>
          <td style="font-size:14px; color:#0f0c0c; padding-bottom:10px;">${choreographerName}</td>
        </tr>
        <tr>
          <td style="font-size:12px; color:#7a6e65; text-transform:uppercase; letter-spacing:0.8px; padding-bottom:10px;">When</td>
          <td style="font-size:14px; color:#0f0c0c; padding-bottom:10px;">${dateStr}</td>
        </tr>
        <tr>
          <td style="font-size:12px; color:#7a6e65; text-transform:uppercase; letter-spacing:0.8px;">Time</td>
          <td style="font-size:14px; color:#0f0c0c;">${timeStr} – ${endTimeStr} IST (${durationMinutes} mins)</td>
        </tr>
      </table>
    </div>

    <!-- CTA row: Google Calendar + Test Setup -->
    <div style="display:flex; gap:12px; margin-bottom:28px; flex-wrap:wrap;">
      <a href="${calUrl}"
         style="flex:1; min-width:160px; display:inline-block; background:#4285f4; color:white;
                text-decoration:none; padding:12px 20px; border-radius:10px;
                font-size:14px; font-weight:600; text-align:center;">
        📅 Add to Google Calendar
      </a>
      <a href="${testSetupUrl}"
         style="flex:1; min-width:160px; display:inline-block; background:#f3f4f6; color:#0f0c0c;
                text-decoration:none; padding:12px 20px; border-radius:10px;
                font-size:14px; font-weight:600; text-align:center; border:1px solid #e2dbd4;">
        🎤 Test Your Setup
      </a>
    </div>

    <!-- Tips -->
    <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:16px; margin-bottom:24px;">
      <div style="font-size:13px; color:#78350f; line-height:1.8;">
        <strong>📌 Before class, make sure you:</strong><br/>
        • Have a stable internet connection<br/>
        • Clear some floor space to move freely<br/>
        • Test your mic &amp; camera with the button above
      </div>
    </div>

    <p style="font-size:13px; color:#7a6e65; margin:0; line-height:1.7;">
      The join link will arrive 5 minutes before class starts — it logs you in automatically, no password needed.
      <br/>Can't find it? Log in at
      <a href="${APP_URL}" style="color:#c8430a; text-decoration:none;">online.nrithyaholics.in</a>
      and find your session there.
    </p>

  </div>

  <!-- Footer -->
  <div style="background:#faf7f2; border-top:1px solid #e2dbd4; padding:20px 32px;">
    <p style="font-size:13px; font-weight:700; color:#0f0c0c; margin:0 0 4px;">NrithyaHolics Online</p>
    <p style="font-size:12px; color:#7a6e65; line-height:1.8; margin:0;">
      Dance has no address.<br/>
      💬 <a href="https://wa.me/916238186174" style="color:#c8430a; text-decoration:none;">WhatsApp</a>
      &nbsp;·&nbsp;
      📸 <a href="https://instagram.com/nrithyaholics" style="color:#c8430a; text-decoration:none;">@nrithyaholics</a>
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
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    `NrithyaHolics Online <${RESEND_FROM}>`,
      to:      [toEmail],
      subject: `Your class tomorrow — ${sessionTitle} 🎶`,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Resend error for', toEmail, err)
    return false
  }
  return true
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), { status: 500 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Allow manual trigger for a specific session (for testing)
    let manualSessionId: string | null = null
    try {
      const body = await req.json()
      manualSessionId = body?.session_id || null
    } catch { /* no body — cron trigger */ }

    // ── Find eligible sessions ────────────────────────────────────────────────
    // Sessions whose scheduled_at falls in the window [NOW+23h, NOW+25h].
    // The 2-hour window is wide enough that a cron running every 30 minutes
    // will always catch every session exactly once.

    let sessionsQuery = supabase
      .from('sessions')
      .select('id, title, scheduled_at, duration_minutes, choreographer_id, reminder_24h_sent_at')
      .in('status', ['open', 'confirmed'])
      .is('reminder_24h_sent_at', null)

    if (manualSessionId) {
      // Manual: send for this session regardless of timing
      sessionsQuery = sessionsQuery.eq('id', manualSessionId)
    } else {
      const now     = Date.now()
      const from24h = new Date(now + 23 * 60 * 60 * 1000).toISOString()
      const to25h   = new Date(now + 25 * 60 * 60 * 1000).toISOString()
      sessionsQuery = sessionsQuery
        .gte('scheduled_at', from24h)
        .lte('scheduled_at', to25h)
    }

    const { data: sessions, error: sessionsError } = await sessionsQuery

    if (sessionsError) {
      console.error('Sessions query error:', sessionsError)
      return new Response(JSON.stringify({ error: sessionsError.message }), { status: 500 })
    }

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ message: 'No eligible sessions', sent: 0 }), { status: 200 })
    }

    console.log(`Found ${sessions.length} session(s) needing 24h reminder`)

    let totalSent = 0

    for (const session of sessions) {
      // Get choreographer name
      const { data: choreoProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.choreographer_id)
        .single()
      const choreographerName = choreoProfile?.full_name || 'your choreographer'

      // Get confirmed bookings for this session
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, booked_by')
        .eq('session_id', session.id)
        .eq('status', 'confirmed')
        .eq('kicked', false)

      if (bookingsError || !bookings || bookings.length === 0) {
        console.log(`No confirmed bookings for session ${session.id} — marking sent`)
        await supabase.from('sessions')
          .update({ reminder_24h_sent_at: new Date().toISOString() })
          .eq('id', session.id)
        continue
      }

      console.log(`Sending 24h reminders for session ${session.id} to ${bookings.length} learner(s)`)

      // Mark immediately to prevent duplicates from parallel cron runs
      await supabase.from('sessions')
        .update({ reminder_24h_sent_at: new Date().toISOString() })
        .eq('id', session.id)

      for (const booking of bookings) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', booking.booked_by)
          .single()

        const { data: authUser } = await supabase.auth.admin.getUserById(booking.booked_by)
        const email = authUser?.user?.email
        if (!email) {
          console.error('No email for user', booking.booked_by)
          continue
        }

        const name = profile?.full_name || email.split('@')[0]

        const sent = await sendReminderEmail(
          RESEND_API_KEY,
          email,
          name,
          session.id,
          session.title,
          session.scheduled_at,
          session.duration_minutes || 60,
          choreographerName,
        )

        if (sent) {
          totalSent++
          console.log(`24h reminder sent to ${email} for session ${session.id}`)
        }
      }
    }

    return new Response(
      JSON.stringify({ message: 'Done', sent: totalSent }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('send-reminders error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
