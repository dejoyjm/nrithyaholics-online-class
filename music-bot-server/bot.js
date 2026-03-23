const puppeteer = require('puppeteer')
const { v4: uuid } = require('uuid')

// Map of bot_id → { browser, page }
const activeBots = new Map()

async function startBot({ room_id, token, track_url, track_type, session_id }) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-web-security',
      // Disable features that can interfere with audio capture and autoplay
      '--disable-features=IsolateOrigins,site-per-process,PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies',
      '--allow-running-insecure-content',
      // Auto-select this tab when getDisplayMedia is called (no picker dialog)
      '--auto-select-tab-capture-source=NrithyaHolics',
    ],
  })

  const page = await browser.newPage()

  // Grant microphone + display-capture permissions to the app origin
  const appUrl = process.env.APP_URL || 'https://online.nrithyaholics.in'
  await browser.defaultBrowserContext().overridePermissions(appUrl, ['microphone'])

  // Forward all bot-page console output to Railway logs for debugging
  page.on('console', (msg) => {
    const text = msg.text()
    if (msg.type() === 'error') console.error(`[bot-page] ${text}`)
    else if (text.startsWith('[MusicBot]')) console.log(`[bot-page] ${text}`)
  })
  page.on('pageerror', (err) => console.error('[bot-page] uncaught error:', err.message))

  // Build the bot page URL — params in query string, route in hash
  // track_url is passed as-is; the bot page handles type-specific playback
  const params = new URLSearchParams({
    token,
    track_url,
    track_type,
    session_id,
  })
  const botPageUrl = `${appUrl}/?${params.toString()}#/music-bot`

  console.log(`[startBot] navigating to bot page (session=${session_id} type=${track_type})`)
  // Use 'load' not 'networkidle0' — YouTube pages never reach networkidle0
  await page.goto(botPageUrl, { waitUntil: 'load', timeout: 60000 })

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
