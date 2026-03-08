import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'
import { encode as hexEncode } from 'https://deno.land/std@0.168.0/encoding/hex.ts'

const APP_URL = 'https://online.nrithyaholics.in'
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!

serve(async (req) => {
  // Razorpay POSTs form data to callback_url
  try {
    const formData = await req.formData()
    const razorpay_order_id = formData.get('razorpay_order_id')?.toString()
    const razorpay_payment_id = formData.get('razorpay_payment_id')?.toString()
    const razorpay_signature = formData.get('razorpay_signature')?.toString()

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return Response.redirect(`${APP_URL}/?payment_error=missing_params`, 302)
    }

    // Verify HMAC signature
    const body = `${razorpay_order_id}|${razorpay_payment_id}`
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(RAZORPAY_KEY_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    const expectedSig = new TextDecoder().decode(hexEncode(new Uint8Array(sigBytes)))

    if (expectedSig !== razorpay_signature) {
      return Response.redirect(`${APP_URL}/?payment_error=signature_mismatch`, 302)
    }

    // Get session_id from Supabase - look up the order
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Find the booking with this order_id to get session_id
    const { data: booking } = await supabase
      .from('bookings')
      .select('session_id, booked_by, credits_paid')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle()

    // If booking already exists (webhook beat us), just redirect success
    if (booking) {
      return Response.redirect(
        `${APP_URL}/?payment_success=1&session_id=${booking.session_id}&payment_id=${razorpay_payment_id}`,
        302
      )
    }

    // Booking doesn't exist yet - redirect with all params so app can call verify-payment
    return Response.redirect(
      `${APP_URL}/?razorpay_order_id=${razorpay_order_id}&razorpay_payment_id=${razorpay_payment_id}&razorpay_signature=${encodeURIComponent(razorpay_signature)}`,
      302
    )

  } catch (err) {
    console.error('Callback error:', err)
    return Response.redirect(`${APP_URL}/?payment_error=callback_failed`, 302)
  }
})