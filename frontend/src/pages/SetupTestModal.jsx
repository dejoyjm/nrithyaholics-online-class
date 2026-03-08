import { useState, useEffect, useRef } from 'react'

// ── Pre-session Setup Test Modal ─────────────────────────────────
// Tests: Browser, Camera, Microphone, Upload speed, Download speed, WebRTC/ICE, Permissions

const S = { idle: 'idle', running: 'running', pass: 'pass', warn: 'warn', fail: 'fail' }

function CheckRow({ icon, label, state, detail, advice }) {
  const colors = {
    idle:    { bg: '#f0ebe6', text: '#7a6e65', dot: '#c4b8b0', border: '#e2dbd4' },
    running: { bg: '#fffbeb', text: '#92400e', dot: '#f59e0b', border: '#fde68a' },
    pass:    { bg: '#f0fdf4', text: '#166534', dot: '#22c55e', border: '#bbf7d0' },
    warn:    { bg: '#fff7ed', text: '#9a3412', dot: '#f97316', border: '#fed7aa' },
    fail:    { bg: '#fef2f2', text: '#991b1b', dot: '#ef4444', border: '#fecaca' },
  }
  const c = colors[state] || colors.idle
  const statusLabel = {
    idle: 'Waiting', running: 'Testing...', pass: '✓ Good', warn: '⚠ Issues', fail: '✕ Problem'
  }[state] || 'Waiting'

  return (
    <div style={{
      background: c.bg, borderRadius: 10, padding: '12px 16px',
      marginBottom: 8, border: `1px solid ${c.border}`, transition: 'all 0.3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', background: c.dot,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0, marginTop: 1,
          animation: state === 'running' ? 'spin 1s linear infinite' : 'none',
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f0c0c' }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: c.text, whiteSpace: 'nowrap' }}>{statusLabel}</span>
          </div>
          {detail && <div style={{ fontSize: 12, color: '#5a4e47', marginTop: 2, lineHeight: 1.4 }}>{detail}</div>}
          {advice && (state === 'warn' || state === 'fail') && (
            <div style={{
              fontSize: 12, color: c.text, marginTop: 6,
              background: 'rgba(255,255,255,0.7)', borderRadius: 6, padding: '5px 8px',
              borderLeft: `3px solid ${c.dot}`, lineHeight: 1.4,
            }}>
              💡 {advice}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SetupTestModal({ onClose, isChoreo }) {
  const initChecks = () => ({
    browser:     { state: S.idle, detail: '', advice: '' },
    camera:      { state: S.idle, detail: '', advice: '' },
    mic:         { state: S.idle, detail: '', advice: '' },
    upload:      { state: S.idle, detail: '', advice: '' },
    download:    { state: S.idle, detail: '', advice: '' },
    webrtc:      { state: S.idle, detail: '', advice: '' },
    permissions: { state: S.idle, detail: '', advice: '' },
  })

  const [checks, setChecks] = useState(initChecks())
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const videoRef = useRef(null)
  const mediaStreamRef = useRef(null)

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  const setCheck = (key, update) =>
    setChecks(prev => ({ ...prev, [key]: { ...prev[key], ...update } }))

  const sleep = ms => new Promise(r => setTimeout(r, ms))

  async function runTests() {
    setRunning(true)
    setDone(false)
    setChecks(initChecks())
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }
    await sleep(200)

    // ── 1. BROWSER ──────────────────────────────────────────
    setCheck('browser', { state: S.running })
    await sleep(500)
    const ua = navigator.userAgent
    const isChrome = /Chrome/.test(ua) && !/Edg|OPR/.test(ua)
    const isEdge = /Edg/.test(ua)
    const isFirefox = /Firefox/.test(ua)
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua)
    const hasWebRTC = !!window.RTCPeerConnection
    const hasGUM = !!navigator.mediaDevices?.getUserMedia

    if (!hasWebRTC || !hasGUM) {
      setCheck('browser', { state: S.fail, detail: 'Browser does not support video calls', advice: 'Install Google Chrome (latest version) and try again.' })
    } else if (isChrome) {
      setCheck('browser', { state: S.pass, detail: 'Google Chrome — best supported browser ✓' })
    } else if (isEdge) {
      setCheck('browser', { state: S.pass, detail: 'Microsoft Edge — supported' })
    } else if (isFirefox) {
      setCheck('browser', { state: S.warn, detail: 'Firefox — may have minor issues', advice: 'Chrome gives the best experience for live classes.' })
    } else if (isSafari) {
      setCheck('browser', { state: S.warn, detail: 'Safari — limited WebRTC support', advice: 'Use Chrome on your iPhone/Mac for best results.' })
    } else {
      setCheck('browser', { state: S.warn, detail: 'Unknown browser', advice: 'Use Google Chrome for best results.' })
    }
    await sleep(300)

    // ── 2. CAMERA ───────────────────────────────────────────
    setCheck('camera', { state: S.running })
    await sleep(300)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
        audio: false,
      })
      mediaStreamRef.current = stream
      const vt = stream.getVideoTracks()[0]
      const st = vt.getSettings()
      if (videoRef.current) videoRef.current.srcObject = stream
      const w = st.width || 0, h = st.height || 0
      if (w >= 480) {
        setCheck('camera', { state: S.pass, detail: `Camera ready: ${w}×${h} @ ${st.frameRate || '?'}fps` })
      } else {
        setCheck('camera', { state: S.warn, detail: `Low resolution: ${w}×${h}`, advice: 'Try a different camera or check no other app is using it.' })
      }
    } catch (err) {
      const advice = {
        NotAllowedError: 'Click the camera icon in your browser address bar → Allow → re-run test.',
        NotFoundError: 'No camera detected. A camera is required to join classes.',
        NotReadableError: 'Camera is in use by another app (Zoom, Teams, etc). Close them and retry.',
      }[err.name] || 'Refresh the page and allow camera access when prompted.'
      setCheck('camera', { state: S.fail, detail: `Camera blocked: ${err.name}`, advice })
    }
    await sleep(300)

    // ── 3. MICROPHONE ────────────────────────────────────────
    setCheck('mic', { state: S.running })
    await sleep(300)
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const src = audioCtx.createMediaStreamSource(micStream)
      const analyser = audioCtx.createAnalyser()
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
          if (++n >= 15) { clearInterval(iv); resolve() }
        }, 100)
      })
      micStream.getTracks().forEach(t => t.stop())
      audioCtx.close()
      const label = (micStream.getAudioTracks()[0]?.label || 'Unknown mic').substring(0, 45)
      if (maxLevel > 3) {
        setCheck('mic', { state: S.pass, detail: `Microphone active: ${label}` })
      } else {
        setCheck('mic', { state: S.warn, detail: `Low signal from: ${label}`, advice: 'Check OS microphone volume. Make sure mic is not muted.' })
      }
    } catch (err) {
      const advice = {
        NotAllowedError: 'Allow microphone access in browser settings.',
        NotFoundError: 'No microphone found. Connect a headset or mic.',
      }[err.name] || 'Check your microphone connection and try again.'
      setCheck('mic', { state: S.fail, detail: `Mic blocked: ${err.name}`, advice })
    }
    await sleep(300)

    // ── 4. UPLOAD SPEED ──────────────────────────────────────
    setCheck('upload', { state: S.running, detail: 'Uploading test data...' })
    try {
      const size = 500 * 1024 // 500KB
      const data = new Uint8Array(size)
      const chunk = new Uint8Array(1024)
      crypto.getRandomValues(chunk)
      for (let i = 0; i < size; i += 1024) data.set(chunk, i)
      const blob = new Blob([data], { type: 'application/octet-stream' })

      const targets = ['https://httpbin.org/post', 'https://postman-echo.com/post']
      let uploadMbps = null

      for (const url of targets) {
        try {
          const t0 = Date.now()
          const res = await fetch(url, {
            method: 'POST', body: blob,
            headers: { 'Content-Type': 'application/octet-stream' },
            signal: AbortSignal.timeout(8000),
          })
          if (res.ok) {
            const elapsed = (Date.now() - t0) / 1000
            uploadMbps = ((size * 8) / elapsed / 1_000_000).toFixed(2)
            break
          }
        } catch {}
      }

      if (uploadMbps === null) {
        setCheck('upload', {
          state: S.warn, detail: 'Could not reach upload test server',
          advice: 'Ensure you are on a good network. Choreographers need at least 2 Mbps upload.',
        })
      } else {
        const mbps = parseFloat(uploadMbps)
        const min = isChoreo ? 2.0 : 1.0
        if (mbps >= min * 1.5) {
          setCheck('upload', { state: S.pass, detail: `Upload: ${uploadMbps} Mbps — great ✓` })
        } else if (mbps >= min) {
          setCheck('upload', { state: S.pass, detail: `Upload: ${uploadMbps} Mbps — sufficient` })
        } else if (mbps >= min * 0.5) {
          setCheck('upload', {
            state: S.warn, detail: `Upload: ${uploadMbps} Mbps — may be slow`,
            advice: isChoreo
              ? 'Choreographers need 2+ Mbps upload. Move closer to router or use ethernet.'
              : 'Move closer to your WiFi router for better outgoing video.',
          })
        } else {
          setCheck('upload', {
            state: S.fail, detail: `Upload: ${uploadMbps} Mbps — too slow`,
            advice: 'Very slow upload. Switch to a better network before joining.',
          })
        }
      }
    } catch {
      setCheck('upload', { state: S.warn, detail: 'Upload test inconclusive', advice: 'Ensure you are on WiFi or 4G.' })
    }
    await sleep(200)

    // ── 5. DOWNLOAD SPEED ────────────────────────────────────
    setCheck('download', { state: S.running, detail: 'Checking download speed...' })
    try {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
      if (conn?.downlink) {
        const dl = conn.downlink
        if (dl >= 5) {
          setCheck('download', { state: S.pass, detail: `Download: ~${dl} Mbps — good ✓` })
        } else if (dl >= 2) {
          setCheck('download', { state: S.pass, detail: `Download: ~${dl} Mbps — sufficient` })
        } else if (dl >= 0.5) {
          setCheck('download', { state: S.warn, detail: `Download: ~${dl} Mbps — borderline`, advice: 'Move closer to your router for better incoming video.' })
        } else {
          setCheck('download', { state: S.fail, detail: `Download: ~${dl} Mbps — too slow`, advice: 'Switch to a better network before joining.' })
        }
      } else {
        // Fallback latency test
        const t0 = Date.now()
        await fetch(`https://www.cloudflare.com/cdn-cgi/trace?_=${Date.now()}`, { signal: AbortSignal.timeout(5000) })
        const rtt = Date.now() - t0
        if (rtt < 300) {
          setCheck('download', { state: S.pass, detail: `Network responsive (${rtt}ms RTT)` })
        } else if (rtt < 800) {
          setCheck('download', { state: S.warn, detail: `Higher latency (${rtt}ms)`, advice: 'You may see slight delays in video.' })
        } else {
          setCheck('download', { state: S.fail, detail: `Very high latency (${rtt}ms)`, advice: 'Poor network. Switch networks before joining.' })
        }
      }
    } catch {
      setCheck('download', { state: S.warn, detail: 'Could not measure download speed', advice: 'Ensure you are on a stable network.' })
    }
    await sleep(200)

    // ── 6. WebRTC / ICE CONNECTIVITY ─────────────────────────
    setCheck('webrtc', { state: S.running, detail: 'Testing connection to video servers...' })
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      })
      let hasRelay = false, hasSrflx = false, hasHost = false
      const t0 = Date.now()

      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve('timeout'), 6000)
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            const c = e.candidate.candidate || ''
            if (c.includes('relay')) hasRelay = true
            if (c.includes('srflx')) hasSrflx = true
            if (c.includes('host')) hasHost = true
          } else {
            clearTimeout(timeout); resolve('complete')
          }
        }
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); resolve('complete') }
        }
        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'failed') { clearTimeout(timeout); resolve('failed') }
        }
        pc.addTransceiver('video')
        pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => { clearTimeout(timeout); resolve('error') })
      })

      const elapsed = Date.now() - t0
      pc.close()

      if (result === 'failed') {
        setCheck('webrtc', {
          state: S.fail, detail: 'WebRTC connection failed — video will not work',
          advice: 'Network is blocking video traffic. Try a mobile hotspot or ask IT to allow WebRTC/UDP.',
        })
      } else if (result === 'timeout' && !hasHost && !hasSrflx) {
        setCheck('webrtc', {
          state: S.fail, detail: 'Could not establish any video path',
          advice: 'Network may be blocking WebRTC. Try on a mobile hotspot.',
        })
      } else {
        const pathType = hasRelay ? 'relay available' : hasSrflx ? 'direct path' : 'local path'
        setCheck('webrtc', { state: S.pass, detail: `Video connectivity OK — ${pathType} (${elapsed}ms)` })
      }
    } catch {
      setCheck('webrtc', { state: S.warn, detail: 'WebRTC test inconclusive', advice: 'Could not verify video connectivity.' })
    }
    await sleep(200)

    // ── 7. BROWSER PERMISSIONS ───────────────────────────────
    setCheck('permissions', { state: S.running, detail: 'Checking permissions...' })
    await sleep(400)

    const issues = []
    const ok = []

    // Helper: timeout wrapper so no check can hang forever
    const withTimeout = (promise, ms) =>
      Promise.race([promise, sleep(ms).then(() => null)])

    // Camera/mic permission state
    if (navigator.permissions) {
      for (const name of ['camera', 'microphone']) {
        try {
          const p = await withTimeout(navigator.permissions.query({ name }), 2000)
          if (!p) { /* timed out, skip */ }
          else if (p.state === 'denied') issues.push(`${name} blocked in browser settings`)
          else ok.push(name)
        } catch {}
      }
    }

    // Wake lock
    if ('wakeLock' in navigator) {
      ok.push('wake-lock')
    } else {
      issues.push('Screen may sleep during long classes (wake lock unsupported)')
    }

    // Autoplay — must be wrapped in timeout, can hang indefinitely
    try {
      const autoplayResult = await withTimeout(
        new Promise((resolve) => {
          const a = new Audio(); a.volume = 0
          const p = a.play()
          if (!p) { resolve('ok'); return }
          p.then(() => { a.pause(); resolve('ok') }).catch(() => resolve('blocked'))
        }),
        2000
      )
      if (autoplayResult === 'blocked') issues.push('Autoplay blocked — audio may not start automatically')
      // null = timed out = assume ok
    } catch {}

    // Nested iframe check
    if (window.self !== window.top) {
      issues.push('Nested iframe detected — some permissions may be restricted')
    }

    if (issues.length === 0) {
      setCheck('permissions', { state: S.pass, detail: `All clear: ${ok.join(', ')}` })
    } else if (issues.length <= 2) {
      setCheck('permissions', {
        state: S.warn, detail: issues.join(' · '),
        advice: 'Click the lock icon in your browser address bar to review permissions.',
      })
    } else {
      setCheck('permissions', {
        state: S.fail, detail: issues.join(' · '),
        advice: 'Click the lock icon → Site settings → Reset permissions, then refresh and retry.',
      })
    }

    setRunning(false)
    setDone(true)
  }

  const checkValues = Object.values(checks)
  const failCount = checkValues.filter(c => c.state === S.fail).length
  const warnCount = checkValues.filter(c => c.state === S.warn).length
  const allPassed = done && failCount === 0 && warnCount === 0

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,12,12,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: 28,
        width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f0c0c', fontFamily: 'Georgia, serif', marginBottom: 3 }}>
              🔍 Setup Check
            </h2>
            <p style={{ fontSize: 13, color: '#7a6e65', margin: 0 }}>
              {isChoreo ? 'Verify your setup before teaching' : 'Verify your setup before joining'}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: '#f0ebe6', border: 'none', borderRadius: 8,
            width: 30, height: 30, cursor: 'pointer', fontSize: 16, color: '#5a4e47',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>×</button>
        </div>

        {/* Camera preview */}
        {checks.camera.state === S.pass && (
          <div style={{ marginBottom: 14, borderRadius: 10, overflow: 'hidden', background: '#0f0c0c', aspectRatio: '16/9', position: 'relative' }}>
            <video ref={videoRef} autoPlay muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            <div style={{
              position: 'absolute', bottom: 6, left: 8, background: 'rgba(0,0,0,0.65)',
              borderRadius: 5, padding: '2px 8px', fontSize: 11, color: '#86efac', fontWeight: 600,
            }}>📹 Live preview — only visible to you</div>
          </div>
        )}

        <CheckRow icon="🌐" label="Browser"                    {...checks.browser} />
        <CheckRow icon="📹" label="Camera"                     {...checks.camera} />
        <CheckRow icon="🎙️" label="Microphone"                 {...checks.mic} />
        <CheckRow icon="⬆️" label="Upload Speed"               {...checks.upload} />
        <CheckRow icon="⬇️" label="Download Speed"             {...checks.download} />
        <CheckRow icon="📡" label="Video Connectivity (WebRTC)" {...checks.webrtc} />
        <CheckRow icon="🔐" label="Browser Permissions"         {...checks.permissions} />

        {done && (
          <div style={{
            marginTop: 14, borderRadius: 12, padding: '14px 18px', textAlign: 'center',
            background: allPassed ? '#f0fdf4' : failCount > 0 ? '#fef2f2' : '#fff7ed',
            border: `1px solid ${allPassed ? '#22c55e' : failCount > 0 ? '#ef4444' : '#f97316'}`,
          }}>
            <div style={{ fontSize: 26, marginBottom: 4 }}>
              {allPassed ? '🎉' : failCount > 0 ? '⚠️' : '🟡'}
            </div>
            <div style={{
              fontSize: 15, fontWeight: 700, marginBottom: 3,
              color: allPassed ? '#166534' : failCount > 0 ? '#991b1b' : '#9a3412',
            }}>
              {allPassed ? "You're all set!"
                : failCount > 0 ? `${failCount} issue${failCount > 1 ? 's' : ''} need fixing`
                : `${warnCount} warning${warnCount > 1 ? 's' : ''} — may have issues`}
            </div>
            <div style={{ fontSize: 12, color: '#5a4e47' }}>
              {allPassed
                ? (isChoreo ? "Ready to teach. Start your class when it's time!" : 'Ready to join. See you in class!')
                : failCount > 0 ? 'Fix the issues above before joining.'
                : 'You can join but may experience some quality issues.'}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {!done && !running && (
            <button onClick={runTests} style={{
              flex: 1, background: '#0f0c0c', color: 'white', border: 'none',
              borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>▶ Run Setup Test</button>
          )}
          {running && (
            <button disabled style={{
              flex: 1, background: '#e2dbd4', color: '#7a6e65', border: 'none',
              borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'not-allowed',
            }}>Testing... please wait</button>
          )}
          {done && (
            <>
              <button onClick={runTests} style={{
                flex: 1, background: '#f0ebe6', color: '#5a4e47', border: 'none',
                borderRadius: 10, padding: '13px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>🔄 Re-run</button>
              <button onClick={onClose} style={{
                flex: 2, background: '#0f0c0c', color: 'white', border: 'none',
                borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>Done</button>
            </>
          )}
        </div>

        <p style={{ fontSize: 11, color: '#a09890', textAlign: 'center', marginTop: 10, marginBottom: 0 }}>
          Camera preview is only visible to you. Nothing is recorded during this test.
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
