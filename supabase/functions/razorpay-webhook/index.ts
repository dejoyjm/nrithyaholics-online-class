// supabase/functions/razorpay-webhook/index.js
// Backup safety net: catches payments that succeeded but frontend callback was missed
// (e.g. user closed browser right after paying)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const rawBody = await req.text()
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')

    // Verify webhook signature
    const razorpaySignature = req.headers.get('x-razorpay-signature')
    if (!razorpaySignature || !webhookSecret) {
      console.error('Missing webhook signature or secret')
      return new Response('Unauthorized', { status: 401 })
    }

    const encoder = new TextEncoder()
    const keyData = encoder.encode(webhookSecret)
    const messageData = encoder.encode(rawBody)

    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
    const signatureArray = Array.from(new Uint8Array(signatureBuffer))
    const expectedSignature = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('')

    if (expectedSignature !== razorpaySignature) {
      console.error('Webhook signature mismatch')
      return new Response('Unauthorized', { status: 401 })
    }

    const payload = JSON.parse(rawBody)
    const event = payload.event

    // Only handle payment.captured
    if (event !== 'payment.captured') {
      return new Response('OK', { status: 200 })
    }

    const payment = payload.payload?.payment?.entity
    if (!payment) {
      return new Response('OK', { status: 200 })
    }

    const order_id = payment.order_id
    const payment_id = payment.id
    const notes = payment.notes || {}
    const session_id = notes.session_id
    const seats = parseInt(notes.seats || '1')
    const amount_inr = payment.amount / 100 // convert paise back to INR

    if (!session_id || !order_id) {
      console.error('Missing session_id or order_id in payment notes')
      return new Response('OK', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // Check if booking already exists (created by verify-payment)
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('razorpay_order_id', order_id)
      .maybeSingle()

    if (existing) {
      // Already created by frontend callback — nothing to do
      console.log('Booking already exists for order:', order_id)
      return new Response('OK', { status: 200 })
    }

    // Booking missing — create it now (user closed browser after paying)
    // We need the user_id — look it up from the razorpay customer email via auth
    // Razorpay stores email in payment.email
    const userEmail = payment.email
    if (!userEmail) {
      console.error('No email in payment, cannot create booking')
      return new Response('OK', { status: 200 })
    }

    // Look up user by email using service role
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers()
    if (userError) {
      console.error('Failed to list users:', userError)
      return new Response('OK', { status: 200 })
    }

    const matchedUser = users.find(u => u.email === userEmail)
    if (!matchedUser) {
      console.error('No user found for email:', userEmail)
      return new Response('OK', { status: 200 })
    }

    // Create the booking
    const { error: bookingError } = await supabase
      .from('bookings')
      .insert({
        session_id,
        booked_by: matchedUser.id,
        credits_paid: amount_inr,
        status: 'confirmed',
        razorpay_order_id: order_id,
        razorpay_payment_id: payment_id,
      })

    if (bookingError) {
      console.error('Webhook booking insert failed:', bookingError)
      return new Response('OK', { status: 200 })
    }

    // Increment bookings_count
    await supabase.rpc('increment_bookings_count', { session_id_input: session_id, seats_input: seats })

    console.log('Webhook: booking created successfully for order:', order_id)
    return new Response('OK', { status: 200 })

  } catch (err) {
    console.error('Webhook unexpected error:', err)
    return new Response('OK', { status: 200 }) // Always return 200 to Razorpay
  }
})
