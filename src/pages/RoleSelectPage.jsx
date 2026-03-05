import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function RoleSelectPage({ user, onRoleSelected }) {
  const [step, setStep] = useState('choose') // 'choose' | 'apply'
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    full_name: '', instagram_handle: '', sample_video_url: '',
    bio: '', style_tags: [], teaching_language: 'Hindi'
  })
  const [error, setError] = useState('')

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const styles = ['Bollywood', 'Bharatanatyam', 'Contemporary', 'Hip Hop', 'Kathak', 'Folk', 'Freestyle']
  const languages = ['Hindi', 'English', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi']

  async function selectLearner() {
    setLoading(true)
    const { error } = await supabase
      .from('profiles')
      .update({ role: 'learner', profile_complete: true })
      .eq('id', user.id)
    if (error) alert(error.message)
    else onRoleSelected('learner')
    setLoading(false)
  }

  async function submitApplication() {
    if (!form.full_name.trim()) { setError('Full name is required'); return }
    if (!form.instagram_handle.trim() && !form.sample_video_url.trim()) {
      setError('Please provide your Instagram handle or a sample video link'); return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.from('profiles').update({
      role: 'choreographer',
      full_name: form.full_name,
      instagram_handle: form.instagram_handle,
      sample_video_url: form.sample_video_url,
      bio: form.bio,
      style_tags: form.style_tags,
      teaching_language: form.teaching_language,
      choreographer_approved: false,
      choreographer_requested_at: new Date().toISOString(),
      profile_complete: false,
    }).eq('id', user.id)
    if (error) alert(error.message)
    else onRoleSelected('choreographer_pending')
    setLoading(false)
  }

  const inputStyle = {
    width: '100%', background: 'rgba(250,247,242,0.05)',
    border: '1px solid rgba(250,247,242,0.15)', borderRadius: 10,
    color: '#faf7f2', fontSize: 15, padding: '12px 16px',
    outline: 'none', boxSizing: 'border-box', marginBottom: 4,
  }

  const labelStyle = {
    fontSize: 12, color: 'rgba(250,247,242,0.5)',
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 6, display: 'block'
  }

  if (step === 'choose') return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 900, color: '#faf7f2', marginBottom: 48 }}>
        Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
      </div>
      <div style={{ background: '#1a1614', border: '1px solid rgba(250,247,242,0.1)', borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 480 }}>
        <h2 style={{ color: '#faf7f2', fontSize: 24, fontWeight: 700, marginBottom: 8, fontFamily: 'Georgia, serif' }}>
          Welcome! How will you use NrithyaHolics?
        </h2>
        <p style={{ color: 'rgba(250,247,242,0.45)', fontSize: 14, marginBottom: 32 }}>You can do both — this just sets your starting point</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button onClick={selectLearner} disabled={loading}
            style={{ background: 'transparent', border: '2px solid rgba(250,247,242,0.15)', borderRadius: 16, padding: '24px', cursor: 'pointer', textAlign: 'left' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#c8430a'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(250,247,242,0.15)'}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💃</div>
            <div style={{ color: '#faf7f2', fontSize: 17, fontWeight: 700, marginBottom: 6 }}>I want to learn</div>
            <div style={{ color: 'rgba(250,247,242,0.45)', fontSize: 13, lineHeight: 1.5 }}>Browse and book live dance sessions from top choreographers</div>
          </button>

          <button onClick={() => setStep('apply')} disabled={loading}
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
        <button onClick={() => setStep('choose')} style={{ background: 'none', border: 'none', color: 'rgba(250,247,242,0.4)', fontSize: 13, cursor: 'pointer', marginBottom: 20, padding: 0 }}>
          ← Back
        </button>
        <h2 style={{ color: '#faf7f2', fontSize: 22, fontWeight: 700, marginBottom: 8, fontFamily: 'Georgia, serif' }}>
          Apply to teach on NrithyaHolics
        </h2>
        <p style={{ color: 'rgba(250,247,242,0.45)', fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
          We review every application personally. You'll hear back within 1–2 days. Meanwhile you can browse and book sessions as a learner.
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
            <div style={{ fontSize: 11, color: 'rgba(250,247,242,0.3)', marginTop: 4 }}>
              Instagram handle OR video link required — both is better!
            </div>
          </div>

          <div>
            <label style={labelStyle}>About You</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
              placeholder="Tell us about your dance background, teaching experience, what makes your sessions special..."
              value={form.bio} onChange={e => set('bio', e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Dance Styles You Teach</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {styles.map(s => (
                <button key={s} onClick={() => {
                  const tag = s.toLowerCase().replace(' ', '')
                  set('style_tags', form.style_tags.includes(tag)
                    ? form.style_tags.filter(t => t !== tag)
                    : [...form.style_tags, tag])
                }} style={{
                  background: form.style_tags.includes(s.toLowerCase().replace(' ', '')) ? '#c8430a' : 'rgba(250,247,242,0.08)',
                  color: '#faf7f2', border: '1px solid rgba(250,247,242,0.15)',
                  borderRadius: 20, padding: '6px 14px', fontSize: 13, cursor: 'pointer'
                }}>{s}</button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Primary Teaching Language</label>
            <select style={{ ...inputStyle, marginBottom: 0 }} value={form.teaching_language} onChange={e => set('teaching_language', e.target.value)}>
              {languages.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {error && <div style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</div>}

          <button onClick={submitApplication} disabled={loading} style={{
            width: '100%', background: '#c8430a', color: 'white',
            border: 'none', borderRadius: 10, padding: '14px',
            fontSize: 16, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Submitting...' : 'Submit Application →'}
          </button>
        </div>
      </div>
    </div>
  )
}