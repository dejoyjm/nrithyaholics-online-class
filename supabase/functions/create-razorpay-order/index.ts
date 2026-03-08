// supabase/functions/create-razorpay-order/index.js
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { session_id, amount_inr, seats } = await req.json()

    if (!session_id || !amount_inr || !seats) {
      return new Response(
        JSON.stringify({ error: 'Missing session_id, amount_inr or seats' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const keyId = Deno.env.get('RAZORPAY_KEY_ID')
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')

    if (!keyId || !keySecret) {
      return new Response(
        JSON.stringify({ error: 'Razorpay keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Razorpay amount is in paise (1 INR = 100 paise)
    const amountPaise = Math.round(amount_inr * 100)

    const credentials = btoa(`${keyId}:${keySecret}`)

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt: `nrh_${Date.now()}`,
        notes: {
          session_id,
          seats: String(seats),
        },
      }),
    })

    const order = await response.json()

    if (!response.ok) {
      console.error('Razorpay order creation failed:', order)
      return new Response(
        JSON.stringify({ error: order.error?.description || 'Failed to create order' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ order_id: order.id, amount: order.amount, currency: order.currency }),
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
