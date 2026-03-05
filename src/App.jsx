import { useState, useEffect } from 'react'
import HomePage from './HomePage'
import AuthPage from './pages/AuthPage'
import SessionPage from './pages/SessionPage'
import RoleSelectPage from './pages/RoleSelectPage'
import { supabase } from './lib/supabase'
import ChoreoPage from './pages/ChoreoPage'

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [currentSession, setCurrentSession] = useState(null)
  const [mode, setMode] = useState('learning')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)
        setShowAuth(false)
        if (session?.user) fetchProfile(session.user.id)
        else { setProfile(null); setLoading(false) }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 900, color: '#faf7f2' }}>
        Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
      </div>
    </div>
  )

  if (showAuth && !user) {
    return <AuthPage onAuth={(u) => { setUser(u); setShowAuth(false) }} />
  }

// New user — needs to pick role
  if (user && profile && !profile.role) {
    return <RoleSelectPage user={user} onRoleSelected={async (role) => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(data)
    }} />
  }

  // Approved choreographer in teaching mode
  if (user && profile?.role === 'choreographer' && profile?.choreographer_approved && mode === 'teaching') {
    return (
      <ChoreoPage
        user={user}
        profile={profile}
        onSwitchToLearning={() => setMode('learning')}
        onLogout={async () => {
          await supabase.auth.signOut()
          setUser(null)
          setProfile(null)
          setMode('learning')
        }}
      />
    )
  }

  if (currentSession) {
    return (
      <SessionPage
        sessionId={currentSession}
        user={user}
        onBack={() => setCurrentSession(null)}
        onLoginClick={() => setShowAuth(true)}
      />
    )
  }

    return (
        <HomePage
          onLoginClick={() => setShowAuth(true)}
          user={user}
          profile={profile}
          onSessionClick={(id) => setCurrentSession(id)}
          onSwitchToTeaching={() => setMode('teaching')}
          onLogout={async () => {
            await supabase.auth.signOut()
            setUser(null)
            setProfile(null)
            setMode('learning')
          }}
        />
      )
}