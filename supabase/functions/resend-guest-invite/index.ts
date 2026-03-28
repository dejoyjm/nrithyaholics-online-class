// supabase/functions/resend-guest-invite/index.ts
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

  try {
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

    // Verify caller is authenticated
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { guest_booking_id, new_email } = await req.json()

    if (!guest_booking_id) {
      return new Response(
        JSON.stringify({ error: 'guest_booking_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch the guest booking + verify caller owns the primary booking
    const { data: guestBooking, error: fetchError } = await supabase
      .from('bookings')
      .select('id, guest_email, primary_booking_id, session_id, is_guest_booking, bookings!primary_booking_id(booked_by)')
      .eq('id', guest_booking_id)
      .eq('is_guest_booking', true)
      .single()

    if (fetchError || !guestBooking) {
      return new Response(
        JSON.stringify({ error: 'Guest booking not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify caller owns the primary booking
    const { data: primaryBooking } = await supabase
      .from('bookings')
      .select('booked_by')
      .eq('id', guestBooking.primary_booking_id)
      .single()

    if (!primaryBooking || primaryBooking.booked_by !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Not authorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const targetEmail = new_email?.trim() || guestBooking.guest_email
    if (!targetEmail) {
      return new Response(
        JSON.stringify({ error: 'No email address provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update email if changed
    if (new_email?.trim() && new_email.trim() !== guestBooking.guest_email) {
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ guest_email: new_email.trim(), invited_at: new Date().toISOString() })
        .eq('id', guest_booking_id)
      if (updateError) {
        return new Response(
          JSON.stringify({ error: 'Failed to update email: ' + updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Fetch session info for email
    const { data: sessionData } = await supabase
      .from('sessions')
      .select('title, scheduled_at, duration_minutes')
      .eq('id', guestBooking.session_id)
      .single()

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL') || 'bookings@nrithyaholics.in'
    const APP_URL = 'https://online.nrithyaholics.in'

    if (RESEND_API_KEY && sessionData) {
      const sessionTitle = sessionData.title || 'your dance class'
      const sessionDate = sessionData.scheduled_at
        ? new Date(sessionData.scheduled_at).toLocaleDateString('en-IN', {
            weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          })
        : ''
      const sessionUrl = `${APP_URL}/?session=${guestBooking.session_id}`

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `NrithyaHolics Online <${RESEND_FROM}>`,
          to: [targetEmail],
          subject: `You're invited to ${sessionTitle} 💃`,
          html: `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:24px;">
<h2 style="color:#c8430a;">You've been invited to a dance class!</h2>
<p>Someone booked a seat for you in <strong>${sessionTitle}</strong>${sessionDate ? ` on ${sessionDate} (IST)` : ''}.</p>
<p>Visit the link below to view your class and join when it's time:</p>
<a href="${sessionUrl}" style="display:inline-block;background:#c8430a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">View My Class →</a>
<p style="color:#7a6e65;font-size:13px;">This invite was sent to ${targetEmail}. If you have any questions, contact us at bookings@nrithyaholics.in</p>
</div>`,
        }),
      })

      if (!emailRes.ok) {
        const emailErr = await emailRes.json().catch(() => ({}))
        console.error('[resend-guest-invite] email send failed', emailErr)
        return new Response(
          JSON.stringify({ error: 'Failed to send email' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Update invited_at timestamp
    await supabase.from('bookings')
      .update({ invited_at: new Date().toISOString() })
      .eq('id', guest_booking_id)

    return new Response(
      JSON.stringify({ success: true }),
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
