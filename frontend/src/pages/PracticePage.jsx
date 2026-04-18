import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function PracticePage({ user, sessionId, bookingId, onBack, platformConfig }) {
  // ── Phase ─────────────────────────────────────────────────────────────────
  // 'loading' | 'ready' | 'countdown' | 'recording' | 'saving' | 'saved' | 'error'
  const [phase, setPhase]               = useState('loading')
  const [countdown, setCountdown]       = useState(5)
  const [saveError, setSaveError]       = useState(null)

  // ── Reference video ───────────────────────────────────────────────────────
  const [refVideoUrl, setRefVideoUrl]   = useState(null)
  const [refLoading, setRefLoading]     = useState(true)
  const [refError, setRefError]         = useState(null)

  // ── Camera ────────────────────────────────────────────────────────────────
  const [stream, setStream]             = useState(null)
  const [camError, setCamError]         = useState(null)

  // ── Music progress (tracks ref video) ────────────────────────────────────
  const [musicProgress, setMusicProgress] = useState(0)
  const [musicDuration, setMusicDuration] = useState(0)

  // ── Refs ──────────────────────────────────────────────────────────────────
  const cameraVideoRef    = useRef(null)
  const refVideoRef       = useRef(null)
  const mediaRecorderRef  = useRef(null)
  const chunksRef         = useRef([])
  const countdownRef      = useRef(null)
  const progressRef       = useRef(null)

  // ── Fetch choreographer reference video ───────────────────────────────────
  useEffect(() => {
    async function loadRefVideo() {
      setRefLoading(true)
      setRefError(null)
      try {
        const { data: rec, error } = await supabase
          .from('recordings')
          .select('id, session_id')
          .eq('session_id', sessionId)
          .eq('recorder_type', 'choreographer')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (error) throw error
        if (!rec) { setRefError('No reference recording available yet.'); setRefLoading(false); return }

        const { data: { session: authSession } } = await supabase.auth.getSession()
        const token = authSession?.access_token

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-recording-url`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ recording_id: rec.id, session_id: sessionId }),
          }
        )
        const result = await res.json()
        if (!res.ok || !result.url) throw new Error(result.error || 'Failed to load reference video')
        setRefVideoUrl(result.url)
      } catch (e) {
        setRefError(e.message || 'Could not load reference video')
      }
      setRefLoading(false)
    }
    loadRefVideo()
  }, [sessionId])

  // ── Camera setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        setStream(s)
      } catch (e) {
        setCamError('Camera access denied. Please allow camera and microphone access.')
      }
    }
    startCamera()
  }, [])

  useEffect(() => {
    if (stream && cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = stream
    }
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [stream])

  // ── Transition to 'ready' when both data loads and camera are done ────────
  useEffect(() => {
    if (!refLoading && phase === 'loading') {
      setPhase('ready')
    }
  }, [refLoading])

  // ── Music progress tracking during recording (tracks ref video) ───────────
  useEffect(() => {
    if (phase === 'recording') {
      progressRef.current = setInterval(() => {
        const video = refVideoRef.current
        if (video && video.duration) {
          setMusicProgress(video.currentTime / video.duration)
          setMusicDuration(video.duration)
        }
      }, 500)
    } else {
      clearInterval(progressRef.current)
    }
    return () => clearInterval(progressRef.current)
  }, [phase])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getSupportedMimeType() {
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t
    }
    return ''
  }

  function fmtTime(secs) {
    if (!secs || isNaN(secs)) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // ── Start practice: countdown → beginRecording ────────────────────────────
  function startPractice() {
    setPhase('countdown')
    setCountdown(5)
    let c = 5
    countdownRef.current = setInterval(() => {
      c -= 1
      setCountdown(c)
      if (c <= 0) {
        clearInterval(countdownRef.current)
        beginRecording()
      }
    }, 1000)
  }

  function beginRecording() {
    if (!stream) return
    chunksRef.current = []
    const mr = new MediaRecorder(stream, { mimeType: getSupportedMimeType() })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start(1000)
    mediaRecorderRef.current = mr

    if (refVideoRef.current) {
      refVideoRef.current.currentTime = 0
      refVideoRef.current.play()
      refVideoRef.current.onended = () => stopAndSave()
    }

    setMusicProgress(0)
    setPhase('recording')
  }

  function emergencyStop() {
    clearInterval(countdownRef.current)
    if (refVideoRef.current) {
      refVideoRef.current.pause()
      refVideoRef.current.onended = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      stopAndSave()
    } else {
      setPhase('ready')
    }
  }

  async function stopAndSave() {
    const mr = mediaRecorderRef.current
    if (!mr || mr.state === 'inactive') return
    mr.stop()
    setPhase('saving')

    await new Promise(resolve => { mr.onstop = resolve })

    const mimeType = mr.mimeType || 'video/webm'
    const blob = new Blob(chunksRef.current, { type: mimeType })
    chunksRef.current = []

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      const token = authSession?.access_token

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-student-video`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            session_id:            sessionId,
            booking_id:            bookingId,
            file_size:             blob.size,
            mime_type:             mimeType,
            music_start_offset_ms: 0,
          }),
        }
      )
      const { upload_url, error: fnError } = await res.json()
      if (!res.ok || !upload_url) throw new Error(fnError || 'Failed to get upload URL')
      console.log('[PracticePage] upload_url domain:', new URL(upload_url).hostname)

      const putRes = await fetch(upload_url, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': mimeType },
      })
      console.log('[PracticePage] R2 PUT status:', putRes.status, putRes.statusText)
      if (!putRes.ok) throw new Error('Upload failed')

      setPhase('saved')
    } catch (e) {
      console.error('[PracticePage] save error:', e)
      setSaveError(e.message || 'Upload failed')
      setPhase('error')
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const isActive = phase === 'countdown' || phase === 'recording'
  const canStart = !refLoading && !!stream && phase === 'ready'

  const musicCurrentSecs = musicDuration * musicProgress

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0a0808', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* ── Emergency stop ── */}
      {isActive && (
        <button
          onClick={emergencyStop}
          style={{
            position: 'fixed', top: 14, right: 16, zIndex: 1000,
            background: '#2a0a0a', color: '#ef4444',
            border: '1px solid #ef4444', borderRadius: 8,
            padding: '7px 16px', fontSize: 13, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ■ Stop
        </button>
      )}

      {/* ── Nav ── */}
      <nav style={{
        background: '#0f0c0c', padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, borderBottom: '1px solid #1a1616',
      }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 900, color: '#faf7f2' }}>
          Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
          <span style={{ fontSize: 13, fontWeight: 400, color: '#9a8e85', marginLeft: 12 }}>Practice Room</span>
        </div>
        <button
          onClick={onBack}
          disabled={isActive}
          style={{
            background: 'transparent', border: '1px solid rgba(250,247,242,0.3)',
            color: '#faf7f2', padding: '7px 18px', borderRadius: 8,
            cursor: isActive ? 'not-allowed' : 'pointer', fontSize: 13,
            opacity: isActive ? 0.4 : 1,
          }}
        >
          ← Back
        </button>
      </nav>

      {/* ── Main panels ── */}
      <div style={{ flex: 1, display: 'flex', gap: 16, padding: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>

        {/* Left — Choreographer Reference */}
        <div style={{
          flex: 1, minWidth: 0,
          background: '#0f0c0c', borderRadius: 16,
          border: '1px solid #1a1616', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '14px 20px', background: '#0f0c0c',
            color: '#faf7f2', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: '1px solid #1a1616',
          }}>
            <span style={{ color: '#c8430a' }}>▶</span> Choreographer Reference
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, minHeight: 280 }}>
            {refLoading ? (
              <div style={{ color: '#9a8e85', fontSize: 14 }}>Loading reference video...</div>
            ) : refError ? (
              <div style={{ color: '#9a8e85', fontSize: 14, textAlign: 'center', padding: '0 20px' }}>{refError}</div>
            ) : (
              <video
                ref={refVideoRef}
                src={refVideoUrl}
                preload="auto"
                playsInline
                style={{
                  width: '100%', maxHeight: 400, borderRadius: 8, background: '#000',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        </div>

        {/* Right — Your Recording */}
        <div style={{
          flex: 1, minWidth: 0, position: 'relative',
          background: '#0f0c0c', borderRadius: 16,
          border: '1px solid #1a1616', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '14px 20px', background: '#0f0c0c',
            color: '#faf7f2', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: '1px solid #1a1616',
          }}>
            <span>📹</span> Your Recording
            {/* REC indicator */}
            {phase === 'recording' && (
              <span style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                color: '#ef4444', fontSize: 12, fontWeight: 700,
              }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: '#ef4444',
                  animation: 'nrh-pulse 1.2s ease-in-out infinite',
                }} />
                REC
              </span>
            )}
          </div>

          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, minHeight: 280, position: 'relative',
          }}>
            {camError ? (
              <div style={{ color: '#ef4444', fontSize: 14, textAlign: 'center', padding: '0 20px' }}>{camError}</div>
            ) : (
              <video
                ref={cameraVideoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: '100%', maxHeight: 400, borderRadius: 8, background: '#000',
                  transform: 'scaleX(-1)',
                }}
              />
            )}

            {/* Countdown overlay */}
            {phase === 'countdown' && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.72)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8,
              }}>
                <span style={{
                  fontSize: 96, fontWeight: 900, color: '#faf7f2',
                  lineHeight: 1, fontFamily: 'Georgia, serif',
                  textShadow: '0 4px 32px rgba(200,67,10,0.6)',
                }}>
                  {countdown}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Music bar (tracks ref video progress) ── */}
      <div style={{
        flexShrink: 0, margin: '0 20px 16px',
        background: '#0f0c0c', borderRadius: 12,
        padding: '12px 20px',
        display: 'flex', alignItems: 'center', gap: 16,
        border: '1px solid #2a2420',
      }}>
        <div style={{ fontSize: 13, color: '#faf7f2', fontWeight: 600, flexShrink: 0 }}>
          CLASS MUSIC
        </div>
        <div style={{ flex: 1, height: 4, background: '#2a2420', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: '#c8430a', borderRadius: 2,
            width: `${musicProgress * 100}%`,
            transition: 'width 0.5s linear',
          }} />
        </div>
        <div style={{ fontSize: 12, color: '#7a6e65', flexShrink: 0 }}>
          {fmtTime(musicCurrentSecs)} / {fmtTime(musicDuration)}
        </div>
      </div>

      {/* ── Center overlay: Start Practice / status ── */}
      {(phase === 'ready' || phase === 'saving' || phase === 'saved' || phase === 'error') && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 900,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)',
          pointerEvents: phase === 'ready' ? 'auto' : 'none',
        }}>
          {phase === 'ready' && (
            <button
              onClick={startPractice}
              disabled={!canStart}
              style={{
                background: canStart ? '#c8430a' : '#3a3330',
                color: 'white', border: 'none', borderRadius: 16,
                padding: '18px 48px', fontSize: 22, fontWeight: 800,
                cursor: canStart ? 'pointer' : 'not-allowed',
                opacity: canStart ? 1 : 0.5,
                boxShadow: canStart ? '0 8px 32px rgba(200,67,10,0.4)' : 'none',
                pointerEvents: 'auto',
              }}
            >
              ▶ Start Practice
            </button>
          )}
        </div>
      )}

      {/* ── Bottom status bar ── */}
      {(phase === 'saving' || phase === 'saved' || phase === 'error') && (
        <div style={{
          flexShrink: 0, margin: '0 20px 20px',
          padding: '14px 20px', borderRadius: 12,
          background: phase === 'saved' ? '#0d2016' : phase === 'error' ? '#2a0a0a' : '#1a1616',
          border: `1px solid ${phase === 'saved' ? '#22c55e' : phase === 'error' ? '#ef4444' : '#2a2420'}`,
          fontSize: 14, fontWeight: 600,
          color: phase === 'saved' ? '#22c55e' : phase === 'error' ? '#ef4444' : '#9a8e85',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {phase === 'saving' && <span>Uploading your recording...</span>}
          {phase === 'saved'  && <span>✅ Saved! Your coach will review your recording.</span>}
          {phase === 'error'  && (
            <>
              <span>Upload failed: {saveError}</span>
              <button
                onClick={() => setPhase('ready')}
                style={{
                  marginLeft: 'auto', background: 'transparent', border: '1px solid #ef4444',
                  color: '#ef4444', borderRadius: 6, padding: '4px 12px', fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Pulse keyframe ── */}
      <style>{`
        @keyframes nrh-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
