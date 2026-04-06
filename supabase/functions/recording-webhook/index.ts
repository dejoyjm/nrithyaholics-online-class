import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const body = await req.json().catch(() => null)

  // Ignore everything except recording success events
  if (!body || body.type !== 'beam.recording.success') {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const room_id       = body.data?.room_id
  const recording_url = body.data?.recording_asset_url
  const duration      = body.data?.duration
  const file_size     = body.data?.file_size
  const recorderRole  = body.data?.peer?.role

  // Skip performance recordings — only save main host recording for now
  if (recorderRole && recorderRole === 'recorder-all') {
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
    .eq('room_id', room_id)
    .limit(1)
    .single()

  if (!session) {
    console.log('[webhook] no session found for room_id:', room_id)
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const session_id = session.id

  await supabase.from('recordings').insert({
    session_id,
    r2_url: recording_url,
    duration_seconds: duration,
    file_size_bytes: file_size,
    recorder_role: recorderRole || 'recorder-host',
  })

  console.log('[webhook] recording saved:', session_id, recording_url)

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
