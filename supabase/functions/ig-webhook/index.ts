import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const IG_WEBHOOK_VERIFY_TOKEN = Deno.env.get('IG_WEBHOOK_VERIFY_TOKEN')
const IG_APP_SECRET           = Deno.env.get('IG_APP_SECRET')

// Timing-safe hex string comparison — always iterates full length to
// prevent timing attacks that could reveal the expected signature byte-by-byte.
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

async function computeSignature(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  return Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Extracts the IGSID of the user on the other end of the interaction,
// whether this is a DM (messaging) item or a comments/mentions (changes) item.
function extractSenderIgsid(item: any): string | null {
  return item?.sender?.id ?? item?.value?.from?.id ?? null
}

// Extracts the media id involved, when the item shape carries one.
function extractMediaId(item: any): string | null {
  return (
    item?.value?.media?.id ??
    item?.value?.media_id ??
    item?.message?.attachments?.[0]?.payload?.media_id ??
    null
  )
}

serve(async (req) => {
  const startedAt = Date.now()

  // ── GET: Meta subscription verification ─────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    console.log('[ig-webhook] GET verification request — mode:', mode)

    if (mode === 'subscribe' && token && IG_WEBHOOK_VERIFY_TOKEN && timingSafeStringEqual(token, IG_WEBHOOK_VERIFY_TOKEN)) {
      console.log('[ig-webhook] verification token matched — responding with challenge')
      return new Response(challenge ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    console.error('[ig-webhook] verification token mismatch or missing — rejecting')
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // ── POST: inbound Instagram webhook event ───────────────────────────────
  try {
    const rawBody = await req.text()
    console.log('[ig-webhook] POST received — body bytes:', rawBody.length)

    if (!IG_APP_SECRET) {
      console.error('[ig-webhook] IG_APP_SECRET not set — rejecting request')
      return new Response('Unauthorized', { status: 401 })
    }

    const signatureHeader = req.headers.get('x-hub-signature-256')
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      console.error('[ig-webhook] missing or malformed X-Hub-Signature-256 header')
      return new Response('Unauthorized', { status: 401 })
    }

    const providedSig = signatureHeader.slice('sha256='.length)
    const expectedSig = await computeSignature(IG_APP_SECRET, rawBody)
    const signatureValid = timingSafeStringEqual(providedSig, expectedSig)

    console.log('[ig-webhook] signature check:', signatureValid ? 'valid' : 'INVALID')

    if (!signatureValid) {
      console.error('[ig-webhook] signature mismatch — request rejected')
      return new Response('Unauthorized', { status: 401 })
    }

    // Everything past this point must never throw to the client — Meta
    // disables the subscription after repeated non-200 responses, so
    // processing errors are logged/stored, not surfaced as HTTP failures.
    try {
      const payload = JSON.parse(rawBody)
      const entries: any[] = Array.isArray(payload.entry) ? payload.entry : []
      const eventObject: string | undefined = payload.object

      console.log('[ig-webhook] entry count:', entries.length, '— object:', eventObject)

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      const accountCache = new Map<string, string | null>()

      const resolveAccountId = async (igUserId: string | undefined): Promise<string | null> => {
        if (!igUserId) return null
        if (accountCache.has(igUserId)) return accountCache.get(igUserId)!

        const { data, error } = await supabase
          .from('ig_accounts')
          .select('id')
          .eq('ig_user_id', igUserId)
          .maybeSingle()

        if (error) {
          console.error('[ig-webhook] ig_accounts lookup failed for', igUserId, '-', error.message)
        }

        const accountId = data?.id ?? null
        console.log('[ig-webhook] routed entry.id', igUserId, '→ ig_account_id', accountId)
        accountCache.set(igUserId, accountId)
        return accountId
      }

      let insertCount = 0

      for (const entry of entries) {
        const igAccountId = await resolveAccountId(entry?.id)

        const items: Array<{ item: any; field: string }> = [
          ...((entry?.changes ?? []).map((c: any) => ({ item: c, field: c?.field ?? 'unknown' }))),
          ...((entry?.messaging ?? []).map((m: any) => ({ item: m, field: 'messages' }))),
        ]

        for (const { item, field } of items) {
          try {
            const row = {
              ig_account_id: igAccountId,
              event_object: eventObject ?? null,
              event_field: field,
              sender_igsid: extractSenderIgsid(item),
              media_id: extractMediaId(item),
              raw_payload: item,
              status: 'received',
            }

            const { error: insertError } = await supabase.from('ig_events').insert(row)

            if (insertError) {
              console.error('[ig-webhook] ig_events insert failed:', insertError.message)
            } else {
              insertCount++
              console.log('[ig-webhook] inserted event — field:', field, 'sender_igsid:', row.sender_igsid, 'media_id:', row.media_id)
            }
          } catch (itemErr) {
            console.error('[ig-webhook] item processing error (skipped):', itemErr)
          }
        }
      }

      console.log('[ig-webhook] processing complete — inserted:', insertCount, 'of', entries.reduce((n, e) => n + (e?.changes?.length ?? 0) + (e?.messaging?.length ?? 0), 0))
    } catch (processingErr) {
      console.error('[ig-webhook] processing error (event still acknowledged):', processingErr)
    }

    console.log('[ig-webhook] total handling time ms:', Date.now() - startedAt)
    return new Response('EVENT_RECEIVED', { status: 200 })

  } catch (err) {
    console.error('[ig-webhook] unexpected top-level error:', err)
    console.log('[ig-webhook] total handling time ms:', Date.now() - startedAt)
    return new Response('EVENT_RECEIVED', { status: 200 })
  }
})
