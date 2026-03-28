// supabase/functions/claim-guest-booking/index.ts
// Finds a guest booking for the caller's email + session, claims it by
// setting booked_by = caller's user ID. Uses service role to bypass RLS.
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

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { session_id } = await req.json()
    if (!session_id) {
      return new Response(
        JSON.stringify({ booking_id: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const email = user.email
    if (!email) {
      return new Response(
        JSON.stringify({ booking_id: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find unclaimed guest booking for this user's email + session
    const { data: guestBooking } = await supabase
      .from('bookings')
      .select('id, booked_by')
      .eq('session_id', session_id)
      .eq('guest_email', email)
      .eq('status', 'confirmed')
      .maybeSingle()

    if (!guestBooking) {
      return new Response(
        JSON.stringify({ booking_id: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Claim: set booked_by so future client-side RLS checks work
    if (!guestBooking.booked_by) {
      await supabase
        .from('bookings')
        .update({ booked_by: user.id })
        .eq('id', guestBooking.id)
      console.log('[claim-guest-booking] claimed', guestBooking.id, 'for', user.id)
    }

    return new Response(
      JSON.stringify({ booking_id: guestBooking.id }),
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
