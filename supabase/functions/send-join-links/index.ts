// supabase/functions/send-join-links/index.ts
// Called by pg_cron every 5 minutes via a Supabase DB webhook/direct invocation.
// Finds sessions whose guest pre-join window just opened, sends signed magic
// link join emails to all confirmed bookings, marks reminder_sent_at.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL      = 'https://online.nrithyaholics.in'
const RESEND_FROM  = 'bookings@nrithyaholics.in'

// ── Generate a signed magic link for a specific user + redirect ──────────────
async function generateMagicLink(
  supabaseAdmin: any,
  email: string,
  redirectTo: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    })
    if (error || !data?.properties?.action_link) {
      console.error('generateLink error for', email, error)
      return null
    }
    return data.properties.action_link
  } catch (err) {
    console.error('generateLink exception for', email, err)
    return null
  }
}

// ── Send join link email via Resend ──────────────────────────────────────────
async function sendJoinLinkEmail(
  resendApiKey: string,
  toEmail: string,
  toName: string,
  sessionTitle: string,
  scheduledAt: string,
  durationMinutes: number,
  choreographerName: string,
  magicLink: string,
) {
  const firstName = toName?.split(' ')[0] || 'there'
  const sessionDate = new Date(scheduledAt)

  const timeStr = sessionDate.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  })
  const endTime = new Date(sessionDate.getTime() + durationMinutes * 60 * 1000)
  const endTimeStr = endTime.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  })
  const dateStr = sessionDate.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Asia/Kolkata',
  })

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

  <!-- Live bar -->
  <div style="background:#052e16; padding:16px 32px; display:flex; align-items:center; gap:12px;">
    <span style="font-size:24px;">🎬</span>
    <div>
      <div style="font-size:16px; font-weight:700; color:#86efac;">Your class is starting now!</div>
      <div style="font-size:13px; color:#4ade80;">${dateStr} · ${timeStr} – ${endTimeStr} IST</div>
    </div>
  </div>

  <!-- Body -->
  <div style="padding:32px;">

    <p style="font-size:16px; color:#0f0c0c; margin:0 0 8px;">Hi ${firstName} 👋</p>
    <p style="font-size:15px; color:#3a3330; line-height:1.6; margin:0 0 28px;">
      <strong>${sessionTitle}</strong> with ${choreographerName} is open.<br/>
      Tap below to join — this link logs you in automatically.
    </p>

    <!-- Big join button -->
    <div style="text-align:center; margin-bottom:28px;">
      <a href="${magicLink}"
         style="display:inline-block; background:#c8430a; color:white;
                text-decoration:none; padding:16px 40px; border-radius:12px;
                font-size:16px; font-weight:700; letter-spacing:0.3px;">
        🎬 Join Class Now →
      </a>
      <p style="font-size:12px; color:#a09890; margin-top:12px; line-height:1.6;">
        This link logs you in automatically.<br/>
        It works for up to 2 hours from when this email was sent.
      </p>
    </div>

    <!-- Tips -->
    <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:16px; margin-bottom:24px;">
      <div style="font-size:13px; color:#78350f; line-height:1.8;">
        <strong>📌 Quick reminders:</strong><br/>
        • Please mute your mic when you join<br/>
        • Find a space with enough room to move freely<br/>
        • Join from a device with a stable internet connection
      </div>
    </div>

    <p style="font-size:13px; color:#7a6e65; margin:0;">
      Can't find the Join button? Log in at
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
      from: `NrithyaHolics Online <${RESEND_FROM}>`,
      to:   [toEmail],
      subject: `🎬 Join now: ${sessionTitle}`,
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
    // single_user_email: when set, only send to this user (late booking case)
    let manualSessionId: string | null = null
    let singleUserEmail: string | null = null
    try {
      const body = await req.json()
      manualSessionId = body?.session_id || null
      singleUserEmail = body?.single_user_email || null
    } catch { /* no body — cron trigger */ }

    // ── Find eligible sessions ────────────────────────────────────────────────
    // Sessions whose guest pre-join window opened in the last 5 minutes
    // AND haven't had a reminder sent yet.
    // guest_pre_join defaults to 5 mins if not overridden.
    let sessionsQuery = supabase
      .from('sessions')
      .select('id, title, scheduled_at, duration_minutes, choreographer_id, guest_pre_join_minutes_override, reminder_sent_at')
      .in('status', ['open', 'confirmed'])
      .is('reminder_sent_at', null)

    if (manualSessionId) {
      // Manual trigger — send for this specific session regardless of timing
      sessionsQuery = sessionsQuery.eq('id', manualSessionId)
    } else {
      // Cron trigger — fetch sessions that could plausibly be in window.
      // We cast a wide net (scheduled within next 30 mins OR started up to 30 mins ago)
      // then do the precise per-session check in JS where we know pre_join_minutes.
      // This avoids the bug of filtering on scheduled_at when the window actually
      // opens at scheduled_at - pre_join_minutes.
      sessionsQuery = sessionsQuery
        .lte('scheduled_at', new Date(Date.now() + 30 * 60 * 1000).toISOString())
        .gte('scheduled_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    }

    const { data: sessions, error: sessionsError } = await sessionsQuery

    if (sessionsError) {
      console.error('Sessions query error:', sessionsError)
      return new Response(JSON.stringify({ error: sessionsError.message }), { status: 500 })
    }

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ message: 'No eligible sessions', sent: 0 }), { status: 200 })
    }

    console.log(`Found ${sessions.length} candidate session(s) — checking windows`)

    let totalSent = 0

    for (const session of sessions) {
      // Precise per-session timing check for cron triggers (not manual)
      if (!manualSessionId) {
        const preJoinMins = session.guest_pre_join_minutes_override ?? 5
        const windowOpenTime = new Date(session.scheduled_at).getTime() - (preJoinMins * 60 * 1000)
        const nowMs = Date.now()
        // Window must have opened within the last 6 minutes
        // (6 not 5 — gives 1 min slack for cron drift/cold start delay)
        if (windowOpenTime < nowMs - 6 * 60 * 1000 || windowOpenTime > nowMs) {
          console.log(`Session ${session.id}: window opens at ${new Date(windowOpenTime).toISOString()}, now is ${new Date(nowMs).toISOString()} — skipping`)
          continue
        }
        console.log(`Session ${session.id}: window open — sending join links`)
      }

      // Get choreographer name
      const { data: choreoProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.choreographer_id)
        .single()
      const choreographerName = choreoProfile?.full_name || 'your choreographer'

      // Get confirmed bookings — if singleUserEmail set, only that user (late booking)
      let bookingsQuery = supabase
        .from('bookings')
        .select('id, booked_by')
        .eq('session_id', session.id)
        .eq('status', 'confirmed')
        .eq('kicked', false)

      const { data: bookings, error: bookingsError } = await bookingsQuery

      if (bookingsError || !bookings || bookings.length === 0) {
        console.log(`No bookings for session ${session.id}`)
        // Mark as sent anyway to avoid retrying
        await supabase.from('sessions').update({ reminder_sent_at: new Date().toISOString() }).eq('id', session.id)
        continue
      }

      console.log(`Sending join links for session ${session.id} to ${bookings.length} learner(s)`)

      // Mark reminder_sent_at immediately to prevent duplicates from parallel runs
      await supabase.from('sessions')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', session.id)

      // Send email to each learner
      for (const booking of bookings) {
        // Get learner's email and name from profiles
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

        // Skip if single_user_email set and this isn't that user
        if (singleUserEmail && email !== singleUserEmail) continue

        const name = profile?.full_name || email.split('@')[0]
        const redirectTo = `${APP_URL}/?session=${session.id}`

        // Generate signed magic link — user clicks this and is auto logged in
        const magicLink = await generateMagicLink(supabase, email, redirectTo)
        if (!magicLink) {
          console.error('Failed to generate magic link for', email)
          continue
        }

        const sent = await sendJoinLinkEmail(
          RESEND_API_KEY,
          email,
          name,
          session.title,
          session.scheduled_at,
          session.duration_minutes || 60,
          choreographerName,
          magicLink,
        )

        if (sent) {
          totalSent++
          console.log(`Join link sent to ${email} for session ${session.id}`)
        }
      }
    }

    return new Response(
      JSON.stringify({ message: 'Done', sent: totalSent }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('send-join-links error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})