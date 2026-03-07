import { useState, useEffect } from 'react'
import HomePage from './HomePage'
import AuthPage from './pages/AuthPage'
import SessionPage from './pages/SessionPage'
import RoleSelectPage from './pages/RoleSelectPage'
import { supabase } from './lib/supabase'
import ChoreoPage from './pages/ChoreoPage'
import AdminPage from './pages/AdminPage'
import ProfilePage from './pages/ProfilePage'
import SuspendedPage from './pages/SuspendedPage'
import ChoreoProfilePage from './pages/ChoreoProfilePage'

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [currentSession, setCurrentSession] = useState(null)
  const [mode, setMode] = useState('learning')
  const [loading, setLoading] = useState(true)
  const [showProfile, setShowProfile] = useState(false)
  const [currentChoreoId, setCurrentChoreoId] = useState(null)
  // Razorpay redirect-back: pass these down to SessionPage
  const [razorpayReturn, setRazorpayReturn] = useState(null)

  // Detect Razorpay redirect-back on app load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const orderId = params.get('razorpay_order_id')
    const paymentId = params.get('razorpay_payment_id')
    const signature = params.get('razorpay_signature')

    if (orderId && paymentId && signature) {
      // Clean URL immediately
      window.history.replaceState({}, '', window.location.pathname)

      // Get session info from sessionStorage (saved before redirect)
      const pending = JSON.parse(sessionStorage.getItem('nrh_pending_payment') || '{}')
      sessionStorage.removeItem('nrh_pending_payment')

      if (pending.session_id) {
        setCurrentSession(pending.session_id)
        setRazorpayReturn({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
          session_id: pending.session_id,
          seats: pending.seats,
          amount_inr: pending.amount_inr,
        })
      }
    }
  }, [])

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

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('profile-watch')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => { setProfile(payload.new) }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  const logOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setMode('learning')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 900, color: '#faf7f2' }}>
        Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
      </div>
    </div>
  )

  if (user && profile?.suspended) {
    return (
      <SuspendedPage
        reason={profile.suspension_reason}
        suspendedAt={profile.suspended_at}
        onLogout={logOut}
      />
    )
  }

  if (showAuth && !user) {
    return <AuthPage onAuth={(u) => { setUser(u); setShowAuth(false) }} />
  }

  if (user && profile?.is_admin) {
    return <AdminPage user={user} onLogout={logOut} />
  }

  if (user && profile && !profile.role) {
    return (
      <RoleSelectPage
        user={user}
        profile={profile}
        onRoleSelected={async () => {
          const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
          setProfile(data)
        }}
      />
    )
  }

  if (user && profile?.role === 'choreographer' && profile?.choreographer_approved && mode === 'teaching') {
    return (
      <ChoreoPage
        user={user}
        profile={profile}
        onSwitchToLearning={() => setMode('learning')}
        onLogout={logOut}
        onProfileClick={() => { setMode('learning'); setShowProfile(true) }}
      />
    )
  }

  if (showProfile) {
    return (
      <ProfilePage
        user={user}
        profile={profile}
        onBack={() => setShowProfile(false)}
        onSwitchToTeaching={() => { setShowProfile(false); setMode('teaching') }}
        onApplyToTeach={() => {
          setShowProfile(false)
          setProfile({ ...profile, role: null })
        }}
      />
    )
  }

  if (currentChoreoId) {
    return (
      <ChoreoProfilePage
        choreoId={currentChoreoId}
        user={user}
        onBack={() => setCurrentChoreoId(null)}
        onSessionClick={(id) => {
          setCurrentChoreoId(null)
          setCurrentSession(id)
        }}
        onLoginClick={() => setShowAuth(true)}
      />
    )
  }

  if (currentSession) {
    return (
      <SessionPage
        sessionId={currentSession}
        user={user}
        onBack={() => { setCurrentSession(null); setRazorpayReturn(null) }}
        onLoginClick={() => setShowAuth(true)}
        razorpayReturn={razorpayReturn}
      />
    )
  }

  return (
    <HomePage
      onLoginClick={() => setShowAuth(true)}
      user={user}
      profile={profile}
      onSessionClick={(id) => setCurrentSession(id)}
      onChoreoClick={(id) => setCurrentChoreoId(id)}
      onProfileClick={() => setShowProfile(true)}
      onSwitchToTeaching={() => setMode('teaching')}
      onLogout={logOut}
    />
  )
}
