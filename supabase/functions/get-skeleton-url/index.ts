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

async function presignR2(
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
    ['X-Amz-Algorithm',     'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential',    credential],
    ['X-Amz-Date',          amzDate],
    ['X-Amz-Expires',       String(expiresSeconds)],
    ['X-Amz-SignedHeaders',  'host'],
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

  // Admin only
  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (profile?.is_admin !== true) return json({ error: 'forbidden' }, 403)

  const body = await req.json().catch(() => null)
  const { recording_id } = body ?? {}
  if (!recording_id) return json({ error: 'missing recording_id' }, 400)

  // Fetch recording — need skeleton_r2_key
  const { data: recording } = await supabase
    .from('recordings').select('id, skeleton_r2_key, pose_extracted').eq('id', recording_id).single()
  if (!recording) return json({ error: 'recording not found' }, 404)
  if (!recording.pose_extracted || !recording.skeleton_r2_key) {
    return json({ error: 'skeleton not yet extracted' }, 404)
  }

  // skeleton_r2_key is stored as "pose-data/{id}_skeleton.mp4" (no hostname)
  // Bucket is the env-configured bucket name
  const bucket    = Deno.env.get('R2_BUCKET') ?? 'nrh-recordings'
  const objectKey = recording.skeleton_r2_key

  const accountId   = Deno.env.get('R2_ACCOUNT_ID')!
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')!
  const secretKey   = Deno.env.get('R2_SECRET_ACCESS_KEY')!

  const presignedUrl = await presignR2(accountId, accessKeyId, secretKey, bucket, objectKey, 3600)

  console.log('[get-skeleton-url] served skeleton for recording:', recording_id, 'user:', user.id)

  return json({ url: presignedUrl, expires_at: new Date(Date.now() + 3_600_000).toISOString() })
})
