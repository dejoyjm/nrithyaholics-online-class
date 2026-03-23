const puppeteer = require('puppeteer')
const { v4: uuid } = require('uuid')
const { execSync } = require('child_process')

// Map of bot_id → { browser, page }
const activeBots = new Map()

/**
 * For YouTube URLs, use yt-dlp to extract a direct audio stream URL.
 * This is more reliable than embedding a YouTube player in a headless browser
 * (no ads, no interstitials, works with age-restricted content).
 */
function resolveAudioUrl(trackUrl, trackType) {
  if (trackType !== 'youtube') return trackUrl
  try {
    console.log(`[yt-dlp] resolving audio URL for: ${trackUrl}`)
    // -f bestaudio: pick the best audio-only format
    // -g: print the direct URL without downloading
    const audioUrl = execSync(
      `yt-dlp -f "bestaudio[ext=webm]/bestaudio/best" -g "${trackUrl}"`,
      { timeout: 30000 }
    ).toString().trim()
    console.log(`[yt-dlp] resolved to: ${audioUrl.slice(0, 80)}...`)
    return audioUrl
  } catch (err) {
    console.error('[yt-dlp] failed, falling back to original URL:', err.message)
    return trackUrl
  }
}

async function startBot({ room_id, token, track_url, track_type, session_id }) {
  const audioUrl = resolveAudioUrl(track_url, track_type)

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      // Required for Web Audio API to work in headless
      '--allow-running-insecure-content',
    ],
  })

  const page = await browser.newPage()

  // Grant microphone permission to the app origin
  const appUrl = process.env.APP_URL || 'https://online.nrithyaholics.in'
  await browser.defaultBrowserContext().overridePermissions(appUrl, ['microphone'])

  // Suppress console noise from the bot page
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[bot-page] ${msg.text()}`)
  })
  page.on('pageerror', (err) => console.error('[bot-page] uncaught error:', err.message))

  // Build the bot page URL — params in query string, route in hash
  const params = new URLSearchParams({
    token,
    track_url: audioUrl,
    track_type,
    session_id,
  })
  const botPageUrl = `${appUrl}/?${params.toString()}#/music-bot`

  console.log(`[startBot] navigating to bot page (session=${session_id})`)
  await page.goto(botPageUrl, { waitUntil: 'networkidle0', timeout: 60000 })

  // Wait up to 45 seconds for the bot to join the room and signal readiness
  await page.waitForFunction('window.botReady === true', { timeout: 45000 })

  const bot_id = uuid()
  activeBots.set(bot_id, { browser, page })
  console.log(`[startBot] bot ${bot_id} ready for room ${room_id}`)

  return bot_id
}

async function controlBot(bot_id, action, value) {
  const bot = activeBots.get(bot_id)
  if (!bot) throw new Error(`Bot not found: ${bot_id}`)

  const result = await bot.page.evaluate(
    (action, value) => window.botControl(action, value),
    action, value
  )
  return result
}

async function stopBot(bot_id) {
  const bot = activeBots.get(bot_id)
  if (!bot) {
    console.warn(`[stopBot] bot ${bot_id} not found — already stopped?`)
    return
  }
  try {
    await bot.browser.close()
  } catch (err) {
    console.error(`[stopBot] error closing browser for ${bot_id}:`, err.message)
  }
  activeBots.delete(bot_id)
  console.log(`[stopBot] bot ${bot_id} stopped`)
}

module.exports = { startBot, controlBot, stopBot }
