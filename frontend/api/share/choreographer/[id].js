const APP_URL = 'https://online.nrithyaholics.in'

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function safeId(raw) {
  return /^[0-9a-f-]{1,36}$/i.test(raw) ? raw : null
}

export default async function handler(req, res) {
  const rawId = req.query.id
  const id = safeId(rawId)

  if (!id) {
    res.status(400).send('Invalid choreographer ID')
    return
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

  let title = 'NrithyaHolics — Live Dance Classes'
  let description = 'Book live dance classes with top choreographers on NrithyaHolics.'
  let image = `${APP_URL}/og-default.jpg`

  try {
    const apiRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=full_name,bio,avatar_url,style_tags`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    )
    const rows = await apiRes.json()
    const choreo = Array.isArray(rows) ? rows[0] : null

    if (choreo) {
      const name = choreo.full_name || 'Choreographer'
      const styles = choreo.style_tags?.join(', ') || ''

      title = `${name} — Dance Teacher on NrithyaHolics`

      if (choreo.bio) {
        description = choreo.bio.replace(/\n+/g, ' ').trim().slice(0, 200)
      } else if (styles) {
        description = `${name} teaches ${styles} on NrithyaHolics. Book a live class now.`
      } else {
        description = `Live dance classes by ${name} on NrithyaHolics.`
      }

      if (choreo.avatar_url) image = choreo.avatar_url
    }
  } catch (_) {
    // fall through with defaults
  }

  const redirectUrl = `${APP_URL}/?choreo=${id}`
  const canonicalUrl = `${APP_URL}/share/choreographer/${id}`

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

  <meta property="og:type" content="profile" />
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
  <script>window.location.replace(${JSON.stringify(redirectUrl)})</script>
  <p style="font-family:sans-serif;text-align:center;padding:40px">
    Redirecting to <a href="${escapeHtml(redirectUrl)}">NrithyaHolics</a>…
  </p>
</body>
</html>`)
}
