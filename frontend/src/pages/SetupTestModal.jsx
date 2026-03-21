import { useState, useEffect, useRef } from 'react'

// ── Artist-friendly Setup Check ──────────────────────────────────
// Philosophy: Run all the geeky checks silently.
// Show ONLY problems + practical plain-English tips.
// If everything is fine, just say "You're all set!" with no tech noise.

const sleep = ms => new Promise(r => setTimeout(r, ms))
const withTimeout = (promise, ms) => Promise.race([promise, sleep(ms).then(() => null)])

// ── Animated progress dots ──
function Dots() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setN(x => (x + 1) % 4), 400)
    return () => clearInterval(iv)
  }, [])
  return <span style={{ letterSpacing: 2 }}>{'●'.repeat(n)}{'○'.repeat(3 - n)}</span>
}

// ── Single issue card (only shown when there's a problem) ──
function IssueCard({ icon, title, tip, severity }) {
  const isError = severity === 'error'
  return (
    <div style={{
      borderRadius: 12, padding: '14px 16px', marginBottom: 10,
      background: isError ? '#fef2f2' : '#fff7ed',
      border: `1px solid ${isError ? '#fecaca' : '#fed7aa'}`,
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <div style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f0c0c', marginBottom: 4 }}>{title}</div>
        <div style={{
          fontSize: 13, color: isError ? '#991b1b' : '#9a3412',
          lineHeight: 1.5,
        }}>{tip}</div>
      </div>
    </div>
  )
}

// ── Tip card (improvement suggestion, even when passing) ──
function TipCard({ icon, tip }) {
  return (
    <div style={{
      borderRadius: 12, padding: '12px 16px', marginBottom: 8,
      background: '#f0f9ff', border: '1px solid #bae6fd',
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <div style={{ fontSize: 18, flexShrink: 0 }}>{icon}</div>
      <div style={{ fontSize: 13, color: '#0369a1', lineHeight: 1.5 }}>{tip}</div>
    </div>
  )
}

export default function SetupTestModal({ onClose, isChoreo, standaloneMode }) {
  const [phase, setPhase] = useState('intro') // intro | checking | result
  const [checkingLabel, setCheckingLabel] = useState('Checking your camera')
  const [issues, setIssues] = useState([])   // { icon, title, tip, severity }
  const [tips, setTips] = useState([])       // { icon, tip } — optional improvement tips
  const [camOk, setCamOk] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  async function runChecks() {
    setPhase('checking')
    const foundIssues = []
    const foundTips = []
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCamOk(false)

    // ── CAMERA ──────────────────────────────────────────────
    setCheckingLabel('Checking your camera')
    await sleep(600)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCamOk(true)
      const settings = stream.getVideoTracks()[0]?.getSettings() || {}
      if ((settings.width || 0) < 320) {
        foundTips.push({ icon: '📷', tip: 'Your camera resolution is low. For the best quality, make sure nothing else (like Zoom or Teams) is using your camera before joining.' })
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        foundIssues.push({
          icon: '📷', severity: 'error',
          title: 'Camera access is blocked',
          tip: 'Click the camera icon 🔒 in your browser\'s address bar → choose "Allow" → then run this check again.',
        })
      } else if (err.name === 'NotFoundError') {
        foundIssues.push({
          icon: '📷', severity: 'error',
          title: 'No camera found',
          tip: 'Connect a webcam or use a device that has a built-in camera. A camera is needed to attend live classes.',
        })
      } else if (err.name === 'NotReadableError') {
        foundIssues.push({
          icon: '📷', severity: 'error',
          title: 'Camera is being used by another app',
          tip: 'Close Zoom, Teams, Meet, or any other video app that might be using your camera, then try again.',
        })
      } else {
        foundIssues.push({
          icon: '📷', severity: 'error',
          title: 'Camera could not start',
          tip: 'Try refreshing the page and allowing camera access when the browser asks.',
        })
      }
    }

    // ── MICROPHONE ──────────────────────────────────────────
    setCheckingLabel('Checking your microphone')
    await sleep(400)
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const src = ctx.createMediaStreamSource(micStream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      let maxLevel = 0
      await new Promise(resolve => {
        let n = 0
        const iv = setInterval(() => {
          analyser.getByteFrequencyData(data)
          const avg = data.reduce((a, b) => a + b, 0) / data.length
          if (avg > maxLevel) maxLevel = avg
          if (++n >= 12) { clearInterval(iv); resolve() }
        }, 100)
      })
      micStream.getTracks().forEach(t => t.stop())
      ctx.close()
      if (maxLevel < 2) {
        foundTips.push({ icon: '🎙️', tip: 'Your microphone seems very quiet. Check that it\'s not muted in your system settings, and make sure you\'re speaking close to it.' })
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        foundIssues.push({
          icon: '🎙️', severity: 'error',
          title: 'Microphone access is blocked',
          tip: 'Click the 🔒 lock icon in your browser\'s address bar → choose "Allow" for microphone → run this check again.',
        })
      } else if (err.name === 'NotFoundError') {
        foundIssues.push({
          icon: '🎙️', severity: 'warn',
          title: 'No microphone found',
          tip: 'If you only want to watch and not speak during class, this is fine. Otherwise, connect a headset or earphones with a mic.',
        })
      }
    }

    // ── BROWSER ─────────────────────────────────────────────
    setCheckingLabel('Checking your browser')
    await sleep(400)
    const ua = navigator.userAgent
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua)
    const isOldBrowser = !window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia
    if (isOldBrowser) {
      foundIssues.push({
        icon: '🌐', severity: 'error',
        title: 'Your browser can\'t support live video',
        tip: 'Please open this page in Google Chrome (free to download at chrome.google.com). It gives the best experience for live classes.',
      })
    } else if (isSafari) {
      foundTips.push({ icon: '🌐', tip: 'Safari can sometimes have issues with live video. If you run into problems during class, try switching to Chrome — it works best.' })
    }

    // ── NETWORK / UPLOAD ────────────────────────────────────
    setCheckingLabel('Checking your internet connection')
    await sleep(300)
    try {
      const size = 400 * 1024
      const data = new Uint8Array(size)
      const chunk = new Uint8Array(1024)
      crypto.getRandomValues(chunk)
      for (let i = 0; i < size; i += 1024) data.set(chunk, i)
      const blob = new Blob([data])

      let uploadMbps = null
      for (const url of ['https://httpbin.org/post', 'https://postman-echo.com/post']) {
        try {
          const t0 = Date.now()
          const res = await fetch(url, {
            method: 'POST', body: blob,
            signal: AbortSignal.timeout(8000),
          })
          if (res.ok) {
            uploadMbps = ((size * 8) / ((Date.now() - t0) / 1000) / 1_000_000)
            break
          }
        } catch {}
      }

      if (uploadMbps !== null) {
        const minNeeded = isChoreo ? 2.0 : 0.8
        if (uploadMbps < minNeeded * 0.4) {
          foundIssues.push({
            icon: '📶', severity: 'error',
            title: 'Your internet is too slow for live video',
            tip: isChoreo
              ? 'Your upload speed is very low right now. Try: (1) move closer to your WiFi router, (2) connect with an ethernet cable, or (3) use your phone\'s mobile hotspot.'
              : 'Your internet seems very slow. Try moving closer to your WiFi router, or switch to mobile data.',
          })
        } else if (uploadMbps < minNeeded) {
          foundTips.push({
            icon: '📶',
            tip: isChoreo
              ? 'Your internet upload speed could be better. For the clearest video when teaching, try connecting with an ethernet cable or moving closer to your router.'
              : 'Your internet is a bit slow. If the video is choppy during class, try moving closer to your WiFi router or switching to mobile data.',
          })
        }
        // Good speed = no message at all. Silence = good.
      }
    } catch {}

    // ── WebRTC CONNECTIVITY ─────────────────────────────────
    setCheckingLabel('Testing video connectivity')
    await sleep(300)
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      let anyCandidate = false
      const result = await withTimeout(
        new Promise(resolve => {
          pc.onicecandidate = e => { if (e.candidate) anyCandidate = true; else resolve('done') }
          pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve('done') }
          pc.oniceconnectionstatechange = () => { if (pc.iceConnectionState === 'failed') resolve('failed') }
          pc.addTransceiver('video')
          pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => resolve('error'))
        }), 7000
      )
      pc.close()
      if (result === 'failed' || (!anyCandidate && result !== null)) {
        foundIssues.push({
          icon: '🚫', severity: 'error',
          title: 'Your network is blocking live video',
          tip: 'This usually happens on office or school networks. Try switching to your phone\'s mobile hotspot — that almost always works.',
        })
      }
    } catch {}

    // ── PERMISSIONS STATE ───────────────────────────────────
    setCheckingLabel('Checking permissions')
    await sleep(300)
    if (navigator.permissions) {
      for (const name of ['camera', 'microphone']) {
        try {
          const p = await withTimeout(navigator.permissions.query({ name }), 2000)
          if (p?.state === 'denied' && !foundIssues.find(i => i.icon === (name === 'camera' ? '📷' : '🎙️'))) {
            foundIssues.push({
              icon: name === 'camera' ? '📷' : '🎙️',
              severity: 'error',
              title: `${name === 'camera' ? 'Camera' : 'Microphone'} is permanently blocked`,
              tip: `Click the 🔒 lock icon in your browser's address bar → Site settings → Reset permissions → then refresh and try again.`,
            })
          }
        } catch {}
      }
    }

    await sleep(400)
    setIssues(foundIssues)
    setTips(foundTips)
    setPhase('result')
  }

  const hasErrors = issues.filter(i => i.severity === 'error').length > 0
  const hasWarnings = issues.filter(i => i.severity === 'warn').length > 0
  const allClear = issues.length === 0 && tips.length === 0

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,12,12,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: 28,
        width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
      }}>

        {/* ── INTRO ── */}
        {phase === 'intro' && (
          <>
            <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f0c0c', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
                {standaloneMode ? 'Test Your Camera & Mic' : 'Quick Check'}
              </h2>
              <p style={{ fontSize: 14, color: '#7a6e65', lineHeight: 1.6, margin: 0 }}>
                {standaloneMode
                  ? "Let's make sure you're ready for class."
                  : "Takes about 10 seconds. We'll make sure your camera, mic and internet are ready so you don't miss a beat."}
              </p>
            </div>
            <button onClick={runChecks} style={{
              width: '100%', background: '#0f0c0c', color: 'white', border: 'none',
              borderRadius: 12, padding: '15px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              marginBottom: 10,
            }}>Check my setup</button>
            <button onClick={onClose} style={{
              width: '100%', background: 'transparent', color: '#7a6e65', border: 'none',
              borderRadius: 12, padding: '10px', fontSize: 14, cursor: 'pointer',
            }}>Skip for now</button>
          </>
        )}

        {/* ── CHECKING ── */}
        {phase === 'checking' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>
              {checkingLabel.includes('camera') ? '📷'
                : checkingLabel.includes('microphone') ? '🎙️'
                : checkingLabel.includes('browser') ? '🌐'
                : checkingLabel.includes('internet') ? '📶'
                : checkingLabel.includes('video') ? '📡'
                : '🔐'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f0c0c', marginBottom: 8 }}>
              {checkingLabel}
            </div>
            <div style={{ fontSize: 14, color: '#a09890' }}>
              <Dots />
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {phase === 'result' && (
          <>
            {/* Camera preview if cam worked */}
            {camOk && (
              <div style={{
                borderRadius: 12, overflow: 'hidden', background: '#0f0c0c',
                aspectRatio: '16/9', marginBottom: 16, position: 'relative',
              }}>
                <video ref={videoRef} autoPlay muted playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                <div style={{
                  position: 'absolute', bottom: 6, left: 8,
                  background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '2px 8px',
                  fontSize: 11, color: '#86efac', fontWeight: 600,
                }}>Your camera is working ✓</div>
              </div>
            )}

            {/* All clear */}
            {allClear && (
              <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>🎉</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#166534', marginBottom: 6 }}>
                  You're all set!
                </div>
                <div style={{ fontSize: 14, color: '#7a6e65' }}>
                  {standaloneMode
                    ? '✅ You\'re all set! Your join link will arrive 5 minutes before class starts.'
                    : isChoreo
                      ? 'Everything looks great. You\'re ready to teach.'
                      : 'Everything looks great. See you on the dance floor!'}
                </div>
              </div>
            )}

            {/* Issues exist */}
            {!allClear && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0f0c0c', marginBottom: 4 }}>
                    {hasErrors ? '⚠️ A couple of things need fixing' : '💡 A few tips before you join'}
                  </div>
                  {hasErrors && (
                    <div style={{ fontSize: 13, color: '#7a6e65' }}>
                      Fix these before joining so you don't miss anything.
                    </div>
                  )}
                </div>

                {/* Hard issues first */}
                {issues.map((issue, i) => (
                  <IssueCard key={i} {...issue} />
                ))}

                {/* Soft tips after */}
                {tips.length > 0 && issues.length > 0 && (
                  <div style={{ fontSize: 12, color: '#a09890', margin: '8px 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Tips to get the best experience
                  </div>
                )}
                {tips.map((tip, i) => (
                  <TipCard key={i} {...tip} />
                ))}

                {/* Only tips, no hard issues */}
                {!hasErrors && !hasWarnings && tips.length > 0 && (
                  <div style={{ textAlign: 'center', marginTop: 4, marginBottom: 8, fontSize: 13, color: '#166534', fontWeight: 600 }}>
                    ✓ Your setup is good to go — these are just suggestions
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={runChecks} style={{
                flex: 1, background: '#f0ebe6', color: '#5a4e47', border: 'none',
                borderRadius: 10, padding: '12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Check again</button>
              <button onClick={onClose} style={{
                flex: 2, background: '#0f0c0c', color: 'white', border: 'none',
                borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>{hasErrors ? 'Continue anyway' : allClear ? (standaloneMode ? 'Done' : 'Great, let\'s go!') : 'Got it, continue'}</button>
            </div>
          </>
        )}

      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
