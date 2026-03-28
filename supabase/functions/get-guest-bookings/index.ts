// supabase/functions/get-guest-bookings/index.ts
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

    const { booking_ids } = await req.json()
    const safeBookingIds: string[] = Array.isArray(booking_ids) ? booking_ids : []

    // Run both queries in parallel
    const [guestBookings, invitedBookings] = await Promise.all([
      // 1. Sub-bookings created by this buyer (guest seats they sold)
      (async () => {
        if (safeBookingIds.length === 0) return []
        // Verify caller actually owns these booking IDs (prevent enumeration)
        const { data: ownerCheck } = await supabase
          .from('bookings')
          .select('id')
          .in('id', safeBookingIds)
          .eq('booked_by', user.id)
        const verifiedIds = (ownerCheck || []).map((b: any) => b.id)
        if (verifiedIds.length === 0) return []
        const { data, error } = await supabase
          .from('bookings')
          .select('id, guest_email, booked_by, invited_at, primary_booking_id')
          .in('primary_booking_id', verifiedIds)
          .eq('is_guest_booking', true)
        if (error) console.error('[get-guest-bookings] sub-bookings error:', error)
        return data || []
      })(),

      // 2. Sessions this user was invited to (they are the guest)
      (async () => {
        const email = user.email
        if (!email) return []
        const { data, error } = await supabase
          .from('bookings')
          .select('*, sessions(title, scheduled_at, style_tags, skill_level, duration_minutes, price_tiers)')
          .eq('guest_email', email)
          .eq('status', 'confirmed')
        if (error) console.error('[get-guest-bookings] invited error:', error)
        return data || []
      })(),
    ])

    return new Response(
      JSON.stringify({ guest_bookings: guestBookings, invited_bookings: invitedBookings }),
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
