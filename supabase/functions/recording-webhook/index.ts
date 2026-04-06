import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const body = await req.json().catch(() => null)

  // Fix 1: Log the full raw payload before any parsing
  console.log('[webhook] raw payload:', JSON.stringify(body))

  // Ignore everything except recording success events
  if (!body || body.type !== 'beam.recording.success') {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const duration     = body.duration
  const file_size    = body.size

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Fix 2: Look up session using flat body.room_id
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

  // Fix 3: Construct r2_url from R2 public base URL, not the s3:// internal path
  const filename = body.location?.split('/').slice(3).join('/')
  const r2_url = `https://nrh-recordings.ada4a12feb79f496f48ad0e80a913617.r2.cloudflarestorage.com/${filename}`

  const { data: insertData } = await supabase.from('recordings').insert({
    session_id: session.id,
    r2_url,
    duration_seconds: duration,
    file_size_bytes: file_size,
    recorder_role: 'recorder-host',
  }).select('id').single()

  // Fix 4: Updated log line
  console.log('[webhook] recording saved:', insertData?.id, 'session:', session?.id, 'url:', r2_url)

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
