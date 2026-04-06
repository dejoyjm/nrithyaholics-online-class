import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Verify caller JWT
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'unauthorized' }, 401)

  // Verify caller is admin
  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (profile?.is_admin !== true) return json({ error: 'forbidden' }, 403)

  const body = await req.json().catch(() => null)
  const { recording_id } = body ?? {}
  if (!recording_id) return json({ error: 'missing recording_id' }, 400)

  // Fetch recording row (need session_id to call get-recording-url)
  const { data: recording } = await supabase
    .from('recordings').select('id, r2_url, session_id').eq('id', recording_id).single()
  if (!recording) return json({ error: 'recording not found' }, 404)

  // Get a fresh presigned URL by calling get-recording-url internally
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  let presignedUrl: string
  try {
    const urlRes = await fetch(`${supabaseUrl}/functions/v1/get-recording-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({ recording_id, session_id: recording.session_id }),
    })
    if (!urlRes.ok) {
      const err = await urlRes.json().catch(() => ({})) as Record<string, string>
      return json({ error: err.error || 'failed to get presigned URL' }, urlRes.status)
    }
    const urlData = await urlRes.json() as { url: string }
    presignedUrl = urlData.url
  } catch (e) {
    console.error('[extract-pose] get-recording-url error:', e)
    return json({ error: 'failed to get presigned URL' }, 502)
  }

  // POST to Railway pose service
  const poseServiceUrl = Deno.env.get('POSE_SERVICE_URL')!
  const poseSecret = Deno.env.get('POSE_SERVICE_SECRET') ?? ''

  try {
    const poseRes = await fetch(`${poseServiceUrl}/extract-pose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-secret': poseSecret,
      },
      body: JSON.stringify({ video_url: presignedUrl, recording_id }),
    })
    const poseData = await poseRes.json().catch(() => ({ error: 'invalid response from pose service' }))
    if (!poseRes.ok) {
      console.error('[extract-pose] pose service error:', poseRes.status, poseData)
      return json({ error: (poseData as Record<string, string>).error || 'pose service error' }, poseRes.status)
    }
    console.log('[extract-pose] dispatched recording:', recording_id, 'frame_count:', (poseData as Record<string, number>).frame_count)
    return json(poseData)
  } catch (e) {
    console.error('[extract-pose] pose service unreachable:', e)
    return json({ error: 'pose service unreachable' }, 502)
  }
})
