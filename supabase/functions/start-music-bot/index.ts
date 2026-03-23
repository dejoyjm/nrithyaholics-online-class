import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create } from 'https://deno.land/x/djwt@v2.8/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HMS_ACCESS_KEY     = Deno.env.get('HMS_ACCESS_KEY')!
const HMS_APP_SECRET     = Deno.env.get('HMS_APP_SECRET')!
const HMS_TEMPLATE_ID    = '69aca87c6236da36a7d8c593'
const BOT_SERVER_URL     = Deno.env.get('MUSIC_BOT_SERVER_URL')!
const BOT_SERVER_SECRET  = Deno.env.get('MUSIC_BOT_SERVER_SECRET')!

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

async function getRoomToken(
  roomId: string, userId: string, role: string, userName: string,
  nbf: number, exp: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(HMS_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const now = Math.floor(Date.now() / 1000)
  return await create({ alg: 'HS256', typ: 'JWT' }, {
    access_key: HMS_ACCESS_KEY, room_id: roomId, user_id: userId,
    role, type: 'app', version: 2,
    iat: now, nbf, exp, jti: crypto.randomUUID(),
  }, key)
}

async function createRoom(sessionId: string, mgmtToken: string): Promise<string> {
  const res = await fetch('https://api.100ms.live/v2/rooms', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${mgmtToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `nrh-${sessionId}`,
      description: `NrithyaHolics session ${sessionId}`,
      template_id: HMS_TEMPLATE_ID, region: 'in',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Failed to create room')
  return data.id
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { session_id } = await req.json()

    if (!session_id) return new Response(
      JSON.stringify({ error: 'session_id required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(
      JSON.stringify({ error: 'No auth token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return new Response(
      JSON.stringify({ error: 'Invalid auth token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

    const { data: session, error: sessionError } = await supabase
      .from('sessions').select('*').eq('id', session_id).single()
    if (sessionError || !session) return new Response(
      JSON.stringify({ error: 'Session not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

    const { data: profile } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()

    const isChoreo = session.choreographer_id === user.id
    const isAdmin  = profile?.is_admin === true

    if (!isChoreo && !isAdmin) return new Response(
      JSON.stringify({ error: 'Only the session choreographer or admin can start a music bot' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

    if (!session.music_track_url) return new Response(
      JSON.stringify({ error: 'No music track configured for this session' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

    // Ensure room exists
    let roomId = session.room_id
    const mgmtToken = await getManagementToken()
    if (!roomId) {
      roomId = await createRoom(session_id, mgmtToken)
      await supabase.from('sessions').update({ room_id: roomId }).eq('id', session_id)
    }

    // Generate music role token (6-hour window, no time gate)
    const now = Math.floor(Date.now() / 1000)
    const musicToken = await getRoomToken(
      roomId, `music-bot-${user.id}`, 'music', 'Music',
      now, now + 6 * 60 * 60
    )

    // Launch bot on the bot server
    const botRes = await fetch(`${BOT_SERVER_URL}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Secret': BOT_SERVER_SECRET,
      },
      body: JSON.stringify({
        room_id:    roomId,
        token:      musicToken,
        track_url:  session.music_track_url,
        track_type: session.music_track_type,
        session_id,
      }),
    })

    if (!botRes.ok) {
      const botErr = await botRes.json().catch(() => ({}))
      console.error('Bot server error:', botErr)
      return new Response(
        JSON.stringify({ error: botErr.error || 'Bot server failed to start' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { bot_id } = await botRes.json()

    // Persist bot_id and starting status
    await supabase.from('sessions').update({
      music_bot_id:     bot_id,
      music_bot_status: 'starting',
    }).eq('id', session_id)

    return new Response(
      JSON.stringify({ bot_id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('start-music-bot error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
