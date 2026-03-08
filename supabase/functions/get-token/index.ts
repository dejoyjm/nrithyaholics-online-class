import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create } from 'https://deno.land/x/djwt@v2.8/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HMS_ACCESS_KEY = Deno.env.get('HMS_ACCESS_KEY')!
const HMS_APP_SECRET = Deno.env.get('HMS_APP_SECRET')!
const HMS_TEMPLATE_ID = '69aca87c6236da36a7d8c593'

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
  tokenValidFrom: number, tokenExpiry: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(HMS_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const now = Math.floor(Date.now() / 1000)
  return await create({ alg: 'HS256', typ: 'JWT' }, {
    access_key: HMS_ACCESS_KEY, room_id: roomId, user_id: userId,
    role, type: 'app', version: 2,
    iat: now, nbf: tokenValidFrom, exp: tokenExpiry, jti: crypto.randomUUID(),
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
      .from('profiles').select('full_name, is_admin, role').eq('id', user.id).single()

    // ── Role: determine first — drives config selection ─────────
    const isChoreo = session.choreographer_id === user.id
    const isAdmin  = profile?.is_admin === true
    const hmsRole  = (isChoreo || isAdmin) ? 'host' : 'guest'
    const isHost   = hmsRole === 'host'

    // ── Platform config ─────────────────────────────────────────
    const { data: config } = await supabase
      .from('platform_config')
      .select('host_pre_join_minutes, guest_pre_join_minutes, host_grace_minutes, guest_grace_minutes')
      .eq('id', 1).single()

    // Priority: per-session override → platform config → safety fallback
    const preJoinMinutes = isHost
      ? (session.host_pre_join_minutes_override  ?? config?.host_pre_join_minutes  ?? 15)
      : (session.guest_pre_join_minutes_override ?? config?.guest_pre_join_minutes ?? 5)

    const graceMinutes = isHost
      ? (session.host_grace_minutes_override  ?? config?.host_grace_minutes  ?? 30)
      : (session.guest_grace_minutes_override ?? config?.guest_grace_minutes ?? 15)

    // ── Wall-clock window ───────────────────────────────────────
    const nowEpoch        = Math.floor(Date.now() / 1000)
    const scheduledStart  = Math.floor(new Date(session.scheduled_at).getTime() / 1000)
    const scheduledEnd    = scheduledStart + (session.duration_minutes || 60) * 60
    const tokenValidFrom  = scheduledStart - (preJoinMinutes * 60)
    const tokenExpiry     = scheduledEnd   + (graceMinutes   * 60)

    // ── Gate: too early ─────────────────────────────────────────
    if (nowEpoch < tokenValidFrom) {
      const minsLeft = Math.ceil((tokenValidFrom - nowEpoch) / 60)
      return new Response(
        JSON.stringify({
          error: 'too_early',
          message: `Classroom opens in ${minsLeft} minute${minsLeft !== 1 ? 's' : ''}. Come back then!`,
          opens_at: tokenValidFrom,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Gate: session over ──────────────────────────────────────
    if (nowEpoch > tokenExpiry) return new Response(
      JSON.stringify({ error: 'session_ended', message: 'This session has ended.' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

    // ── Learner: verify confirmed booking ───────────────────────
    if (!isHost) {
      const { data: booking } = await supabase
        .from('bookings').select('id, kicked')
        .eq('session_id', session_id).eq('booked_by', user.id)
        .eq('status', 'confirmed').maybeSingle()

      if (!booking) return new Response(
        JSON.stringify({ error: 'No confirmed booking found for this session' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
      if (booking.kicked) return new Response(
        JSON.stringify({ error: 'You have been removed from this session' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Get or create 100ms room ────────────────────────────────
    let roomId = session.room_id
    if (!roomId) {
      const mgmtToken = await getManagementToken()
      roomId = await createRoom(session_id, mgmtToken)
      await supabase.from('sessions').update({ room_id: roomId }).eq('id', session_id)
    }

    const userName  = profile?.full_name || user.email?.split('@')[0] || 'Participant'
    const roomToken = await getRoomToken(roomId, user.id, hmsRole, userName, tokenValidFrom, tokenExpiry)

    return new Response(
      JSON.stringify({
        token: roomToken, room_id: roomId, role: hmsRole, user_name: userName,
        session_ends_at: scheduledEnd, token_expires_at: tokenExpiry,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('get-token error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})