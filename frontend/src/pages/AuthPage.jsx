import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthPage({ onAuth }) {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)

  async function verifyOtp() {
    if (!otpCode || otpCode.length !== 6) {
      setError('Enter the 6-digit code from your email')
      return
    }
    setOtpLoading(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'email' })
    if (error) setError(error.message)
    setOtpLoading(false)
  }

  async function sendLink() {
    if (!email || !email.includes('@')) {
      setError('Enter a valid email address')
      return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    })
    if (error) setError(error.message)
    else setStep('sent')
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

      <div style={{
        background: '#1a1614', border: '1px solid rgba(250,247,242,0.1)',
        borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 400,
      }}>
        {step === 'email' ? (
          <>
            <h2 style={{ color: '#faf7f2', fontSize: 24, fontWeight: 700, marginBottom: 8, fontFamily: 'Georgia, serif' }}>
              Welcome to NrithyaHolics
            </h2>
            <p style={{ color: 'rgba(250,247,242,0.45)', fontSize: 14, marginBottom: 32 }}>
              Enter your email — we'll send you a login link. No password needed.
            </p>

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendLink()}
              style={{
                width: '100%', background: 'rgba(250,247,242,0.05)',
                border: '1px solid rgba(250,247,242,0.15)', borderRadius: 10,
                color: '#faf7f2', fontSize: 16, padding: '14px 16px',
                outline: 'none', marginBottom: 16, boxSizing: 'border-box',
              }}
            />

            {error && <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{error}</div>}

            <button
              onClick={sendLink}
              disabled={loading}
              style={{
                width: '100%', background: '#c8430a', color: 'white',
                border: 'none', borderRadius: 10, padding: '14px',
                fontSize: 16, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1, marginBottom: 16,
              }}>
              {loading ? 'Sending...' : 'Send login link →'}
            </button>

            <div style={{ textAlign: 'center', color: 'rgba(250,247,242,0.3)', fontSize: 12 }}>
              No password needed — just click the link in your email
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 48, marginBottom: 20, textAlign: 'center' }}>📬</div>
            <h2 style={{ color: '#faf7f2', fontSize: 24, fontWeight: 700, marginBottom: 8, fontFamily: 'Georgia, serif', textAlign: 'center' }}>
              Check your email
            </h2>
            <p style={{ color: 'rgba(250,247,242,0.45)', fontSize: 14, marginBottom: 24, textAlign: 'center', lineHeight: 1.6 }}>
              We sent a login link to <span style={{ color: '#faf7f2' }}>{email}</span>. Click it to sign in — it expires in 1 hour.
            </p>

            <div style={{ background: 'rgba(250,247,242,0.05)', border: '1px solid rgba(250,247,242,0.1)', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
              <p style={{ color: 'rgba(250,247,242,0.55)', fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>
                If the link doesn't work, check your email for a 6-digit code and enter it below.
              </p>
              <input
                type="text"
                inputMode="numeric"
                placeholder="6-digit code"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => e.key === 'Enter' && verifyOtp()}
                style={{
                  width: '100%', background: 'rgba(250,247,242,0.05)',
                  border: '1px solid rgba(250,247,242,0.15)', borderRadius: 10,
                  color: '#faf7f2', fontSize: 20, padding: '12px 16px',
                  outline: 'none', marginBottom: 10, boxSizing: 'border-box',
                  letterSpacing: 6, textAlign: 'center',
                }}
              />
              {error && <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 8 }}>{error}</div>}
              <button
                onClick={verifyOtp}
                disabled={otpLoading}
                style={{
                  width: '100%', background: '#c8430a', color: 'white',
                  border: 'none', borderRadius: 10, padding: '12px',
                  fontSize: 15, fontWeight: 600,
                  cursor: otpLoading ? 'not-allowed' : 'pointer',
                  opacity: otpLoading ? 0.7 : 1,
                }}
              >
                {otpLoading ? 'Verifying...' : 'Verify code →'}
              </button>
            </div>

            <button
              onClick={() => { setStep('email'); setError(''); setEmail(''); setOtpCode('') }}
              style={{
                width: '100%', background: 'transparent',
                color: 'rgba(250,247,242,0.4)', border: '1px solid rgba(250,247,242,0.15)',
                borderRadius: 10, padding: '12px', fontSize: 14, cursor: 'pointer',
              }}>
              ← Use a different email
            </button>
          </>
        )}
      </div>
    </div>
  )
}
