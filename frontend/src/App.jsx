import { useState, useEffect, useRef } from 'react'
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
import SetupTestModal from './pages/SetupTestModal'
import ProfileCompletePrompt from './components/ProfileCompletePrompt'

// ── Hash helpers (module-level, no state dependency) ─────────────────────────

function parseHash(hash = window.location.hash) {
  const h = (hash || '').replace(/^#\/?/, '')
  if (!h) return { page: 'home', id: null }
  const parts = h.split('/')
  return { page: parts[0] || 'home', id: parts[1] || null }
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const [autoOpenTest, setAutoOpenTest] = useState(false)
  const [cameFromEmail, setCameFromEmail] = useState(false)
  const [showQuickSetupModal, setShowQuickSetupModal] = useState(false)
  const [showProfilePrompt, setShowProfilePrompt] = useState(false)

  // Track whether URL search params handled navigation (takes priority over hash)
  const urlParamsHandled = useRef(false)
  // Hash to restore after login completes
  const pendingHash = useRef(null)
  // Set when ?test=1 arrives without ?session= — show modal after loading resolves
  const pendingQuickTest = useRef(false)

  // ── Hash state application ────────────────────────────────────────────────
  //
  // u and p are passed explicitly to avoid stale-closure issues when called
  // from effects that re-register infrequently (e.g. popstate listener).

  function applyHashState(hash, u, p) {
    const { page, id } = parseHash(hash)

    // Reset all page-navigation state before applying the new route
    setCurrentSession(null)
    setShowProfile(false)
    setCurrentChoreoId(null)
    setCurrentClassroom(null)
    setMode('learning')
    setRazorpayReturn(null)
    setAutoOpenTest(false)
    setCameFromEmail(false)

    switch (page) {
      case 'session':
        if (id) setCurrentSession(id)
        break

      case 'classroom':
        // Rule 7: restore classroom hash as SessionPage — user re-clicks Join
        // for a fresh token. The session ID is preserved.
        if (id) setCurrentSession(id)
        break

      case 'profile':
        if (!u) {
          // Auth guard: remember the hash and show login
          pendingHash.current = '#/profile'
          setShowAuth(true)
          window.location.hash = '#/profile' // keep in URL bar for after-login restore
        } else {
          setShowProfile(true)
        }
        break

      case 'teach':
        if (u && p?.role === 'choreographer' && p?.choreographer_approved) {
          setMode('teaching')
        }
        // else fall through — home state already set above
        break

      case 'admin':
        // Rule 8: only works when is_admin; otherwise silently redirect to home
        if (!p?.is_admin) window.location.hash = '#/'
        // else AdminPage renders automatically from profile.is_admin check
        break

      default:
        // home — all state already reset above
        break
    }
  }

  // Public navigation helper: update hash AND React state together
  function navigateTo(hash) {
    window.location.hash = hash
    applyHashState(hash, user, profile)
  }

  // ── URL params: Razorpay redirect + email deep links (priority over hash) ──

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const orderId         = params.get('razorpay_order_id')
    const paymentId       = params.get('razorpay_payment_id')
    const signature       = params.get('razorpay_signature')
    const paymentSuccess  = params.get('payment_success')
    const paymentError    = params.get('payment_error')
    const sessionIdParam  = params.get('session_id')
    const sessionDeepLink = params.get('session')
    const testParam       = params.get('test')

    // Nothing to handle — leave hash-based restore in charge
    if (!orderId && !paymentSuccess && !paymentError && !sessionDeepLink && testParam !== '1') return

    // ── Standalone setup test: ?test=1 (no session param) ──
    if (testParam === '1' && !sessionDeepLink) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
      pendingQuickTest.current = true
      return
    }

    // ── Email deep link: ?session=ID or ?session=ID&test=1 ──
    if (sessionDeepLink) {
      urlParamsHandled.current = true
      window.history.replaceState({}, '', window.location.pathname + '#/session/' + sessionDeepLink)
      setCurrentSession(sessionDeepLink)
      setCameFromEmail(true)
      if (testParam === '1') setAutoOpenTest(true)
      return
    }

    // ── Webhook path: ?payment_success=1&session_id=X ──
    if (paymentSuccess === '1' && sessionIdParam) {
      urlParamsHandled.current = true
      sessionStorage.removeItem('nrh_pending_payment')
      window.history.replaceState({}, '', window.location.pathname + '#/session/' + sessionIdParam)
      setCurrentSession(sessionIdParam)
      setRazorpayReturn({ alreadyComplete: true })
      return
    }

    // ── Frontend verify path: ?razorpay_order_id=…&razorpay_payment_id=…&razorpay_signature=… ──
    if (orderId && paymentId && signature) {
      urlParamsHandled.current = true
      const pending = JSON.parse(sessionStorage.getItem('nrh_pending_payment') || '{}')
      sessionStorage.removeItem('nrh_pending_payment')
      if (pending.session_id) {
        window.history.replaceState({}, '', window.location.pathname + '#/session/' + pending.session_id)
        setCurrentSession(pending.session_id)
        setRazorpayReturn({
          razorpay_order_id:   orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature:  decodeURIComponent(signature),
          session_id:          pending.session_id,
          seats:               pending.seats,
          amount_inr:          pending.amount_inr,
        })
      } else {
        window.history.replaceState({}, '', window.location.pathname)
      }
      return
    }

    // Fallback: clean up any remaining search params (e.g. paymentError alone)
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  // ── Platform config ───────────────────────────────────────────────────────

  useEffect(() => {
    supabase
      .from('platform_config')
      .select('host_pre_join_minutes, guest_pre_join_minutes, host_grace_minutes, guest_grace_minutes')
      .eq('id', 1)
      .single()
      .then(({ data }) => { if (data) setPlatformConfig(data) })
  }, [])

  // ── Auth ──────────────────────────────────────────────────────────────────

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

  // Profile realtime watch
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
    const skipped = sessionStorage.getItem('nrh_profile_prompt_skipped')
    if (!skipped && data && (!data.full_name || !data.phone)) {
      setShowProfilePrompt(true)
    }
  }

  // ── Hash restoration on initial load ─────────────────────────────────────
  // Runs once when loading resolves. Skipped if URL params already handled
  // navigation (magic links, Razorpay redirects take priority — Rule 5).

  useEffect(() => {
    if (loading) return
    if (urlParamsHandled.current) return
    // user and profile are current here: loading=false is set synchronously
    // with setProfile in fetchProfile, so React batches them together.
    applyHashState(window.location.hash, user, profile)
    if (pendingQuickTest.current) {
      pendingQuickTest.current = false
      setShowQuickSetupModal(true)
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore pending hash after login ─────────────────────────────────────
  // If auth was required (e.g. #/profile on refresh while logged out), this
  // re-applies the saved hash once both user and profile are available.

  useEffect(() => {
    if (!user || !profile) return
    if (!pendingHash.current) return
    const h = pendingHash.current
    pendingHash.current = null
    applyHashState(h, user, profile)
  }, [user?.id, profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Admin hash sync ───────────────────────────────────────────────────────
  // AdminPage always renders for admins — keep the URL bar in sync.

  useEffect(() => {
    if (user && profile?.is_admin) {
      if (window.location.hash !== '#/admin') window.location.hash = '#/admin'
    }
  }, [user, profile?.is_admin]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Browser back/forward (popstate) ──────────────────────────────────────
  // Re-registers when auth changes so the handler sees current user/profile.

  useEffect(() => {
    const handler = () => applyHashState(window.location.hash, user, profile)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [user, profile]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Logout ────────────────────────────────────────────────────────────────

  const logOut = async () => {
    window.location.hash = '#/'
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setMode('learning')
    setCurrentSession(null)
    setShowProfile(false)
    setCurrentClassroom(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

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
      onLeave={() => navigateTo('#/')}
    />
  )

  if (user && profile?.role === 'choreographer' && profile?.choreographer_approved && mode === 'teaching') return (
    <ChoreoPage
      user={user} profile={profile} platformConfig={platformConfig}
      onSwitchToLearning={() => navigateTo('#/')}
      onLogout={logOut}
      onProfileClick={() => navigateTo('#/profile')}
      onStartClass={(session) => {
        // Set state directly + update hash without calling applyHashState
        // (which would reset state we just set)
        setCurrentClassroom({ sessionId: session.id, sessionData: session })
        window.location.hash = '#/classroom/' + session.id
      }}
    />
  )

  if (showProfile) return (
    <ProfilePage
      user={user} profile={profile} platformConfig={platformConfig}
      onBack={() => navigateTo('#/')}
      onSessionClick={(id) => navigateTo('#/session/' + id)}
      onSwitchToTeaching={() => navigateTo('#/teach')}
      onApplyToTeach={() => { navigateTo('#/'); setProfile({ ...profile, role: null }) }}
      onJoinClass={(sessionId, sessionData) => {
        setCurrentClassroom({ sessionId, sessionData })
        window.location.hash = '#/classroom/' + sessionId
        setShowProfile(false)
      }}
    />
  )

  if (currentChoreoId) return (
    <ChoreoProfilePage
      choreoId={currentChoreoId} user={user}
      onBack={() => navigateTo('#/')}
      onSessionClick={(id) => navigateTo('#/session/' + id)}
      onLoginClick={() => setShowAuth(true)}
    />
  )

  if (currentSession) return (
    <SessionPage
      sessionId={currentSession} user={user} profile={profile}
      platformConfig={platformConfig}
      onBack={() => navigateTo('#/')}
      onLoginClick={() => setShowAuth(true)}
      razorpayReturn={razorpayReturn}
      autoOpenTest={autoOpenTest}
      cameFromEmail={cameFromEmail}
    />
  )

  // Rule 6: choreo apply in progress (localStorage) still routes to RoleSelectPage
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
    <>
      <HomePage
        onLoginClick={() => setShowAuth(true)}
        user={user} profile={profile}
        onSessionClick={(id) => navigateTo('#/session/' + id)}
        onChoreoClick={(id) => setCurrentChoreoId(id)}
        onProfileClick={() => navigateTo('#/profile')}
        onSwitchToTeaching={() => navigateTo('#/teach')}
        onLogout={logOut}
      />
      {showQuickSetupModal && (
        <SetupTestModal
          standaloneMode={true}
          onClose={() => {
            setShowQuickSetupModal(false)
            window.history.replaceState({}, '', window.location.pathname + window.location.hash)
          }}
        />
      )}
      {showProfilePrompt && user && profile && (
        <ProfileCompletePrompt
          user={user}
          profile={profile}
          onComplete={(updates) => {
            setProfile(p => ({ ...p, ...updates }))
            setShowProfilePrompt(false)
          }}
          onSkip={() => setShowProfilePrompt(false)}
        />
      )}
    </>
  )
}
