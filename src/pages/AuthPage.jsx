import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthPage({ onAuth }) {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function sendOTP() {
    if (!email || !email.includes('@')) {
      setError('Enter a valid email address')
      return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) {
      setError(error.message)
    } else {
      setStep('otp')
    }
    setLoading(false)
  }

  async function verifyOTP() {
    if (!otp || otp.length !== 6) {
      setError('Enter the 6-digit OTP')
      return
    }
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email'
    })
    if (error) {
      setError(error.message)
    } else {
      onAuth(data.user)
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f0c0c',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        fontFamily: 'Georgia, serif',
        fontSize: 32,
        fontWeight: 900,
        color: '#faf7f2',
        marginBottom: 48,
      }}>
        Nrithya<span style={{color: '#c8430a'}}>Holics</span>
      </div>

      <div style={{
        background: '#1a1614',
        border: '1px solid rgba(250,247,242,0.1)',
        borderRadius: 20,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 400,
      }}>
        <h2 style={{
          color: '#faf7f2',
          fontSize: 24,
          fontWeight: 700,
          marginBottom: 8,
          fontFamily: 'Georgia, serif',
        }}>
          {step === 'email' ? 'Welcome back' : 'Check your email'}
        </h2>
        <p style={{color: 'rgba(250,247,242,0.45)', fontSize: 14, marginBottom: 32}}>
          {step === 'email'
            ? 'Enter your email to continue'
            : `We sent a 6-digit code to ${email}`}
        </p>

        {step === 'email' ? (
          <>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendOTP()}
              style={{
                width: '100%',
                background: 'rgba(250,247,242,0.05)',
                border: '1px solid rgba(250,247,242,0.15)',
                borderRadius: 10,
                color: '#faf7f2',
                fontSize: 16,
                padding: '14px 16px',
                outline: 'none',
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
            />

            {error && (
              <div style={{color: '#ff6b6b', fontSize: 13, marginBottom: 12}}>
                {error}
              </div>
            )}

            <button
              onClick={sendOTP}
              disabled={loading}
              style={{
                width: '100%',
                background: '#c8430a',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                padding: '14px',
                fontSize: 16,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                marginBottom: 16,
              }}>
              {loading ? 'Sending...' : 'Send OTP →'}
            </button>

            <div style={{
              textAlign: 'center',
              color: 'rgba(250,247,242,0.3)',
              fontSize: 12,
            }}>
              We'll send a one-time password to your email
            </div>
          </>
        ) : (
          <>
            <input
              type="text"
              placeholder="000000"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && verifyOTP()}
              maxLength={6}
              style={{
                width: '100%',
                background: 'rgba(250,247,242,0.05)',
                border: '1px solid rgba(250,247,242,0.15)',
                borderRadius: 10,
                color: '#faf7f2',
                fontSize: 28,
                padding: '14px 16px',
                outline: 'none',
                letterSpacing: 8,
                textAlign: 'center',
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
            />

            {error && (
              <div style={{color: '#ff6b6b', fontSize: 13, marginBottom: 12}}>
                {error}
              </div>
            )}

            <button
              onClick={verifyOTP}
              disabled={loading}
              style={{
                width: '100%',
                background: '#c8430a',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                padding: '14px',
                fontSize: 16,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                marginBottom: 16,
              }}>
              {loading ? 'Verifying...' : 'Verify OTP →'}
            </button>

            <button
              onClick={() => { setStep('email'); setError(''); setOtp('') }}
              style={{
                width: '100%',
                background: 'transparent',
                color: 'rgba(250,247,242,0.4)',
                border: 'none',
                fontSize: 13,
                cursor: 'pointer',
                padding: '8px',
              }}>
              ← Change email
            </button>
          </>
        )}
      </div>
    </div>
  )
}