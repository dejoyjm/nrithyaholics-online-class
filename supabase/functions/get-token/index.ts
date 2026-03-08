import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v2.8/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HMS_ACCESS_KEY = Deno.env.get('HMS_ACCESS_KEY')!
const HMS_APP_SECRET = Deno.env.get('HMS_APP_SECRET')!
const HMS_TEMPLATE_ID = '69aca87c6236da36a7d8c593'

// Generate 100ms management token (for API calls)
async function getManagementToken(): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(HMS_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const payload = {
    access_key: HMS_ACCESS_KEY,
    type: 'management',
    version: 2,
    iat: getNumericDate(0),
    exp: getNumericDate(24 * 60 * 60), // 24h
    nbf: getNumericDate(0),
    jti: crypto.randomUUID(),
  }
  return await create({ alg: 'HS256', typ: 'JWT' }, payload, key)
}

// Generate 100ms room token for a user
async function getRoomToken(roomId: string, userId: string, role: string, userName: string, sessionDuration: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(HMS_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const bufferMinutes = role === 'host' ? 30 : 15
  const payload = {
    access_key: HMS_ACCESS_KEY,
    room_id: roomId,
    user_id: userId,
    role: role,
    type: 'app',
    version: 2,
    iat: getNumericDate(0),
    exp: getNumericDate((sessionDuration + bufferMinutes) * 60),
    nbf: getNumericDate(0),
    jti: crypto.randomUUID(),
  }
  return await create({ alg: 'HS256', typ: 'JWT' }, payload, key)
}

// Create a 100ms room
async function createRoom(sessionId: string, mgmtToken: string): Promise<string> {
  const res = await fetch('https://api.100ms.live/v2/rooms', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${mgmtToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `nrh-${sessionId}`,
      description: `NrithyaHolics session ${sessionId}`,
      template_id: HMS_TEMPLATE_ID,
      region: 'in',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Failed to create room')
  return data.id
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { session_id } = await req.json()

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: 'session_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get user from token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get session details
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*, profiles(full_name)')
      .eq('id', session_id)
      .single()

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: 'Session not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, is_admin, role')
      .eq('id', user.id)
      .single()

    // Determine role
    const isChoreo = session.choreographer_id === user.id
    const isAdmin = profile?.is_admin === true
    const hmsRole = (isChoreo || isAdmin) ? 'host' : 'guest'

    // If learner, verify they have a confirmed booking
    if (hmsRole === 'guest') {
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, kicked')
        .eq('session_id', session_id)
        .eq('booked_by', user.id)
        .eq('status', 'confirmed')
        .maybeSingle()

      if (!booking) {
        return new Response(
          JSON.stringify({ error: 'No confirmed booking found for this session' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (booking.kicked) {
        return new Response(
          JSON.stringify({ error: 'You have been removed from this session' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Get or create 100ms room
    let roomId = session.room_id

    if (!roomId) {
      const mgmtToken = await getManagementToken()
      roomId = await createRoom(session_id, mgmtToken)

      // Store room_id on session
      await supabase
        .from('sessions')
        .update({ room_id: roomId })
        .eq('id', session_id)
    }

    // Generate room token
    const userName = profile?.full_name || user.email?.split('@')[0] || 'Participant'
    const roomToken = await getRoomToken(
      roomId,
      user.id,
      hmsRole,
      userName,
      session.duration_minutes || 60
    )

    return new Response(
      JSON.stringify({
        token: roomToken,
        room_id: roomId,
        role: hmsRole,
        user_name: userName,
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