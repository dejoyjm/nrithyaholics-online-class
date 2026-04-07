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

async function presignR2Put(
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

  // Query params must be sorted alphabetically by key name
  const qs = new URLSearchParams([
    ['X-Amz-Algorithm',     'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential',    credential],
    ['X-Amz-Date',          amzDate],
    ['X-Amz-Expires',       String(expiresSeconds)],
    ['X-Amz-SignedHeaders',  'host'],
  ])

  const canonicalRequest = [
    'PUT',
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

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Verify caller
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'unauthorized' }, 401)

  const body = await req.json().catch(() => null)
  const { session_id, booking_id, file_size, mime_type } = body ?? {}
  if (!session_id || !booking_id) return json({ error: 'missing params' }, 400)

  // Verify booking belongs to this user and is confirmed
  const { data: booking } = await supabase
    .from('bookings')
    .select('id')
    .eq('id', booking_id)
    .eq('session_id', session_id)
    .eq('booked_by', user.id)
    .eq('status', 'confirmed')
    .maybeSingle()
  if (!booking) return json({ error: 'forbidden' }, 403)

  const accountId   = Deno.env.get('R2_ACCOUNT_ID')!
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')!
  const secretKey   = Deno.env.get('R2_SECRET_ACCESS_KEY')!
  const bucket      = Deno.env.get('R2_BUCKET') ?? 'nrh-recordings'

  const timestamp = Date.now()
  const objectKey = `student-uploads/${session_id}/${booking_id}/${timestamp}.mp4`
  const r2Key     = `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${objectKey}`

  const uploadUrl = await presignR2Put(accountId, accessKeyId, secretKey, bucket, objectKey, 3600)

  const { data: recording, error: insertErr } = await supabase
    .from('recordings')
    .insert({
      session_id,
      booking_id,
      recorder_type:    'student',
      r2_url:           r2Key,
      file_size_bytes:  file_size || null,
    })
    .select('id')
    .single()

  if (insertErr) {
    console.log('[upload-student-video] insert error:', JSON.stringify(insertErr))
    return json({ error: 'db_error' }, 500)
  }

  console.log('[upload-student-video] created recording:', recording?.id, 'user:', user.id)

  // Fire-and-forget: trigger scoring pipeline — do not await, do not block response
  const internalSecret = Deno.env.get('INTERNAL_SECRET') ?? ''
  EdgeRuntime.waitUntil(
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/score-dance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret,
      },
      body: JSON.stringify({
        recording_id: recording?.id,
        session_id,
        booking_id,
      }),
    })
      .then(r => r.json().catch(() => ({})))
      .then(data => console.log('[upload-student-video] score-dance queued:', data))
      .catch(e  => console.error('[upload-student-video] score-dance trigger error:', e))
  )

  return json({ upload_url: uploadUrl, recording_id: recording?.id })
})
