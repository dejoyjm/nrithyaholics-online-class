import { useState, useEffect } from 'react'
import HomePage from './HomePage'
import AuthPage from './pages/AuthPage'
import SessionPage from './pages/SessionPage'
import { supabase } from './lib/supabase'

export default function App() {
  const [user, setUser] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [currentSession, setCurrentSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setShowAuth(false)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{
      minHeight: '100vh', background: '#0f0c0c',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 900, color: '#faf7f2'}}>
        Nrithya<span style={{color: '#c8430a'}}>Holics</span>
      </div>
    </div>
  )

  if (showAuth && !user) {
    return <AuthPage onAuth={(u) => { setUser(u); setShowAuth(false) }} />
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
      onSessionClick={(id) => setCurrentSession(id)}
      onLogout={async () => {
        await supabase.auth.signOut()
        setUser(null)
      }}
    />
  )
}