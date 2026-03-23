import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BOT_SERVER_URL    = Deno.env.get('MUSIC_BOT_SERVER_URL')!
const BOT_SERVER_SECRET = Deno.env.get('MUSIC_BOT_SERVER_SECRET')!

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
      .from('sessions').select('choreographer_id, music_bot_id').eq('id', session_id).single()
    if (sessionError || !session) return new Response(
      JSON.stringify({ error: 'Session not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

    const { data: profile } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()

    const isChoreo = session.choreographer_id === user.id
    const isAdmin  = profile?.is_admin === true

    if (!isChoreo && !isAdmin) return new Response(
      JSON.stringify({ error: 'Only the session choreographer or admin can stop a music bot' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

    if (session.music_bot_id) {
      // Tell bot server to stop — fire and don't block on errors
      await fetch(`${BOT_SERVER_URL}/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Secret': BOT_SERVER_SECRET,
        },
        body: JSON.stringify({ bot_id: session.music_bot_id }),
      }).catch((err) => console.error('Bot server stop error (non-fatal):', err))

      // Clear bot state regardless of whether the server call succeeded
      await supabase.from('sessions').update({
        music_bot_id:     null,
        music_bot_status: null,
      }).eq('id', session_id)
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('stop-music-bot error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
