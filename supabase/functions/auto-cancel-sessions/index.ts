// supabase/functions/auto-cancel-sessions/index.ts
// Called by pg_cron every hour.
// Cancels sessions that:
//   - are still 'open'
//   - start within the next 24 hours
//   - have not yet reached min_seats
// Sends a cancellation email to every confirmed learner.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL') || 'bookings@nrithyaholics.in'
  const APP_URL = 'https://online.nrithyaholics.in'

  try {
    // Find open sessions scheduled within the next 24 hours that haven't hit min_seats
    const now = new Date()
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, title, scheduled_at, min_seats, bookings_count')
      .eq('status', 'open')
      .gt('scheduled_at', now.toISOString())
      .lt('scheduled_at', in24h.toISOString())

    if (sessionsError) {
      console.error('[auto-cancel] sessions fetch error:', sessionsError)
      return new Response(JSON.stringify({ error: 'sessions fetch failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const toCancel = (sessions || []).filter(
      (s) => s.min_seats != null && (s.bookings_count || 0) < s.min_seats
    )

    console.log(`[auto-cancel] found ${toCancel.length} session(s) to cancel`)

    const results: { session_id: string; title: string; bookings_notified: number }[] = []

    for (const session of toCancel) {
      // Cancel the session
      const { error: cancelError } = await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .eq('id', session.id)

      if (cancelError) {
        console.error('[auto-cancel] cancel failed for session', session.id, cancelError)
        continue
      }

      console.log('[auto-cancel] cancelled session', session.id, session.title,
        `(${session.bookings_count}/${session.min_seats} seats)`)

      // Fetch all confirmed learner emails for this session
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, guest_email, booked_by, profiles(full_name)')
        .eq('session_id', session.id)
        .eq('status', 'confirmed')
        .eq('is_guest_booking', false)

      const learnerBookings = bookings || []
      let emailsSent = 0

      if (RESEND_API_KEY && learnerBookings.length > 0) {
        // Collect emails: booked_by users need their email from auth.users.
        // Use profiles_with_email view (admin use only, accessible via service role).
        const userIds = learnerBookings
          .filter((b: any) => b.booked_by)
          .map((b: any) => b.booked_by)

        const { data: emailRows } = await supabase
          .from('profiles_with_email')
          .select('id, email, full_name')
          .in('id', userIds)

        const emailMap: Record<string, { email: string; name: string }> = {}
        for (const row of (emailRows || [])) {
          emailMap[row.id] = { email: row.email, name: row.full_name || 'there' }
        }

        const sessionDate = new Date(session.scheduled_at).toLocaleDateString('en-IN', {
          weekday: 'long', day: 'numeric', month: 'long',
          hour: '2-digit', minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        })

        for (const booking of learnerBookings) {
          const recipient = booking.booked_by
            ? emailMap[booking.booked_by]
            : booking.guest_email
              ? { email: booking.guest_email, name: 'there' }
              : null

          if (!recipient) continue

          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: `NrithyaHolics Online <${RESEND_FROM}>`,
                to: [recipient.email],
                subject: `Class cancelled: ${session.title}`,
                html: `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:24px;">
<h2 style="color:#c8430a;">Class Cancelled</h2>
<p>Hi ${recipient.name},</p>
<p>Unfortunately, <strong>${session.title}</strong> scheduled for ${sessionDate} (IST) has been cancelled
because the minimum number of participants was not reached.</p>
<p>If you paid for this class, a full refund will be processed to your original payment method.
Please allow 5–7 business days for the refund to appear.</p>
<p>We're sorry for the inconvenience. Check back soon for upcoming classes:</p>
<a href="${APP_URL}" style="display:inline-block;background:#c8430a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">Browse Classes →</a>
<p style="color:#7a6e65;font-size:13px;">Questions? Contact us at bookings@nrithyaholics.in</p>
</div>`,
              }),
            })
            emailsSent++
          } catch (emailErr) {
            console.error('[auto-cancel] email failed for', recipient.email, emailErr)
          }
        }
      }

      results.push({
        session_id: session.id,
        title: session.title,
        bookings_notified: emailsSent,
      })
    }

    return new Response(
      JSON.stringify({ cancelled: results.length, sessions: results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[auto-cancel] unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
