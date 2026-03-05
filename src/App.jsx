import { useState, useEffect } from 'react'
import HomePage from './HomePage'
import AuthPage from './pages/AuthPage'
import { supabase } from './lib/supabase'

export default function App() {
  const [user, setUser] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is already logged in (handles magic link redirect too)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setShowAuth(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0f0c0c',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: 'Georgia, serif',
          fontSize: 32,
          fontWeight: 900,
          color: '#faf7f2',
        }}>
          Nrithya<span style={{color: '#c8430a'}}>Holics</span>
        </div>
      </div>
    )
  }

  if (showAuth && !user) {
    return <AuthPage onAuth={(u) => { setUser(u); setShowAuth(false) }} />
  }

  return (
    <HomePage
      onLoginClick={() => setShowAuth(true)}
      user={user}
      onLogout={async () => {
        await supabase.auth.signOut()
        setUser(null)
      }}
    />
  )
}