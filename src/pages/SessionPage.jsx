import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const RAZORPAY_KEY_ID = 'rzp_live_bYmMMbiG8WZC34'
const APP_URL = 'https://online.nrithyaholics.in'

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit'
  })
}

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (document.getElementById('razorpay-script')) { resolve(true); return }
    const script = document.createElement('script')
    script.id = 'razorpay-script'
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

async function callVerifyPayment(params, token) {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-payment`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(params),
    }
  )
  return res.json()
}

export default function SessionPage({ sessionId, user, onBack, onLoginClick }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState(false)
  const [alreadyBooked, setAlreadyBooked] = useState(false)
  const [seats, setSeats] = useState(1)
  const [selectedTier, setSelectedTier] = useState(0)
  const [paymentError, setPaymentError] = useState(null)
  const [userEmail, setUserEmail] = useState('')
  const [userName, setUserName] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => { fetchSession() }, [sessionId])
  useEffect(() => { if (user) fetchUserDetails() }, [user])

  // Handle redirect-back from Razorpay
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const rzp_order = params.get('razorpay_order_id')
    const rzp_payment = params.get('razorpay_payment_id')
    const rzp_sig = params.get('razorpay_signature')

    if (rzp_order && rzp_payment && rzp_sig) {
      // Clear URL params immediately
      window.history.replaceState({}, '', window.location.pathname)

      // Get pending payment info from sessionStorage
      const pending = JSON.parse(sessionStorage.getItem('nrh_pending_payment') || '{}')
      sessionStorage.removeItem('nrh_pending_payment')

      if (pending.session_id) {
        setVerifying(true)
        supabase.auth.getSession().then(async ({ data: { session: authSession } }) => {
          const token = authSession?.access_token
          const result = await callVerifyPayment({
            razorpay_order_id: rzp_order,
            razorpay_payment_id: rzp_payment,
            razorpay_signature: rzp_sig,
            session_id: pending.session_id,
            seats: pending.seats,
            amount_inr: pending.amount_inr,
          }, token)

          setVerifying(false)
          if (result.success) {
            setBooked(true)
          } else {
            setPaymentError(result.error || 'Payment received but booking failed. Contact support with payment ID: ' + rzp_payment)
          }
        })
      }
    }
  }, [])

  async function fetchSession() {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, profiles(full_name, bio, instagram_handle, avatar_url)')
      .eq('id', sessionId)
      .single()
    if (error) console.error(error)
    else {
      setSession(data)
      if (user) checkExistingBooking(data.id)
    }
    setLoading(false)
  }

  async function fetchUserDetails() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    setUserEmail(authUser?.email || '')
    const { data: profile } = await supabase
      .from('profiles').select('full_name').eq('id', user.id).single()
    setUserName(profile?.full_name || '')
  }

  async function checkExistingBooking(sid) {
    const { data } = await supabase
      .from('bookings').select('id')
      .eq('session_id', sid).eq('booked_by', user.id).eq('status', 'confirmed')
      .maybeSingle()
    if (data) setAlreadyBooked(true)
  }

  async function handleBook() {
    if (!user) { onLoginClick(); return }
    if (session.status !== 'open' && session.status !== 'confirmed') {
      setPaymentError('This session is not available for booking.')
      return
    }

    setBooking(true)
    setPaymentError(null)

    try {
      const loaded = await loadRazorpayScript()
      if (!loaded) {
        setPaymentError('Could not load payment gateway. Please check your connection.')
        setBooking(false)
        return
      }

      const tier = tiers[selectedTier]
      const amount_inr = tier.price * seats

      const { data: { session: authSession } } = await supabase.auth.getSession()
      const token = authSession?.access_token

      const orderRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-razorpay-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ session_id: session.id, amount_inr, seats }),
        }
      )

      const orderData = await orderRes.json()
      if (!orderRes.ok || !orderData.order_id) {
        setPaymentError(orderData.error || 'Failed to create payment order. Please try again.')
        setBooking(false)
        return
      }

      // Store pending payment info for redirect-back verification
      sessionStorage.setItem('nrh_pending_payment', JSON.stringify({
        session_id: session.id,
        seats,
        amount_inr,
        order_id: orderData.order_id,
      }))

      // Detect mobile
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

      const options = {
        key: RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'NrithyaHolics',
        description: `${session.title} · ${seats} seat${seats > 1 ? 's' : ''}`,
        order_id: orderData.order_id,
        prefill: { email: userEmail, name: userName },
        theme: { color: '#c8430a' },

        // Redirect flow for mobile — popup for desktop
        ...(isMobile ? {
          redirect: true,
          callback_url: `${APP_URL}/?razorpay_session=${session.id}`,
        } : {}),

        modal: {
          backdropclose: false,
          handleback: true,
          ondismiss: () => {
            sessionStorage.removeItem('nrh_pending_payment')
            setBooking(false)
            setPaymentError('Payment cancelled. No amount was charged.')
          },
        },

        handler: async (response) => {
          // Desktop popup success handler
          const result = await callVerifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            session_id: session.id,
            seats,
            amount_inr,
          }, token)

          if (result.success) {
            setBooked(true)
            setBooking(false)
          } else {
            setPaymentError(result.error || 'Payment received but booking failed. Contact support with payment ID: ' + response.razorpay_payment_id)
            setBooking(false)
          }
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', (response) => {
        sessionStorage.removeItem('nrh_pending_payment')
        setPaymentError('Payment failed: ' + (response.error?.description || 'Unknown error'))
        setBooking(false)
      })
      rzp.open()

    } catch (err) {
      console.error('Payment error:', err)
      setPaymentError('Something went wrong. Please try again.')
      setBooking(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#faf7f2', fontSize: 18 }}>
      Loading session...
    </div>
  )

  if (!session) return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#faf7f2', fontSize: 18 }}>
      Session not found
    </div>
  )

  const tiers = session.price_tiers || []
  const totalSeats = tiers.reduce((sum, t) => sum + t.seats, 0)
  const styleColors = {
    bollywood: '#c8430a', bharatanatyam: '#5b4fcf', contemporary: '#1a7a3c',
    hiphop: '#b5420e', kathak: '#8b4513', folk: '#c47800', jazz: '#1a5db5', fusion: '#7a1a7a'
  }
  const color = styleColors[session.style_tags?.[0]?.toLowerCase().replace(/\s/g, '')] || '#c8430a'
  const currentTierPrice = tiers[selectedTier]?.price || 0
  const totalAmount = currentTierPrice * seats
  const isBookable = (session.status === 'open' || session.status === 'confirmed') && !alreadyBooked

  // Verifying state (redirect-back)
  if (verifying) return (
    <div style={{ minHeight: '100vh', background: '#faf7f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 48 }}>⏳</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c' }}>Confirming your booking...</div>
      <div style={{ fontSize: 14, color: '#7a6e65' }}>Please wait, do not close this page</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2' }}>
      {/* Header */}
      <div style={{ background: '#0f0c0c', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
          ← Back
        </button>
        <span style={{ fontFamily: 'Georgia, serif', fontWeight: 700, color: '#faf7f2', fontSize: 18 }}>
          Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
        </span>
      </div>

      {/* Cover */}
      {session.cover_photo_url && (
        <div style={{ height: 280, overflow: 'hidden', background: '#0f0c0c' }}>
          <img src={session.cover_photo_url} alt={session.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', display: 'grid', gridTemplateColumns: window.innerWidth < 768 ? '1fr' : '1fr 380px', gap: 32, alignItems: 'start' }}>

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {session.style_tags?.map(t => (
                <span key={t} style={{ background: color, color: 'white', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t}</span>
              ))}
              {session.skill_level && (
                <span style={{ background: '#f0ebe6', color: '#5a4e47', fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, textTransform: 'capitalize' }}>
                  {session.skill_level.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f0c0c', fontFamily: 'Georgia, serif', marginBottom: 8, lineHeight: 1.3 }}>
              {session.title}
            </h1>
          </div>

          {session.profiles && (
            <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e2dbd4', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                {session.profiles.avatar_url
                  ? <img src={session.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (session.profiles.full_name?.[0] || '?')}
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#7a6e65', marginBottom: 2 }}>Your choreographer</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f0c0c' }}>{session.profiles.full_name}</div>
                {session.profiles.instagram_handle && (
                  <div style={{ fontSize: 13, color: '#7a6e65' }}>@{session.profiles.instagram_handle}</div>
                )}
              </div>
            </div>
          )}

          {session.description && (
            <div style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #e2dbd4' }}>
              <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>About this session</div>
              <p style={{ fontSize: 15, color: '#3a2e2e', lineHeight: 1.7, margin: 0 }}>{session.description}</p>
            </div>
          )}

          <div style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #e2dbd4' }}>
            <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Session Details</div>
            {[
              ['📅', 'Date & Time', formatDate(session.scheduled_at)],
              ['⏱️', 'Duration', `${session.duration_minutes} minutes`],
              ['👥', 'Seats available', `${totalSeats - (session.bookings_count || 0)} of ${totalSeats}`],
              ['📊', 'Level', session.skill_level?.replace(/_/g, ' ')],
              ['✅', 'Status', session.status],
            ].map(([icon, label, value]) => (
              <div key={label} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid #f0ebe6' }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 12, color: '#7a6e65', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f0c0c', textTransform: 'capitalize' }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Booking card */}
        <div style={{ background: 'white', borderRadius: 16, padding: 28, border: '1px solid #e2dbd4', position: window.innerWidth < 768 ? 'static' : 'sticky', top: 80 }}>

          {booked ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
              <h3 style={{ fontSize: 22, fontWeight: 800, color: '#0f0c0c', marginBottom: 8, fontFamily: 'Georgia, serif' }}>You're booked!</h3>
              <p style={{ fontSize: 14, color: '#7a6e65', lineHeight: 1.6, marginBottom: 24 }}>
                Your spot is confirmed. We'll send you the join link before the session starts.
              </p>
              <button onClick={onBack} style={{ width: '100%', background: '#0f0c0c', color: 'white', border: 'none', borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                Browse more sessions
              </button>
            </div>

          ) : alreadyBooked ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f0c0c', marginBottom: 8 }}>Already booked!</h3>
              <p style={{ fontSize: 14, color: '#7a6e65', lineHeight: 1.6 }}>You have a confirmed spot in this session.</p>
            </div>

          ) : !isBookable ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', marginBottom: 8, textTransform: 'capitalize' }}>
                Session {session.status}
              </h3>
              <p style={{ fontSize: 14, color: '#7a6e65' }}>This session is not available for booking.</p>
            </div>

          ) : (
            <div>
              {tiers.length > 1 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Select pricing tier</div>
                  {tiers.map((tier, i) => (
                    <div key={i} onClick={() => setSelectedTier(i)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 14px', borderRadius: 10, marginBottom: 8, cursor: 'pointer',
                        border: selectedTier === i ? `2px solid ${color}` : '1px solid #e2dbd4',
                        background: selectedTier === i ? '#faf7f2' : 'white',
                      }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f0c0c' }}>
                          {i === 0 ? '🐦 Early Bird' : `Tier ${i + 1}`}
                        </div>
                        <div style={{ fontSize: 11, color: '#7a6e65' }}>{tier.seats} seats at this price</div>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: color }}>₹{tier.price}</div>
                    </div>
                  ))}
                </div>
              )}

              {tiers.length === 1 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Price per seat</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#0f0c0c' }}>₹{tiers[0].price}</div>
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Number of seats</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <button onClick={() => setSeats(Math.max(1, seats - 1))}
                    style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e2dbd4', background: 'white', fontSize: 18, cursor: 'pointer', color: '#0f0c0c' }}>−</button>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#0f0c0c', minWidth: 24, textAlign: 'center' }}>{seats}</span>
                  <button onClick={() => setSeats(Math.min(5, seats + 1))}
                    style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e2dbd4', background: 'white', fontSize: 18, cursor: 'pointer', color: '#0f0c0c' }}>+</button>
                  <span style={{ fontSize: 13, color: '#7a6e65' }}>max 5</span>
                </div>
              </div>

              <div style={{ background: '#faf7f2', borderRadius: 10, padding: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#5a4e47' }}>Total</span>
                <span style={{ fontSize: 26, fontWeight: 800, color: '#0f0c0c' }}>₹{totalAmount}</span>
              </div>

              {paymentError && (
                <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: '#cc0000', lineHeight: 1.5 }}>
                  {paymentError}
                </div>
              )}

              <button onClick={handleBook} disabled={booking}
                style={{
                  width: '100%', background: booking ? '#a0a0a0' : color,
                  color: 'white', border: 'none', borderRadius: 10,
                  padding: 16, fontSize: 16, fontWeight: 700,
                  cursor: booking ? 'not-allowed' : 'pointer',
                  marginBottom: 12, transition: 'background 0.2s'
                }}>
                {booking ? '⏳ Processing...' : user ? `Pay ₹${totalAmount} & Book` : 'Login to Book'}
              </button>

              <p style={{ fontSize: 12, color: '#7a6e65', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
                🔒 Secure payment via Razorpay · UPI, Cards, Netbanking accepted<br />
                Full refund if session is cancelled
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit'
  })
}

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (document.getElementById('razorpay-script')) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.id = 'razorpay-script'
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export default function SessionPage({ sessionId, user, onBack, onLoginClick }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState(false)
  const [alreadyBooked, setAlreadyBooked] = useState(false)
  const [seats, setSeats] = useState(1)
  const [selectedTier, setSelectedTier] = useState(0)
  const [paymentError, setPaymentError] = useState(null)
  const [userEmail, setUserEmail] = useState('')
  const [userName, setUserName] = useState('')

  useEffect(() => { fetchSession() }, [sessionId])
  useEffect(() => { if (user) fetchUserDetails() }, [user])

  async function fetchSession() {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, profiles(full_name, bio, instagram_handle, avatar_url)')
      .eq('id', sessionId)
      .single()
    if (error) console.error(error)
    else {
      setSession(data)
      if (user) checkExistingBooking(data.id)
    }
    setLoading(false)
  }

  async function fetchUserDetails() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    setUserEmail(authUser?.email || '')
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
    setUserName(profile?.full_name || '')
  }

  async function checkExistingBooking(sid) {
    const { data } = await supabase
      .from('bookings')
      .select('id')
      .eq('session_id', sid)
      .eq('booked_by', user.id)
      .eq('status', 'confirmed')
      .maybeSingle()
    if (data) setAlreadyBooked(true)
  }

  async function handleBook() {
    if (!user) { onLoginClick(); return }
    if (session.status !== 'open' && session.status !== 'confirmed') {
      setPaymentError('This session is not available for booking.')
      return
    }

    setBooking(true)
    setPaymentError(null)

    try {
      // 1. Load Razorpay script
      const loaded = await loadRazorpayScript()
      if (!loaded) {
        setPaymentError('Could not load payment gateway. Please check your connection.')
        setBooking(false)
        return
      }

      const tier = tiers[selectedTier]
      const amount_inr = tier.price * seats

      // 2. Create Razorpay order via Edge Function
      const { data: { session: authSession } } = await supabase.auth.getSession()
      const token = authSession?.access_token

      const orderRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-razorpay-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ session_id: session.id, amount_inr, seats }),
        }
      )

      const orderData = await orderRes.json()

      if (!orderRes.ok || !orderData.order_id) {
        setPaymentError(orderData.error || 'Failed to create payment order. Please try again.')
        setBooking(false)
        return
      }

      // 3. Open Razorpay checkout
      const options = {
        key: RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'NrithyaHolics',
        description: `${session.title} · ${seats} seat${seats > 1 ? 's' : ''}`,
        order_id: orderData.order_id,
        prefill: {
          email: userEmail,
          name: userName,
        },
        theme: { color: '#c8430a' },
        config: {
          display: {
            hide: [],
            preferences: { show_default_blocks: true }
          }
        },
        modal: {
          backdropclose: false,
          escape: false,
          handleback: true,
          confirm_close: false,
          animation: true,
          ondismiss: () => {
            setBooking(false)
            setPaymentError('Payment cancelled. No amount was charged.')
          },
        },
        handler: async (response) => {
          // 4. Verify payment via Edge Function
          const verifyRes = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-payment`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                session_id: session.id,
                seats,
                amount_inr,
              }),
            }
          )

          const verifyData = await verifyRes.json()

          if (verifyData.success) {
            setBooked(true)
            setBooking(false)
          } else {
            setPaymentError(
              verifyData.error || 'Payment received but booking failed. Please contact support with your payment ID: ' + response.razorpay_payment_id
            )
            setBooking(false)
          }
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', (response) => {
        setPaymentError('Payment failed: ' + (response.error?.description || 'Unknown error'))
        setBooking(false)
      })
      rzp.open()

    } catch (err) {
      console.error('Payment error:', err)
      setPaymentError('Something went wrong. Please try again.')
      setBooking(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#faf7f2', fontSize: 18 }}>
      Loading session...
    </div>
  )

  if (!session) return (
    <div style={{ minHeight: '100vh', background: '#0f0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#faf7f2', fontSize: 18 }}>
      Session not found
    </div>
  )

  const tiers = session.price_tiers || []
  const totalSeats = tiers.reduce((sum, t) => sum + t.seats, 0)
  const styleColors = {
    bollywood: '#c8430a', bharatanatyam: '#5b4fcf', contemporary: '#1a7a3c',
    hiphop: '#b5420e', kathak: '#8b4513', folk: '#c47800', jazz: '#1a5db5', fusion: '#7a1a7a'
  }
  const color = styleColors[session.style_tags?.[0]?.toLowerCase().replace(/\s/g, '')] || '#c8430a'
  const currentTierPrice = tiers[selectedTier]?.price || 0
  const totalAmount = currentTierPrice * seats
  const isBookable = (session.status === 'open' || session.status === 'confirmed') && !alreadyBooked

  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2' }}>
      {/* Header */}
      <div style={{ background: '#0f0c0c', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
          ← Back
        </button>
        <span style={{ fontFamily: 'Georgia, serif', fontWeight: 700, color: '#faf7f2', fontSize: 18 }}>
          Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
        </span>
      </div>

      {/* Cover */}
      {session.cover_photo_url && (
        <div style={{ height: 280, overflow: 'hidden', background: '#0f0c0c' }}>
          <img src={session.cover_photo_url} alt={session.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32, alignItems: 'start' }}>

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Title + tags */}
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {session.style_tags?.map(t => (
                <span key={t} style={{ background: color, color: 'white', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t}</span>
              ))}
              {session.skill_level && (
                <span style={{ background: '#f0ebe6', color: '#5a4e47', fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, textTransform: 'capitalize' }}>
                  {session.skill_level.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f0c0c', fontFamily: 'Georgia, serif', marginBottom: 8, lineHeight: 1.3 }}>
              {session.title}
            </h1>
          </div>

          {/* Choreographer */}
          {session.profiles && (
            <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e2dbd4', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                {session.profiles.avatar_url
                  ? <img src={session.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (session.profiles.full_name?.[0] || '?')}
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#7a6e65', marginBottom: 2 }}>Your choreographer</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f0c0c' }}>{session.profiles.full_name}</div>
                {session.profiles.instagram_handle && (
                  <div style={{ fontSize: 13, color: '#7a6e65' }}>@{session.profiles.instagram_handle}</div>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {session.description && (
            <div style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #e2dbd4' }}>
              <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>About this session</div>
              <p style={{ fontSize: 15, color: '#3a2e2e', lineHeight: 1.7, margin: 0 }}>{session.description}</p>
            </div>
          )}

          {/* Details */}
          <div style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #e2dbd4' }}>
            <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Session Details</div>
            {[
              ['📅', 'Date & Time', formatDate(session.scheduled_at)],
              ['⏱️', 'Duration', `${session.duration_minutes} minutes`],
              ['👥', 'Seats available', `${totalSeats - (session.bookings_count || 0)} of ${totalSeats}`],
              ['📊', 'Level', session.skill_level?.replace(/_/g, ' ')],
              ['✅', 'Status', session.status],
            ].map(([icon, label, value]) => (
              <div key={label} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid #f0ebe6' }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 12, color: '#7a6e65', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f0c0c', textTransform: 'capitalize' }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Booking card */}
        <div style={{ background: 'white', borderRadius: 16, padding: 28, border: '1px solid #e2dbd4', position: 'sticky', top: 80 }}>

          {booked ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
              <h3 style={{ fontSize: 22, fontWeight: 800, color: '#0f0c0c', marginBottom: 8, fontFamily: 'Georgia, serif' }}>You're booked!</h3>
              <p style={{ fontSize: 14, color: '#7a6e65', lineHeight: 1.6, marginBottom: 24 }}>
                Your spot is confirmed. We'll send you the join link before the session starts.
              </p>
              <button onClick={onBack} style={{ width: '100%', background: '#0f0c0c', color: 'white', border: 'none', borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                Browse more sessions
              </button>
            </div>

          ) : alreadyBooked ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f0c0c', marginBottom: 8 }}>Already booked!</h3>
              <p style={{ fontSize: 14, color: '#7a6e65', lineHeight: 1.6 }}>You have a confirmed spot in this session.</p>
            </div>

          ) : !isBookable ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', marginBottom: 8, textTransform: 'capitalize' }}>
                Session {session.status}
              </h3>
              <p style={{ fontSize: 14, color: '#7a6e65' }}>This session is not available for booking.</p>
            </div>

          ) : (
            <div>
              {/* Tier selector */}
              {tiers.length > 1 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Select pricing tier</div>
                  {tiers.map((tier, i) => (
                    <div key={i}
                      onClick={() => setSelectedTier(i)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 14px', borderRadius: 10, marginBottom: 8, cursor: 'pointer',
                        border: selectedTier === i ? `2px solid ${color}` : '1px solid #e2dbd4',
                        background: selectedTier === i ? '#faf7f2' : 'white',
                      }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f0c0c' }}>
                          {i === 0 ? '🐦 Early Bird' : `Tier ${i + 1}`}
                        </div>
                        <div style={{ fontSize: 11, color: '#7a6e65' }}>{tier.seats} seats at this price</div>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: color }}>₹{tier.price}</div>
                    </div>
                  ))}
                </div>
              )}

              {tiers.length === 1 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Price per seat</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#0f0c0c' }}>₹{tiers[0].price}</div>
                </div>
              )}

              {/* Seats selector */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Number of seats</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <button onClick={() => setSeats(Math.max(1, seats - 1))}
                    style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e2dbd4', background: 'white', fontSize: 18, cursor: 'pointer', color: '#0f0c0c' }}>−</button>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#0f0c0c', minWidth: 24, textAlign: 'center' }}>{seats}</span>
                  <button onClick={() => setSeats(Math.min(5, seats + 1))}
                    style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e2dbd4', background: 'white', fontSize: 18, cursor: 'pointer', color: '#0f0c0c' }}>+</button>
                  <span style={{ fontSize: 13, color: '#7a6e65' }}>max 5</span>
                </div>
              </div>

              {/* Total */}
              <div style={{ background: '#faf7f2', borderRadius: 10, padding: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#5a4e47' }}>Total</span>
                <span style={{ fontSize: 26, fontWeight: 800, color: '#0f0c0c' }}>₹{totalAmount}</span>
              </div>

              {/* Error */}
              {paymentError && (
                <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: '#cc0000', lineHeight: 1.5 }}>
                  {paymentError}
                </div>
              )}

              {/* Book button */}
              <button
                onClick={handleBook}
                disabled={booking}
                style={{
                  width: '100%', background: booking ? '#a0a0a0' : color,
                  color: 'white', border: 'none', borderRadius: 10,
                  padding: 16, fontSize: 16, fontWeight: 700,
                  cursor: booking ? 'not-allowed' : 'pointer',
                  marginBottom: 12, transition: 'background 0.2s'
                }}>
                {booking ? '⏳ Processing...' : user ? `Pay ₹${totalAmount} & Book` : 'Login to Book'}
              </button>

              <p style={{ fontSize: 12, color: '#7a6e65', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
                🔒 Secure payment via Razorpay · UPI, Cards, Netbanking accepted<br />
                Full refund if session is cancelled
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
