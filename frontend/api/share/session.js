const APP_URL = 'https://online.nrithyaholics.in'

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function safeId(raw) {
  return /^[0-9a-f-]{1,36}$/i.test(String(raw ?? '')) ? String(raw) : null
}

export default async function handler(req, res) {
  const rawId = req.query.id
  const id = safeId(rawId)

  if (!id) {
    res.status(400).send('Invalid session ID')
    return
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

  let title = 'NrithyaHolics — Live Dance Classes'
  let description = 'Book live dance classes with top choreographers on NrithyaHolics.'
  let image = `${APP_URL}/og-default.jpg`

  try {
    const apiRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(id)}&select=title,description,cover_photo_url,card_thumbnail_url,scheduled_at,profiles(full_name)`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    )
    const rows = await apiRes.json()
    const session = Array.isArray(rows) ? rows[0] : null

    if (session) {
      const choreoName = session.profiles?.full_name || ''
      const dateStr = session.scheduled_at
        ? new Date(session.scheduled_at).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric',
            timeZone: 'Asia/Kolkata',
          })
        : ''

      title = `${session.title} — NrithyaHolics`

      if (session.description) {
        description = session.description.replace(/\n+/g, ' ').trim().slice(0, 200)
      } else if (choreoName && dateStr) {
        description = `Live dance class by ${choreoName} on ${dateStr}.`
      } else if (choreoName) {
        description = `Live dance class by ${choreoName} on NrithyaHolics.`
      }

      // Prefer card thumbnail (smaller, crop-optimised) over full cover for OG
      const imgCandidate = session.card_thumbnail_url || session.cover_photo_url
      if (imgCandidate) image = imgCandidate
    }
  } catch (_) {
    // fall through with defaults
  }

  const redirectUrl = `${APP_URL}/?session=${id}`
  const canonicalUrl = `${APP_URL}/share/session/${id}`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
  res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:site_name" content="NrithyaHolics" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />

  <meta http-equiv="refresh" content="0;url=${escapeHtml(redirectUrl)}" />
</head>
<body>
  <script>window.location.replace(${JSON.stringify(redirectUrl)})<\/script>
  <p style="font-family:sans-serif;text-align:center;padding:40px">
    Redirecting to <a href="${escapeHtml(redirectUrl)}">NrithyaHolics</a>…
  </p>
</body>
</html>`)
}
