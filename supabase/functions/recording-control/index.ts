import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create } from 'https://deno.land/x/djwt@v2.8/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HMS_ACCESS_KEY = Deno.env.get('HMS_ACCESS_KEY')!
const HMS_APP_SECRET = Deno.env.get('HMS_APP_SECRET')!
// Beam recording needs the meeting URL to launch a headless browser
const HMS_MEETING_BASE = 'https://dejoy-videoconf-406.app.100ms.live/meeting'

async function getManagementToken(): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(HMS_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const now = Math.floor(Date.now() / 1000)
  return await create({ alg: 'HS256', typ: 'JWT' }, {
    access_key: HMS_ACCESS_KEY, type: 'management', version: 2,
    iat: now, exp: now + 24 * 60 * 60, nbf: now, jti: crypto.randomUUID(),
  }, key)
}

// Always returns 200 — errors are surfaced in JSON body so the frontend can
// fail silently without interrupting the live class experience.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const respond = (body: object) => new Response(
    JSON.stringify(body),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )

  try {
    const { session_id, action, recording_id } = await req.json()

    if (!session_id || !action) {
      return respond({ success: false, error: 'session_id and action required' })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: session, error: sessionError } = await supabase
      .from('sessions').select('room_id').eq('id', session_id).single()

    if (sessionError || !session?.room_id) {
      return respond({ success: false, error: 'Session or room not found' })
    }

    const roomId = session.room_id
    const mgmtToken = await getManagementToken()

    let apiUrl: string
    let body: Record<string, unknown> | undefined

    switch (action) {
      case 'start': {
        const now = Math.floor(Date.now() / 1000)
        const beamTokenKey = await crypto.subtle.importKey(
          'raw', new TextEncoder().encode(HMS_APP_SECRET),
          { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        )
        const beamToken = await create({ alg: 'HS256', typ: 'JWT' }, {
          access_key: HMS_ACCESS_KEY,
          type: 'app',
          version: 2,
          room_id: roomId,
          user_id: 'beam-recorder',
          role: 'recorder',
          iat: now,
          exp: now + 24 * 60 * 60,
          nbf: now,
          jti: crypto.randomUUID(),
        }, beamTokenKey)

        const meetingUrl = `https://dejoy-videoconf-406.app.100ms.live/meeting/${roomId}?skip_preview=true&auth_token=${beamToken}`

        body = {
          meeting_url: meetingUrl,
          resolution: { width: 720, height: 1280 },
        }

        console.log('[recording] beam token generated, meeting_url:', meetingUrl)

        apiUrl = `https://api.100ms.live/v2/recordings/room/${roomId}/start`
        break
      }
      case 'stop':
        apiUrl = `https://api.100ms.live/v2/recordings/room/${roomId}/stop`
        break
      case 'pause':
        apiUrl = `https://api.100ms.live/v2/recordings/room/${roomId}/pause`
        body = undefined
        break
      case 'resume':
        apiUrl = `https://api.100ms.live/v2/recordings/room/${roomId}/resume`
        body = undefined
        break
      default:
        return respond({ success: false, error: `Unknown action: ${action}` })
    }

    const hmsRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mgmtToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const hmsData = await hmsRes.json().catch(() => ({}))
    console.log('[recording] HMS response:', hmsRes.status, JSON.stringify(hmsData))

    if (!hmsRes.ok) {
      console.error(`recording-control [${action}] error:`, JSON.stringify(hmsData))
      return respond({ success: false, error: hmsData.message || `HMS API error ${hmsRes.status}` })
    }

    return respond({ success: true, recording_id: hmsData.id ?? recording_id ?? null })

  } catch (err) {
    console.error('recording-control unhandled error:', err)
    return respond({ success: false, error: err.message || 'Internal server error' })
  }
})
