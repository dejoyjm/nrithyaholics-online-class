// supabase/functions/verify-payment/index.js
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
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      session_id,
      seats,
      amount_inr,
    } = await req.json()

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !session_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required payment fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify HMAC signature
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
    const body = `${razorpay_order_id}|${razorpay_payment_id}`

    const encoder = new TextEncoder()
    const keyData = encoder.encode(keySecret)
    const messageData = encoder.encode(body)

    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
    const signatureArray = Array.from(new Uint8Array(signatureBuffer))
    const expectedSignature = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('')

    if (expectedSignature !== razorpay_signature) {
      console.error('Signature mismatch', { expected: expectedSignature, got: razorpay_signature })
      return new Response(
        JSON.stringify({ error: 'Payment signature verification failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user from auth header
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

    // Get user from token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check not already booked
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('session_id', session_id)
      .eq('booked_by', user.id)
      .eq('status', 'confirmed')
      .maybeSingle()

    if (existing) {
      // Payment went through and booking already exists — treat as success
      return new Response(
        JSON.stringify({ success: true, booking_id: existing.id, already_existed: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        session_id,
        booked_by: user.id,
        credits_paid: amount_inr,
        status: 'confirmed',
        razorpay_order_id,
        razorpay_payment_id,
      })
      .select()
      .single()

    if (bookingError) {
      console.error('Booking insert failed:', bookingError)
      return new Response(
        JSON.stringify({ error: 'Failed to create booking: ' + bookingError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Increment bookings_count on session
    await supabase.rpc('increment_bookings_count', { session_id_input: session_id, seats_input: seats })

    return new Response(
      JSON.stringify({ success: true, booking_id: booking.id }),
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