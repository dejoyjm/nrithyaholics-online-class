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
import ClassroomPage from './pages/ClassroomPage'

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [platformConfig, setPlatformConfig] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [currentSession, setCurrentSession] = useState(null)
  const [mode, setMode] = useState('learning')
  const [loading, setLoading] = useState(true)
  const [showProfile, setShowProfile] = useState(false)
  const [currentChoreoId, setCurrentChoreoId] = useState(null)
  const [razorpayReturn, setRazorpayReturn] = useState(null)
  const [currentClassroom, setCurrentClassroom] = useState(null)
  // ── NEW: auto-open test modal when arriving via email test link ──
  const [autoOpenTest, setAutoOpenTest] = useState(false)
  // ── Set when arriving via email deep link (?session= param) ──
  const [cameFromEmail, setCameFromEmail] = useState(false)

  // Detect URL params on app load — handles:
  // 1. Razorpay payment redirect-back
  // 2. ?session=ID  — deep link to session from email (Join Class button)
  // 3. ?session=ID&test=1 — deep link + auto-open SetupTestModal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const orderId        = params.get('razorpay_order_id')
    const paymentId      = params.get('razorpay_payment_id')
    const signature      = params.get('razorpay_signature')
    const paymentSuccess = params.get('payment_success')
    const paymentError   = params.get('payment_error')
    const sessionIdParam = params.get('session_id')
    // ── NEW params ──
    const sessionDeepLink = params.get('session')
    const testParam       = params.get('test')

    // Clean URL regardless of which param set we handle
    if (orderId || paymentSuccess || paymentError || sessionDeepLink) {
      window.history.replaceState({}, '', window.location.pathname)
    }

    // ── NEW: Email deep link — ?session=ID or ?session=ID&test=1 ──
    if (sessionDeepLink) {
      setCurrentSession(sessionDeepLink)
      setCameFromEmail(true)
      if (testParam === '1') setAutoOpenTest(true)
      return
    }

    // Razorpay: webhook-first path (booking already exists)
    if (paymentSuccess === '1' && sessionIdParam) {
      const pending = JSON.parse(sessionStorage.getItem('nrh_pending_payment') || '{}')
      sessionStorage.removeItem('nrh_pending_payment')
      setCurrentSession(sessionIdParam)
      setRazorpayReturn({ alreadyComplete: true })
      return
    }

    // Razorpay: frontend verify path (booking not yet created)
    if (orderId && paymentId && signature) {
      const pending = JSON.parse(sessionStorage.getItem('nrh_pending_payment') || '{}')
      sessionStorage.removeItem('nrh_pending_payment')
      if (pending.session_id) {
        setCurrentSession(pending.session_id)
        setRazorpayReturn({
          razorpay_order_id:  orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature:  decodeURIComponent(signature),
          session_id:          pending.session_id,
          seats:               pending.seats,
          amount_inr:          pending.amount_inr,
        })
      }
    }
  }, [])

  // Fetch platform config once on mount — public read, no auth needed
  useEffect(() => {
    supabase
      .from('platform_config')
      .select('host_pre_join_minutes, guest_pre_join_minutes, host_grace_minutes, guest_grace_minutes')
      .eq('id', 1)
      .single()
      .then(({ data }) => { if (data) setPlatformConfig(data) })
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
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => { setProfile(payload.new) }
      ).subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }

  const logOut = async () => {
    await supabase.auth.signOut()
    setUser(null); setProfile(null); setMode('learning')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 900, color: '#faf7f2' }}>
        Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
      </div>
    </div>
  )

  if (user && profile?.suspended) return (
    <SuspendedPage reason={profile.suspension_reason} suspendedAt={profile.suspended_at} onLogout={logOut} />
  )

  if (showAuth && !user) return (
    <AuthPage onAuth={(u) => { setUser(u); setShowAuth(false) }} />
  )

  if (user && profile?.is_admin) return (
    <AdminPage user={user} onLogout={logOut} onConfigChange={setPlatformConfig} />
  )

  if (user && profile && !profile.role) return (
    <RoleSelectPage user={user} profile={profile}
      onRoleSelected={async () => {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(data)
      }}
    />
  )

  if (currentClassroom) return (
    <ClassroomPage
      sessionId={currentClassroom.sessionId}
      sessionData={currentClassroom.sessionData}
      user={user} profile={profile}
      onLeave={() => setCurrentClassroom(null)}
    />
  )

  if (user && profile?.role === 'choreographer' && profile?.choreographer_approved && mode === 'teaching') return (
    <ChoreoPage
      user={user} profile={profile} platformConfig={platformConfig}
      onSwitchToLearning={() => setMode('learning')}
      onLogout={logOut}
      onProfileClick={() => { setMode('learning'); setShowProfile(true) }}
      onStartClass={(session) => setCurrentClassroom({ sessionId: session.id, sessionData: session })}
    />
  )

  if (showProfile) return (
    <ProfilePage
      user={user} profile={profile} platformConfig={platformConfig}
      onBack={() => setShowProfile(false)}
      onSessionClick={(id) => { setShowProfile(false); setCurrentSession(id) }}
      onSwitchToTeaching={() => { setShowProfile(false); setMode('teaching') }}
      onApplyToTeach={() => { setShowProfile(false); setProfile({ ...profile, role: null }) }}
      onJoinClass={(sessionId, sessionData) => { setShowProfile(false); setCurrentClassroom({ sessionId, sessionData }) }}
    />
  )

  if (currentChoreoId) return (
    <ChoreoProfilePage
      choreoId={currentChoreoId} user={user}
      onBack={() => setCurrentChoreoId(null)}
      onSessionClick={(id) => { setCurrentChoreoId(null); setCurrentSession(id) }}
      onLoginClick={() => setShowAuth(true)}
    />
  )

  if (currentSession) return (
    <SessionPage
      sessionId={currentSession} user={user} profile={profile}
      platformConfig={platformConfig}
      onBack={() => { setCurrentSession(null); setRazorpayReturn(null); setAutoOpenTest(false); setCameFromEmail(false) }}
      onLoginClick={() => setShowAuth(true)}
      razorpayReturn={razorpayReturn}
      autoOpenTest={autoOpenTest}
      cameFromEmail={cameFromEmail}
    />
  )

  const lsStep = localStorage.getItem('nrh_choreo_apply_step')
  const midApply = (lsStep === '"apply"' || lsStep === 'apply') && profile?.role === 'learner'
  if (user && midApply) return (
    <RoleSelectPage user={user} profile={profile}
      onRoleSelected={async () => {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(data)
      }}
    />
  )

  return (
    <HomePage
      onLoginClick={() => setShowAuth(true)}
      user={user} profile={profile}
      onSessionClick={(id) => setCurrentSession(id)}
      onChoreoClick={(id) => setCurrentChoreoId(id)}
      onProfileClick={() => setShowProfile(true)}
      onSwitchToTeaching={() => setMode('teaching')}
      onLogout={logOut}
    />
  )
}