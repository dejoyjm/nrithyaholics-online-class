import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const LS = 'nrh_choreo_apply_'

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(LS + key); return v !== null ? JSON.parse(v) : fallback } catch { return fallback }
}
function lsSet(key, val) {
  try { localStorage.setItem(LS + key, JSON.stringify(val)) } catch {}
}
function lsClear() {
  ['step', 'full_name', 'instagram_handle', 'sample_video_url', 'bio', 'style_tags', 'teaching_languages']
    .forEach(k => { try { localStorage.removeItem(LS + k) } catch {} })
}

export default function RoleSelectPage({ user, profile, onRoleSelected }) {
  const [step, setStep] = useState(() => lsGet('step', 'choose'))
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    full_name: lsGet('full_name', profile?.full_name || ''),
    instagram_handle: lsGet('instagram_handle', profile?.instagram_handle || ''),
    sample_video_url: lsGet('sample_video_url', profile?.sample_video_url || ''),
    bio: lsGet('bio', profile?.bio || ''),
    style_tags: lsGet('style_tags', profile?.style_tags || []),
    teaching_languages: lsGet('teaching_languages', profile?.teaching_language ? [profile.teaching_language] : []),
  })
  const [error, setError] = useState('')

  useEffect(() => { lsSet('step', step) }, [step])
  useEffect(() => {
    lsSet('full_name', form.full_name)
    lsSet('instagram_handle', form.instagram_handle)
    lsSet('sample_video_url', form.sample_video_url)
    lsSet('bio', form.bio)
    lsSet('style_tags', form.style_tags)
    lsSet('teaching_languages', form.teaching_languages)
  }, [form])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const styles = ['Bollywood', 'Bharatanatyam', 'Contemporary', 'Hip Hop', 'Kathak', 'Folk', 'Jazz', 'Fusion']
  const languages = ['Hindi', 'English', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Punjabi', 'Bengali', 'Gujarati']

  function toggleStyle(s) {
    const tag = s.toLowerCase().replace(' ', '')
    set('style_tags', form.style_tags.includes(tag)
      ? form.style_tags.filter(t => t !== tag)
      : [...form.style_tags, tag])
  }

  function toggleLang(l) {
    set('teaching_languages', form.teaching_languages.includes(l)
      ? form.teaching_languages.filter(x => x !== l)
      : [...form.teaching_languages, l])
  }

  async function selectLearner() {
    setLoading(true)
    const { error } = await supabase.from('profiles')
      .update({ role: 'learner', profile_complete: true })
      .eq('id', user.id)
    if (error) alert(error.message)
    else { lsClear(); onRoleSelected('learner') }
    setLoading(false)
  }

  async function submitApplication() {
    if (!form.full_name.trim()) { setError('Full name is required'); return }
    if (!form.instagram_handle.trim() && !form.sample_video_url.trim()) {
      setError('Please provide your Instagram handle or a sample video link'); return
    }
    if (form.teaching_languages.length === 0) { setError('Please select at least one teaching language'); return }
    setLoading(true)
    setError('')
    const teachingLang = form.teaching_languages.length === 1
      ? form.teaching_languages[0]
      : JSON.stringify(form.teaching_languages)
    const { error } = await supabase.from('profiles').update({
      role: 'choreographer',
      full_name: form.full_name,
      instagram_handle: form.instagram_handle,
      sample_video_url: form.sample_video_url,
      bio: form.bio,
      style_tags: form.style_tags,
      teaching_language: teachingLang,
      choreographer_approved: false,
      choreographer_requested_at: new Date().toISOString(),
      profile_complete: false,
    }).eq('id', user.id)
    if (error) alert(error.message)
    else { lsClear(); onRoleSelected('choreographer_pending') }
    setLoading(false)
  }

  const inputStyle = {
    width: '100%', background: 'rgba(250,247,242,0.06)',
    border: '1px solid rgba(250,247,242,0.15)', borderRadius: 8,
    padding: '10px 14px', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', color: '#faf7f2',
  }
  const labelStyle = {
    fontSize: 11, color: 'rgba(250,247,242,0.45)',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'block',
  }

  if (step === 'choose') return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 900, color: '#faf7f2', marginBottom: 32 }}>
        Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
      </div>
      <div style={{ background: '#1a1614', border: '1px solid rgba(250,247,242,0.1)', borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 520 }}>
        <h2 style={{ color: '#faf7f2', fontSize: 22, fontWeight: 700, marginBottom: 8, fontFamily: 'Georgia, serif', textAlign: 'center' }}>
          How will you use NrithyaHolics?
        </h2>
        <p style={{ color: 'rgba(250,247,242,0.45)', fontSize: 14, marginBottom: 32, textAlign: 'center' }}>You can do both — this just sets your starting point</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button onClick={selectLearner} disabled={loading}
            style={{ background: 'transparent', border: '2px solid rgba(250,247,242,0.15)', borderRadius: 16, padding: '24px', cursor: 'pointer', textAlign: 'left' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#c8430a'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(250,247,242,0.15)'}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💃</div>
            <div style={{ color: '#faf7f2', fontSize: 17, fontWeight: 700, marginBottom: 6 }}>I want to learn</div>
            <div style={{ color: 'rgba(250,247,242,0.45)', fontSize: 13, lineHeight: 1.5 }}>Browse and book live dance sessions from top choreographers</div>
          </button>
          <button onClick={() => { localStorage.setItem('nrh_choreo_apply_step', JSON.stringify('apply')); setStep('apply') }} disabled={loading}
            style={{ background: 'transparent', border: '2px solid rgba(250,247,242,0.15)', borderRadius: 16, padding: '24px', cursor: 'pointer', textAlign: 'left' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#c8430a'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(250,247,242,0.15)'}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎭</div>
            <div style={{ color: '#faf7f2', fontSize: 17, fontWeight: 700, marginBottom: 6 }}>I want to teach</div>
            <div style={{ color: 'rgba(250,247,242,0.45)', fontSize: 13, lineHeight: 1.5 }}>Apply to host live dance sessions — admin reviews within 1-2 days</div>
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 900, color: '#faf7f2', marginBottom: 32 }}>
        Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
      </div>
      <div style={{ background: '#1a1614', border: '1px solid rgba(250,247,242,0.1)', borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto' }}>
        <button onClick={() => { localStorage.setItem('nrh_choreo_apply_step', JSON.stringify('choose')); setStep('choose') }} style={{ background: 'none', border: 'none', color: 'rgba(250,247,242,0.4)', fontSize: 13, cursor: 'pointer', marginBottom: 20, padding: 0 }}>← Back</button>
        <h2 style={{ color: '#faf7f2', fontSize: 22, fontWeight: 700, marginBottom: 8, fontFamily: 'Georgia, serif' }}>Apply to teach on NrithyaHolics</h2>
        <p style={{ color: 'rgba(250,247,242,0.45)', fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
          We review every application personally. You'll hear back within 1–2 days.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStyle}>Full Name *</label>
            <input style={inputStyle} placeholder="Your full name" value={form.full_name} onChange={e => set('full_name', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Instagram Handle</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: 13, color: 'rgba(250,247,242,0.4)', fontSize: 15 }}>@</span>
              <input style={{ ...inputStyle, paddingLeft: 30 }} placeholder="yourhandle" value={form.instagram_handle} onChange={e => set('instagram_handle', e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Sample Choreography Video Link</label>
            <input style={inputStyle} placeholder="YouTube, Instagram Reel, Drive link..." value={form.sample_video_url} onChange={e => set('sample_video_url', e.target.value)} />
            <div style={{ fontSize: 11, color: 'rgba(250,247,242,0.3)', marginTop: 4 }}>Instagram handle OR video link required — both is better!</div>
          </div>
          <div>
            <label style={labelStyle}>About You</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
              placeholder="Your dance background, teaching experience, what makes your sessions special..."
              value={form.bio} onChange={e => set('bio', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Dance Styles You Teach</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {styles.map(s => {
                const tag = s.toLowerCase().replace(' ', '')
                const active = form.style_tags.includes(tag)
                return (
                  <button key={s} onClick={() => toggleStyle(s)} style={{
                    background: active ? '#c8430a' : 'rgba(250,247,242,0.08)',
                    color: '#faf7f2', border: '1px solid rgba(250,247,242,0.15)',
                    borderRadius: 20, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                  }}>{s}</button>
                )
              })}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Teaching Languages <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>(select all that apply)</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {languages.map(l => {
                const active = form.teaching_languages.includes(l)
                return (
                  <button key={l} onClick={() => toggleLang(l)} style={{
                    background: active ? '#faf7f2' : 'rgba(250,247,242,0.08)',
                    color: active ? '#0f0c0c' : '#faf7f2',
                    border: '1px solid rgba(250,247,242,0.15)',
                    borderRadius: 20, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                    fontWeight: active ? 700 : 400,
                  }}>{l}</button>
                )
              })}
            </div>
            {form.teaching_languages.length === 0 && (
              <div style={{ fontSize: 11, color: 'rgba(255,160,0,0.8)', marginTop: 6 }}>Select at least one language</div>
            )}
          </div>
          {error && <div style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</div>}
          <button onClick={submitApplication} disabled={loading} style={{
            width: '100%', background: '#c8430a', color: 'white', border: 'none', borderRadius: 10,
            padding: '14px', fontSize: 16, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Submitting...' : 'Submit Application →'}
          </button>
        </div>
      </div>
    </div>
  )
}
