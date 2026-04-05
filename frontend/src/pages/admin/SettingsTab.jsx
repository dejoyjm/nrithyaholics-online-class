import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function SettingsTab({ onConfigSaved }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savingMode, setSavingMode] = useState(false)
  const [savedMode, setSavedMode] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchConfig() }, [])

  async function fetchConfig() {
    const { data } = await supabase
      .from('platform_config')
      .select('*')
      .eq('id', 1)
      .single()
    if (data) {
      setForm({
        host_pre_join_minutes:  data.host_pre_join_minutes,
        guest_pre_join_minutes: data.guest_pre_join_minutes,
        host_grace_minutes:     data.host_grace_minutes,
        guest_grace_minutes:    data.guest_grace_minutes,
        classroom_mode:         data.classroom_mode || 'prebuilt',
      })
    }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const { host_pre_join_minutes, guest_pre_join_minutes, host_grace_minutes, guest_grace_minutes } = form
    const { error } = await supabase
      .from('platform_config')
      .update({ host_pre_join_minutes, guest_pre_join_minutes, host_grace_minutes, guest_grace_minutes, updated_at: new Date().toISOString() })
      .eq('id', 1)
    setSaving(false)
    if (error) { alert(error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    if (onConfigSaved) onConfigSaved(form)
  }

  async function handleSaveMode() {
    setSavingMode(true)
    setSavedMode(false)
    const { error } = await supabase
      .from('platform_config')
      .update({ classroom_mode: form.classroom_mode, updated_at: new Date().toISOString() })
      .eq('id', 1)
    setSavingMode(false)
    if (error) { alert(error.message); return }
    setSavedMode(true)
    setTimeout(() => setSavedMode(false), 3000)
    if (onConfigSaved) onConfigSaved(form)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: Math.max(0, parseInt(v) || 0) }))

  const inputStyle = {
    width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4',
    borderRadius: 8, padding: '10px 14px', fontSize: 15, fontWeight: 600,
    outline: 'none', boxSizing: 'border-box', color: '#0f0c0c', textAlign: 'center',
  }
  const labelStyle = { fontSize: 12, color: '#7a6e65', fontWeight: 600, marginBottom: 6, display: 'block' }

  if (loading || !form) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#7a6e65' }}>Loading settings...</div>
  )

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 800, color: '#0f0c0c', marginBottom: 6 }}>
          Platform Settings
        </h2>
        <p style={{ fontSize: 14, color: '#7a6e65', lineHeight: 1.6 }}>
          Controls when the classroom becomes accessible before and after each session.
          Changes apply globally to all sessions. Individual sessions can override these values.
        </p>
      </div>

      <div style={{ background: 'white', borderRadius: 16, padding: 28, border: '1px solid #e2dbd4', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#c8430a', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20 }}>
          🎭 Choreographer (Host)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <label style={labelStyle}>Early entry (minutes before)</label>
            <input style={inputStyle} type="number" min="0" max="60" value={form.host_pre_join_minutes}
              onChange={e => set('host_pre_join_minutes', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Grace period (minutes after end)</label>
            <input style={inputStyle} type="number" min="0" max="120" value={form.host_grace_minutes}
              onChange={e => set('host_grace_minutes', e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 16, padding: 28, border: '1px solid #e2dbd4', marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#5b4fcf', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20 }}>
          💃 Learner (Guest)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <label style={labelStyle}>Early entry (minutes before)</label>
            <input style={inputStyle} type="number" min="0" max="30" value={form.guest_pre_join_minutes}
              onChange={e => set('guest_pre_join_minutes', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Grace period (minutes after end)</label>
            <input style={inputStyle} type="number" min="0" max="60" value={form.guest_grace_minutes}
              onChange={e => set('guest_grace_minutes', e.target.value)} />
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        style={{ background: saved ? '#1a7a3c' : '#c8430a', color: 'white', border: 'none', borderRadius: 10, padding: '14px 32px', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
        {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save Settings'}
      </button>

      {/* ── Classroom Mode ─────────────────────────────────────── */}
      <div style={{ background: 'white', borderRadius: 16, padding: 28, border: '1px solid #e2dbd4', marginTop: 28, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#0f0c0c', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
          🖥 Classroom Mode
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button
            onClick={() => setForm(f => ({ ...f, classroom_mode: 'prebuilt' }))}
            style={{
              padding: '10px 20px', borderRadius: 20, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              background: form.classroom_mode === 'prebuilt' ? '#0f0c0c' : '#faf7f2',
              color:      form.classroom_mode === 'prebuilt' ? 'white'   : '#5a4e47',
              border:     form.classroom_mode === 'prebuilt' ? '1px solid #0f0c0c' : '1px solid #e2dbd4',
            }}
          >
            🎞 Prebuilt (100ms)
          </button>
          <button
            onClick={() => setForm(f => ({ ...f, classroom_mode: 'sdk' }))}
            style={{
              padding: '10px 20px', borderRadius: 20, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              background: form.classroom_mode === 'sdk' ? '#0f0c0c' : '#faf7f2',
              color:      form.classroom_mode === 'sdk' ? 'white'   : '#5a4e47',
              border:     form.classroom_mode === 'sdk' ? '1px solid #0f0c0c' : '1px solid #e2dbd4',
            }}
          >
            ⚡ Custom SDK
          </button>
        </div>
        <div style={{ fontSize: 13, color: form.classroom_mode === 'sdk' ? '#22c55e' : '#7a6e65', marginBottom: 20 }}>
          {form.classroom_mode === 'sdk'
            ? 'NrithyaHolics custom classroom. Full control.'
            : '100ms hosted UI. Stable, no customisation.'}
        </div>
        <button onClick={handleSaveMode} disabled={savingMode}
          style={{ background: savedMode ? '#1a7a3c' : '#0f0c0c', color: 'white', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: savingMode ? 'not-allowed' : 'pointer', opacity: savingMode ? 0.7 : 1 }}>
          {savedMode ? '✓ Saved!' : savingMode ? 'Saving...' : 'Save Classroom Mode'}
        </button>
      </div>
    </div>
  )
}
