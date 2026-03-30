// supabase/functions/check-upcoming-parts/index.ts
// Called by pg_cron every 5 minutes.
// Finds series sessions whose next part's guest pre-join window just opened,
// sends signed magic link emails to all confirmed learners, stamps series_parts_sent.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL     = 'https://online.nrithyaholics.in'
const RESEND_FROM = 'bookings@nrithyaholics.in'

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
      console.error('[check-upcoming-parts] generateLink error for', email, error)
      return null
    }
    return data.properties.action_link
  } catch (err) {
    console.error('[check-upcoming-parts] generateLink exception for', email, err)
    return null
  }
}

// ── Send part join link email via Resend ──────────────────────────────────────
async function sendPartJoinLinkEmail(
  resendApiKey: string,
  toEmail: string,
  toName: string,
  sessionTitle: string,
  partNumber: number,
  partStartISO: string,
  durationMinutes: number,
  choreographerName: string,
  magicLink: string,
) {
  const firstName = toName?.split(' ')[0] || 'there'
  const partStart = new Date(partStartISO)

  const timeStr = partStart.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  })
  const endTime = new Date(partStart.getTime() + durationMinutes * 60 * 1000)
  const endTimeStr = endTime.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  })
  const dateStr = partStart.toLocaleDateString('en-IN', {
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
      <div style="font-size:16px; font-weight:700; color:#86efac;">Part ${partNumber} of your workshop is starting now!</div>
      <div style="font-size:13px; color:#4ade80;">${dateStr} · ${timeStr} – ${endTimeStr} IST</div>
    </div>
  </div>

  <!-- Body -->
  <div style="padding:32px;">

    <p style="font-size:16px; color:#0f0c0c; margin:0 0 8px;">Hi ${firstName} 👋</p>
    <p style="font-size:15px; color:#3a3330; line-height:1.6; margin:0 0 28px;">
      <strong>Part ${partNumber} of ${sessionTitle}</strong> with ${choreographerName} is open.<br/>
      Tap below to join — this link logs you in automatically.
    </p>

    <!-- Big join button -->
    <div style="text-align:center; margin-bottom:28px;">
      <a href="${magicLink}"
         style="display:inline-block; background:#c8430a; color:white;
                text-decoration:none; padding:16px 40px; border-radius:12px;
                font-size:16px; font-weight:700; letter-spacing:0.3px;">
        🎬 Join Part ${partNumber} Now →
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
      subject: `🎬 Part ${partNumber} of ${sessionTitle} starts soon — here is your join link`,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[check-upcoming-parts] Resend error for', toEmail, err)
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

    // ── Fetch platform config for guest_pre_join_minutes ─────────────────────
    const { data: config } = await supabase
      .from('platform_config')
      .select('*')
      .eq('id', 1)
      .single()

    // ── Fetch all active series sessions ─────────────────────────────────────
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('*')
      .eq('session_type', 'series')
      .in('status', ['open', 'confirmed'])
      .not('series_parts', 'is', null)

    if (sessionsError) {
      console.error('[check-upcoming-parts] Sessions query error:', sessionsError)
      return new Response(JSON.stringify({ error: sessionsError.message }), { status: 500 })
    }

    if (!sessions || sessions.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active series sessions', checked: 0, sent: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[check-upcoming-parts] Checking ${sessions.length} series session(s)`)

    const sentLog: Array<{ session_id: string; part: number; learners: number }> = []

    for (const session of sessions) {
      const parts: Array<{ part: number; start: string; duration_minutes: number }> =
        session.series_parts || []

      // Build sent map — keyed by part number as string, value is timestamp or null
      const sentMap: Record<string, string | null> = session.series_parts_sent || {}

      // Use session override ?? platform_config value ?? hardcoded fallback
      const preJoinMins: number =
        session.guest_pre_join_minutes_override ?? config?.guest_pre_join_minutes ?? 5

      const nowMs = Date.now()

      for (const part of parts) {
        const partKey = String(part.part)

        // Idempotency: skip if email already sent for this part
        if (sentMap[partKey] != null) {
          continue
        }

        const partStartMs = new Date(part.start).getTime()
        const windowOpenMs = partStartMs - preJoinMins * 60 * 1000

        // Window must have opened within the last 6 minutes
        // (6 not 5 — gives 1 min slack for cron drift/cold start delay)
        if (windowOpenMs < nowMs - 6 * 60 * 1000 || windowOpenMs > nowMs) {
          console.log(
            `[check-upcoming-parts] Session ${session.id} Part ${part.part}: ` +
            `window opens at ${new Date(windowOpenMs).toISOString()}, ` +
            `now is ${new Date(nowMs).toISOString()} — skipping`
          )
          continue
        }

        console.log(
          `[check-upcoming-parts] Session ${session.id} Part ${part.part}: ` +
          `window open — sending join links`
        )

        // ── Mark as sent immediately to prevent duplicate emails from parallel cron runs
        const newSentMap = { ...sentMap, [partKey]: new Date().toISOString() }
        await supabase
          .from('sessions')
          .update({ series_parts_sent: newSentMap })
          .eq('id', session.id)

        // Update local sentMap so if this loop has multiple parts in window
        // (unlikely but possible), they each get their own stamp
        sentMap[partKey] = newSentMap[partKey]

        // ── Get choreographer name ────────────────────────────────────────────
        const { data: choreoProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.choreographer_id)
          .single()
        const choreographerName = choreoProfile?.full_name || 'your choreographer'

        // ── Get confirmed bookings for this session ───────────────────────────
        const { data: bookings, error: bookingsError } = await supabase
          .from('bookings')
          .select('*')
          .eq('session_id', session.id)
          .eq('status', 'confirmed')
          .eq('kicked', false)

        if (bookingsError || !bookings || bookings.length === 0) {
          console.log(`[check-upcoming-parts] No bookings for session ${session.id} Part ${part.part}`)
          continue
        }

        let learnersEmailed = 0

        for (const booking of bookings) {
          // Fetch learner email via auth admin
          const { data: authUser } = await supabase.auth.admin.getUserById(booking.booked_by)
          const email = authUser?.user?.email
          if (!email) {
            console.error('[check-upcoming-parts] No email for user', booking.booked_by)
            continue
          }

          // Fetch learner name from profiles
          const { data: learnerProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', booking.booked_by)
            .single()
          const name = learnerProfile?.full_name || email.split('@')[0]

          const redirectTo = `${APP_URL}/?session=${session.id}`
          const magicLink = await generateMagicLink(supabase, email, redirectTo)
          if (!magicLink) {
            console.error('[check-upcoming-parts] Failed to generate magic link for', email)
            continue
          }

          const sent = await sendPartJoinLinkEmail(
            RESEND_API_KEY,
            email,
            name,
            session.title,
            part.part,
            part.start,
            part.duration_minutes || 60,
            choreographerName,
            magicLink,
          )

          if (sent) {
            learnersEmailed++
            console.log(
              `[check-upcoming-parts] sent part ${part.part} for session ${session.id} to ${email}`
            )
          }
        }

        console.log(
          `[check-upcoming-parts] sent part ${part.part} for session ${session.id} to ${learnersEmailed} learner(s)`
        )
        sentLog.push({ session_id: session.id, part: part.part, learners: learnersEmailed })
      }
    }

    return new Response(
      JSON.stringify({ checked: sessions.length, sent: sentLog }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[check-upcoming-parts] error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
