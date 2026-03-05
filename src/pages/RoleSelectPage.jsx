import { supabase } from '../lib/supabase'
import { useState } from 'react'

export default function RoleSelectPage({ user, onRoleSelected }) {
  const [loading, setLoading] = useState(false)

  async function selectRole(role) {
    setLoading(true)
    const { error } = await supabase
      .from('profiles')
      .update({ role, profile_complete: role === 'learner' })
      .eq('id', user.id)
    if (error) alert(error.message)
    else onRoleSelected(role)
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0f0c0c',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 900, color: '#faf7f2', marginBottom: 48 }}>
        Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
      </div>

      <div style={{ background: '#1a1614', border: '1px solid rgba(250,247,242,0.1)', borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 480 }}>
        <h2 style={{ color: '#faf7f2', fontSize: 24, fontWeight: 700, marginBottom: 8, fontFamily: 'Georgia, serif' }}>
          Welcome! How will you use NrithyaHolics?
        </h2>
        <p style={{ color: 'rgba(250,247,242,0.45)', fontSize: 14, marginBottom: 32 }}>
          You can always change this later
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button
            onClick={() => selectRole('learner')}
            disabled={loading}
            style={{
              background: 'transparent',
              border: '2px solid rgba(250,247,242,0.15)',
              borderRadius: 16, padding: '24px',
              cursor: 'pointer', textAlign: 'left',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#c8430a'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(250,247,242,0.15)'}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>💃</div>
            <div style={{ color: '#faf7f2', fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
              I want to learn
            </div>
            <div style={{ color: 'rgba(250,247,242,0.45)', fontSize: 13, lineHeight: 1.5 }}>
              Browse and book live dance sessions from top choreographers
            </div>
          </button>

          <button
            onClick={() => selectRole('choreographer')}
            disabled={loading}
            style={{
              background: 'transparent',
              border: '2px solid rgba(250,247,242,0.15)',
              borderRadius: 16, padding: '24px',
              cursor: 'pointer', textAlign: 'left',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#c8430a'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(250,247,242,0.15)'}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎭</div>
            <div style={{ color: '#faf7f2', fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
              I want to teach
            </div>
            <div style={{ color: 'rgba(250,247,242,0.45)', fontSize: 13, lineHeight: 1.5 }}>
              Create and host live dance sessions, build your student community
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}