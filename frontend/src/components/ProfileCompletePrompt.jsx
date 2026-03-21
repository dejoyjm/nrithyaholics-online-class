import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ProfileCompletePrompt({ user, profile, onComplete, onSkip }) {
  const needsName  = !profile?.full_name
  const needsPhone = !profile?.phone

  const [name,  setName]  = useState(profile?.full_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [saving, setSaving] = useState(false)

  // Nothing missing — don't render
  if (!needsName && !needsPhone) return null

  const inputStyle = {
    width: '100%', border: '1px solid #e2dbd4', borderRadius: 10,
    padding: '14px', fontSize: 15, outline: 'none',
    boxSizing: 'border-box', marginTop: 6, background: '#faf7f2', color: '#0f0c0c',
  }
  const labelStyle = {
    fontSize: 12, color: '#7a6e65', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block',
  }

  async function handleSave() {
    const updates = {}
    if (needsName  && name.trim())  updates.full_name = name.trim()
    if (needsPhone && phone.trim()) updates.phone     = phone.trim()

    if (Object.keys(updates).length === 0) {
      handleSkip()
      return
    }

    setSaving(true)
    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)
    setSaving(false)
    if (error) { alert(error.message); return }
    onComplete(updates)
  }

  function handleSkip() {
    sessionStorage.setItem('nrh_profile_prompt_skipped', '1')
    onSkip()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,12,12,0.85)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: 28,
        width: '100%', maxWidth: 400, textAlign: 'center',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#0f0c0c', margin: '0 0 8px' }}>
          Welcome to NrithyaHolics!
        </h2>
        <p style={{ fontSize: 14, color: '#7a6e65', margin: '0 0 24px', lineHeight: 1.5 }}>
          Help us personalise your experience
        </p>

        <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          {needsName && (
            <div>
              <label style={labelStyle}>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your full name"
                style={inputStyle}
                autoFocus
              />
            </div>
          )}
          {needsPhone && (
            <div>
              <label style={labelStyle}>WhatsApp / Mobile</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                style={inputStyle}
              />
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', background: saving ? '#a09890' : '#c8430a', color: 'white',
            border: 'none', borderRadius: 12, padding: '15px', fontSize: 15,
            fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', marginBottom: 12,
          }}
        >
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>

        <button
          onClick={handleSkip}
          style={{
            background: 'none', border: 'none', color: '#a09890', fontSize: 13,
            cursor: 'pointer', display: 'block', width: '100%', marginBottom: 6,
          }}
        >
          Skip for now →
        </button>

        <p style={{ fontSize: 11, color: '#c8c0b8', margin: 0 }}>
          You can update this anytime in your profile
        </p>
      </div>
    </div>
  )
}
