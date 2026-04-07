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

// ── AWS SigV4 helpers (Web Crypto — no external libs) ─────────────────────

async function hmacSha256(key: ArrayBuffer, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg))
}

async function sha256hex(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function getSigningKey(secret: string, date: string, region: string, service: string) {
  const kDate    = await hmacSha256(new TextEncoder().encode(`AWS4${secret}`), date)
  const kRegion  = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  return hmacSha256(kService, 'aws4_request')
}

async function presignR2Get(
  accountId: string,
  accessKeyId: string,
  secretKey: string,
  bucket: string,
  objectKey: string,
  expiresSeconds: number,
): Promise<string> {
  const now        = new Date()
  const dateStamp  = now.toISOString().slice(0, 10).replace(/-/g, '')
  const amzDate    = now.toISOString().replace(/[:\-]/g, '').slice(0, 15) + 'Z'
  const region     = 'auto'
  const service    = 's3'
  const host       = `${bucket}.${accountId}.r2.cloudflarestorage.com`
  const path       = `/${objectKey}`
  const credential = `${accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`

  const qs = new URLSearchParams([
    ['X-Amz-Algorithm',    'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential',   credential],
    ['X-Amz-Date',         amzDate],
    ['X-Amz-Expires',      String(expiresSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ])

  const canonicalRequest = [
    'GET',
    path,
    qs.toString(),
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    `${dateStamp}/${region}/${service}/aws4_request`,
    await sha256hex(canonicalRequest),
  ].join('\n')

  const sigKey = await getSigningKey(secretKey, dateStamp, region, service)
  const sig    = toHex(await hmacSha256(sigKey, stringToSign))

  qs.append('X-Amz-Signature', sig)
  return `https://${host}${path}?${qs.toString()}`
}

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  // Internal secret auth — no JWT needed
  const incomingSecret = req.headers.get('x-internal-secret')
  if (!incomingSecret || incomingSecret !== Deno.env.get('INTERNAL_SECRET')) {
    return json({ error: 'unauthorized' }, 401)
  }

  const body = await req.json().catch(() => null)
  const { recording_id, session_id, booking_id } = body ?? {}
  if (!recording_id || !session_id || !booking_id) return json({ error: 'missing params' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 1. Find choreographer reference recording with extracted pose
  const { data: refRec } = await supabase
    .from('recordings')
    .select('id, r2_url, pose_r2_key')
    .eq('session_id', session_id)
    .eq('recorder_type', 'choreographer')
    .eq('pose_extracted', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!refRec) {
    console.log('[score-dance] no reference recording for session:', session_id)
    await supabase.from('dance_scores').insert({
      session_id,
      booking_id,
      upload_id:    recording_id,
      status:       'no_reference',
    })
    return json({ status: 'no_reference' })
  }

  // 2. Find student recording
  const { data: studentRec } = await supabase
    .from('recordings')
    .select('id, r2_url')
    .eq('id', recording_id)
    .single()
  if (!studentRec) return json({ error: 'student recording not found' }, 404)

  // 3. Presign both URLs
  const accountId   = Deno.env.get('R2_ACCOUNT_ID')!
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')!
  const secretKey   = Deno.env.get('R2_SECRET_ACCESS_KEY')!
  const bucket      = Deno.env.get('R2_BUCKET') ?? 'nrh-recordings'

  // pose_r2_key is a relative path (e.g. pose-data/{id}_keypoints.json)
  const refKeypointsUrl = await presignR2Get(
    accountId, accessKeyId, secretKey, bucket, refRec.pose_r2_key, 3600,
  )

  // student r2_url is a full https URL — extract bucket + key
  const studentBase   = studentRec.r2_url.split('?')[0]
  const studentUrlObj = new URL(studentBase)
  const studentBucket = studentUrlObj.hostname.split('.')[0]
  const studentKey    = studentUrlObj.pathname.slice(1)
  const studentVideoUrl = await presignR2Get(
    accountId, accessKeyId, secretKey, studentBucket, studentKey, 3600,
  )

  // 4. Insert dance_scores row immediately with status='processing'
  const { data: scoreRow, error: insertErr } = await supabase
    .from('dance_scores')
    .insert({
      session_id,
      booking_id,
      reference_recording_id: refRec.id,
      upload_id:              recording_id,
      overall_score:          null,
      status:                 'processing',
    })
    .select('id')
    .single()

  if (insertErr) {
    console.error('[score-dance] dance_scores insert error:', insertErr.message)
    return json({ error: 'db_error' }, 500)
  }

  // 5. Fire-and-forget to Railway pose service
  const poseServiceUrl = Deno.env.get('POSE_SERVICE_URL')!
  const poseSecret     = Deno.env.get('POSE_SERVICE_SECRET') ?? ''

  EdgeRuntime.waitUntil(
    fetch(`${poseServiceUrl}/score-student`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-secret': poseSecret,
      },
      body: JSON.stringify({
        reference_keypoints_url: refKeypointsUrl,
        student_video_url:       studentVideoUrl,
        session_id,
        recording_id,
        student_recording_id:    recording_id,
      }),
    })
      .then(r => r.json().catch(() => ({})))
      .then(data => console.log('[score-dance] pose service responded for recording:', recording_id, data))
      .catch(e  => console.error('[score-dance] pose service error for recording:', recording_id, e))
  )

  console.log('[score-dance] queued scoring for recording:', recording_id, 'score_id:', scoreRow?.id)

  return json({ status: 'processing', score_id: scoreRow?.id })
})
