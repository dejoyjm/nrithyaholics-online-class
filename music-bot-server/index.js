const express = require('express')
const { startBot, controlBot, stopBot } = require('./bot')

const app = express()
app.use(express.json())

// Auth middleware — every route requires the shared secret header
app.use((req, res, next) => {
  if (req.path === '/health') return next() // health check exempt
  if (req.headers['x-secret'] !== process.env.BOT_SERVER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
})

app.post('/start', async (req, res) => {
  try {
    const { room_id, token, track_url, track_type, session_id } = req.body
    if (!token || !track_url || !track_type) {
      return res.status(400).json({ error: 'token, track_url, track_type required' })
    }
    console.log(`[start] session=${session_id} room=${room_id} type=${track_type}`)
    const bot_id = await startBot({ room_id, token, track_url, track_type, session_id })
    res.json({ bot_id })
  } catch (err) {
    console.error('[start] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.post('/control', async (req, res) => {
  try {
    const { bot_id, action, value } = req.body
    if (!bot_id || !action) {
      return res.status(400).json({ error: 'bot_id and action required' })
    }
    const result = await controlBot(bot_id, action, value)
    res.json(result)
  } catch (err) {
    console.error('[control] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.post('/stop', async (req, res) => {
  try {
    const { bot_id } = req.body
    if (!bot_id) return res.status(400).json({ error: 'bot_id required' })
    await stopBot(bot_id)
    res.json({ ok: true })
  } catch (err) {
    console.error('[stop] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/health', (_, res) => res.json({ ok: true, bots: 'see /status' }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Music bot server on port ${PORT}`))
