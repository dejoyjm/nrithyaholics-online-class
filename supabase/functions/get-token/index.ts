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

// ── Get ghost peer_ids for this user_id in the room ─────────────────────────
// Returns array of peer_ids that are still active (left_at == null).
// These are ghost peers left behind when mobile WebRTC didn't close cleanly.
async function getGhostPeerIds(roomId: string, userId: string, mgmtToken: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://api.100ms.live/v2/sessions?room_id=${roomId}&active=true`,
      { headers: { 'Authorization': `Bearer ${mgmtToken}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    const ghostIds: string[] = []
    const sessions = data?.data || []
    for (const s of sessions) {
      const peers = s.peers || {}
      // peers is keyed by peer_id — that key IS the peer_id for the remove API
      for (const [peerId, peer] of Object.entries(peers) as [string, any][]) {
        if (peer.user_id === userId && peer.left_at == null) {
          ghostIds.push(peerId)
        }
      }
    }
    return ghostIds
  } catch {
    return [] // fail open
  }
}

// ── Remove ghost peers from the active room ───────────────────────────────────
// Called when recently_left=true to clean up stale WebRTC connections
// before issuing a fresh token. Fails silently — never blocks a join.
async function removeGhostPeers(roomId: string, ghostPeerIds: string[], mgmtToken: string): Promise<void> {
  for (const peerId of ghostPeerIds) {
    try {
      await fetch(
        `https://api.100ms.live/v2/active-rooms/${roomId}/remove-peers`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mgmtToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            peer_id: peerId,
            reason: 'Reconnecting from same device',
          }),
        }
      )
      console.log(`Removed ghost peer ${peerId} from room ${roomId}`)
    } catch (err) {
      console.error(`Failed to remove ghost peer ${peerId}:`, err)
      // Continue — try to remove remaining ghosts even if one fails
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // recently_left: client sends true when user just left this session
    // on THIS device within the last 90 seconds. We skip the peer check
    // because 100ms takes up to 60s to clear a departed peer, causing
    // false "already joined" blocks on legitimate rejoins.
    const { session_id, recently_left } = await req.json()

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

    const isChoreo = session.choreographer_id === user.id
    const isAdmin  = profile?.is_admin === true
    const hmsRole  = (isChoreo || isAdmin) ? 'host' : 'guest'
    const isHost   = hmsRole === 'host'

    const { data: config } = await supabase
      .from('platform_config')
      .select('host_pre_join_minutes, guest_pre_join_minutes, host_grace_minutes, guest_grace_minutes')
      .eq('id', 1).single()

    const preJoinMinutes = isHost
      ? (session.host_pre_join_minutes_override  ?? config?.host_pre_join_minutes  ?? 15)
      : (session.guest_pre_join_minutes_override ?? config?.guest_pre_join_minutes ?? 5)

    const graceMinutes = isHost
      ? (session.host_grace_minutes_override  ?? config?.host_grace_minutes  ?? 30)
      : (session.guest_grace_minutes_override ?? config?.guest_grace_minutes ?? 15)

    const nowEpoch       = Math.floor(Date.now() / 1000)
    const scheduledStart = Math.floor(new Date(session.scheduled_at).getTime() / 1000)
    const scheduledEnd   = scheduledStart + (session.duration_minutes || 60) * 60
    const tokenValidFrom = scheduledStart - (preJoinMinutes * 60)
    const tokenExpiry    = scheduledEnd   + (graceMinutes   * 60)

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

    if (nowEpoch > tokenExpiry) return new Response(
      JSON.stringify({ error: 'session_ended', message: 'This session has ended.' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

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

    let roomId = session.room_id
    const mgmtToken = await getManagementToken()

    if (!roomId) {
      roomId = await createRoom(session_id, mgmtToken)
      await supabase.from('sessions').update({ room_id: roomId }).eq('id', session_id)
    }

    // ── Gate: one device per learner ─────────────────────────────
    // Hosts always exempt. For guests:
    // - recently_left=true → user just left on THIS device.
    //   Mobile WebRTC often leaves ghost peers behind (left_at never set).
    //   Remove any ghosts first, then issue fresh token.
    // - recently_left=false → normal join. Block if already active elsewhere.
    if (!isHost) {
      const ghostPeerIds = await getGhostPeerIds(roomId, user.id, mgmtToken)

      if (recently_left) {
        // Clean up ghost peers so the fresh join has a clean slate
        if (ghostPeerIds.length > 0) {
          await removeGhostPeers(roomId, ghostPeerIds, mgmtToken)
          // Brief wait for 100ms to process the removals
          await new Promise(r => setTimeout(r, 800))
        }
      } else {
        // Normal join — block if already active on another device
        if (ghostPeerIds.length > 0) {
          return new Response(
            JSON.stringify({
              error: 'already_joined',
              message: 'You are already in this class on another device or tab. Please leave that session first.',
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
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