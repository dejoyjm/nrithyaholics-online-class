import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function PracticePage({ user, sessionId, bookingId, onBack, platformConfig }) {
  // ── Reference video ───────────────────────────────────────────────────────
  const [refVideoUrl, setRefVideoUrl]     = useState(null)
  const [refLoading, setRefLoading]       = useState(true)
  const [refError, setRefError]           = useState(null)

  // ── Camera / recording ────────────────────────────────────────────────────
  const [stream, setStream]               = useState(null)
  const [camError, setCamError]           = useState(null)
  const [recording, setRecording]         = useState(false)
  const [elapsed, setElapsed]             = useState(0)
  const [saveStatus, setSaveStatus]       = useState(null) // null | 'saving' | 'saved' | 'error'
  const mediaRecorderRef                  = useRef(null)
  const chunksRef                         = useRef([])
  const elapsedRef                        = useRef(null)
  const cameraVideoRef                    = useRef(null)

  // ── Music ─────────────────────────────────────────────────────────────────
  const [musicUrl, setMusicUrl]           = useState(null)
  const [musicTitle, setMusicTitle]       = useState(null)
  const [musicPlaying, setMusicPlaying]   = useState(false)
  const audioRef                          = useRef(null)

  // ── Fetch choreographer recording ─────────────────────────────────────────
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

  // ── Fetch session music ───────────────────────────────────────────────────
  useEffect(() => {
    async function loadMusic() {
      const { data: session } = await supabase
        .from('sessions')
        .select('music_track_url, music_track_title')
        .eq('id', sessionId)
        .single()
      if (session?.music_track_url) {
        setMusicUrl(session.music_track_url)
        setMusicTitle(session.music_track_title || 'Music')
      }
    }
    loadMusic()
  }, [sessionId])

  // ── Camera setup ─────────────────────────────────────────────────────────
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
    return () => {
      // cleanup on unmount
    }
  }, [])

  useEffect(() => {
    if (stream && cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = stream
    }
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [stream])

  // ── Elapsed timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (recording) {
      setElapsed(0)
      elapsedRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      clearInterval(elapsedRef.current)
    }
    return () => clearInterval(elapsedRef.current)
  }, [recording])

  function fmtElapsed(secs) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // ── Recording controls ────────────────────────────────────────────────────
  function startRecording() {
    if (!stream) return
    chunksRef.current = []
    const mr = new MediaRecorder(stream, { mimeType: getSupportedMimeType() })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start(1000)
    mediaRecorderRef.current = mr
    setRecording(true)
    setSaveStatus(null)
  }

  function getSupportedMimeType() {
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t
    }
    return ''
  }

  async function stopAndSave() {
    if (!mediaRecorderRef.current) return
    mediaRecorderRef.current.stop()
    setRecording(false)

    // Wait for final chunks
    await new Promise(resolve => {
      mediaRecorderRef.current.onstop = resolve
    })

    const mimeType = mediaRecorderRef.current.mimeType || 'video/webm'
    const blob = new Blob(chunksRef.current, { type: mimeType })
    chunksRef.current = []

    setSaveStatus('saving')
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      const token = authSession?.access_token

      // 1. Get presigned upload URL
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
            session_id:  sessionId,
            booking_id:  bookingId,
            file_size:   blob.size,
            mime_type:   mimeType,
          }),
        }
      )
      const { upload_url, error: fnError } = await res.json()
      if (!res.ok || !upload_url) throw new Error(fnError || 'Failed to get upload URL')
      console.log('[PracticePage] upload_url domain:', upload_url ? new URL(upload_url).hostname : 'none')

      // 2. PUT blob directly to R2
      const putRes = await fetch(upload_url, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': mimeType },
      })
      console.log('[PracticePage] R2 PUT status:', putRes.status, putRes.statusText)
      if (!putRes.ok) throw new Error('Upload failed')

      setSaveStatus('saved')
    } catch (e) {
      console.error('[PracticePage] save error:', e)
      setSaveStatus('error')
    }
  }

  // ── Music controls ────────────────────────────────────────────────────────
  function toggleMusic() {
    if (!audioRef.current) return
    if (musicPlaying) {
      audioRef.current.pause()
      setMusicPlaying(false)
    } else {
      audioRef.current.play()
      setMusicPlaying(true)
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const panelStyle = {
    flex: 1, minWidth: 0,
    background: 'white', borderRadius: 16,
    border: '1px solid #e2dbd4', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  }
  const panelHeadStyle = {
    padding: '14px 20px',
    background: '#0f0c0c',
    color: '#faf7f2',
    fontSize: 13, fontWeight: 700,
    display: 'flex', alignItems: 'center', gap: 8,
  }
  const panelBodyStyle = {
    flex: 1, display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: 16,
    background: '#0a0808',
    minHeight: 280,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2', display: 'flex', flexDirection: 'column' }}>

      {/* ── Nav ── */}
      <nav style={{
        background: '#0f0c0c', padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 900, color: '#faf7f2' }}>
          Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
          <span style={{ fontSize: 13, fontWeight: 400, color: '#9a8e85', marginLeft: 12 }}>Practice Room</span>
        </div>
        <button onClick={onBack} style={{
          background: 'transparent', border: '1px solid rgba(250,247,242,0.3)',
          color: '#faf7f2', padding: '7px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
        }}>← Back</button>
      </nav>

      {/* ── Main panels ── */}
      <div style={{
        flex: 1, display: 'flex', gap: 16, padding: 20,
        flexWrap: 'wrap',
        alignItems: 'stretch',
      }}>

        {/* Left — Reference */}
        <div style={panelStyle}>
          <div style={panelHeadStyle}>
            <span style={{ color: '#c8430a' }}>▶</span> Choreographer Reference
          </div>
          <div style={{ padding: '8px 20px 4px', background: '#0f0c0c' }}>
            <span style={{ fontSize: 11, color: '#9a8e85', fontWeight: 600, letterSpacing: 0.5 }}>
              Reference — watch before dancing
            </span>
          </div>
          <div style={panelBodyStyle}>
            {refLoading ? (
              <div style={{ color: '#9a8e85', fontSize: 14 }}>Loading reference video...</div>
            ) : refError ? (
              <div style={{ color: '#9a8e85', fontSize: 14, textAlign: 'center', padding: '0 20px' }}>{refError}</div>
            ) : (
              <video
                src={refVideoUrl}
                controls
                style={{ width: '100%', maxHeight: 400, borderRadius: 8, background: '#000' }}
                preload="metadata"
              />
            )}
          </div>
        </div>

        {/* Right — Your Recording */}
        <div style={panelStyle}>
          <div style={panelHeadStyle}>
            <span>📹</span> Your Recording
          </div>
          <div style={panelBodyStyle}>
            {camError ? (
              <div style={{ color: '#ef4444', fontSize: 14, textAlign: 'center', padding: '0 20px' }}>{camError}</div>
            ) : (
              <video
                ref={cameraVideoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: '100%', maxHeight: 400, borderRadius: 8,
                  background: '#000',
                  transform: 'scaleX(-1)', // mirror
                }}
              />
            )}
          </div>
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid #1a1616',
            background: '#0f0c0c',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {/* Recording indicator */}
            {recording && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                  background: '#ef4444',
                  animation: 'nrh-pulse 1.2s ease-in-out infinite',
                }} />
                <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 700 }}>Recording</span>
                <span style={{ color: '#9a8e85', fontSize: 13, marginLeft: 4 }}>{fmtElapsed(elapsed)}</span>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {!recording ? (
                <button
                  onClick={startRecording}
                  disabled={!stream || saveStatus === 'saving'}
                  style={{
                    background: stream ? '#c8430a' : '#3a3330',
                    color: 'white', border: 'none', borderRadius: 8,
                    padding: '10px 20px', fontSize: 14, fontWeight: 700,
                    cursor: stream ? 'pointer' : 'not-allowed',
                    opacity: !stream || saveStatus === 'saving' ? 0.6 : 1,
                  }}
                >
                  ▶ Start Recording
                </button>
              ) : (
                <button
                  onClick={stopAndSave}
                  style={{
                    background: '#1a3a2a', color: '#86efac',
                    border: '1px solid #22c55e', borderRadius: 8,
                    padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  ■ Stop & Save
                </button>
              )}
            </div>

            {/* Save status */}
            {saveStatus === 'saving' && (
              <div style={{ fontSize: 13, color: '#9a8e85' }}>Uploading your recording...</div>
            )}
            {saveStatus === 'saved' && (
              <div style={{
                fontSize: 14, fontWeight: 600, color: '#22c55e',
                background: '#0d2016', borderRadius: 8, padding: '10px 14px',
              }}>
                ✅ Saved! Your coach will review your recording.
              </div>
            )}
            {saveStatus === 'error' && (
              <div style={{
                fontSize: 13, color: '#ef4444',
                background: '#2a0a0a', borderRadius: 8, padding: '10px 14px',
              }}>
                Upload failed. Please try again.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Music player ── */}
      {musicUrl && (
        <div style={{
          flexShrink: 0, margin: '0 20px 20px',
          background: '#0f0c0c', borderRadius: 12,
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: 16,
          border: '1px solid #2a2420',
        }}>
          <button
            onClick={toggleMusic}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: musicPlaying ? '#c8430a' : '#3a3330',
              color: 'white', border: 'none', cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {musicPlaying ? '⏸' : '▶'}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#7a6e65', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Class Music</div>
            <div style={{ fontSize: 14, color: '#faf7f2', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🎵 {musicTitle}
            </div>
          </div>
          <audio
            ref={audioRef}
            src={musicUrl}
            onEnded={() => setMusicPlaying(false)}
          />
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
