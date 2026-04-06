import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const body = await req.json().catch(() => null)

  // Log the full raw payload before any parsing
  console.log('[webhook] raw payload:', JSON.stringify(body))

  // Only process recording success events; return 200 immediately for all others
  if (!body || body.type !== 'beam.recording.success') {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('room_id', body.room_id)
    .single()

  if (!session) {
    console.log('[webhook] no session found for room_id:', body.room_id)
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: insertData } = await supabase.from('recordings').insert({
    session_id: session.id,
    r2_url:           body.data?.location ?? null,
    duration_seconds: body.data?.duration ?? null,
    file_size_bytes:  body.data?.size ?? null,
    recorder_role:    null,
  }).select('id').single()

  console.log('[webhook] recording saved:', insertData?.id,
    'session:', session?.id, 'duration:', body.data?.duration)

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
