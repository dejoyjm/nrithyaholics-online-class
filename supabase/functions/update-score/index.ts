import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
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

  const incomingSecret = req.headers.get('x-internal-secret')
  if (incomingSecret !== Deno.env.get('INTERNAL_SECRET')) {
    return json({ error: 'unauthorized' }, 401)
  }

  const body = await req.json().catch(() => null)
  const { session_id, student_recording_id, overall_score, timeline, joint_summary } = body ?? {}
  if (!student_recording_id) return json({ error: 'missing student_recording_id' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error } = await supabase
    .from('dance_scores')
    .update({
      overall_score,
      timeline_data: timeline,
      joint_summary,
      status: 'scored',
    })
    .eq('upload_id', student_recording_id)

  if (error) {
    console.error('[update-score] update error:', error.message, 'recording:', student_recording_id)
    return json({ error: error.message }, 500)
  }

  console.log('[update-score] scored recording:', student_recording_id, 'score:', overall_score)

  return json({ updated: true })
})
