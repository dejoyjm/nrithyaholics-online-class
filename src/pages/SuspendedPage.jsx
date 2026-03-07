import { useState } from 'react'

export default function SuspendedPage({ reason, suspendedAt, onLogout }) {
  const [loggingOut, setLoggingOut] = useState(false)

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric'
  }) : null

  async function handleLogout() {
    setLoggingOut(true)
    await onLogout()
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
      {/* Logo */}
      <div style={{
        fontFamily: 'Georgia, serif',
        fontSize: 28,
        fontWeight: 900,
        color: '#faf7f2',
        marginBottom: 48,
        letterSpacing: '-0.5px',
      }}>
        Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
      </div>

      {/* Card */}
      <div style={{
        background: 'white',
        borderRadius: 20,
        padding: '40px 36px',
        maxWidth: 460,
        width: '100%',
        textAlign: 'center',
      }}>
        {/* Icon */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: '#fff0f0',
          border: '2px solid #ffcccc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
          margin: '0 auto 24px',
        }}>
          🚫
        </div>

        <h1 style={{
          fontFamily: 'Georgia, serif',
          fontSize: 22,
          fontWeight: 700,
          color: '#0f0c0c',
          marginBottom: 12,
        }}>
          Account Suspended
        </h1>

        <p style={{
          fontSize: 14,
          color: '#7a6e65',
          lineHeight: 1.7,
          marginBottom: 24,
        }}>
          Your account has been suspended and you cannot access NrithyaHolics at this time.
        </p>

        {/* Reason box — show if provided */}
        {reason && (
          <div style={{
            background: '#faf7f2',
            border: '1px solid #e2dbd4',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 24,
            textAlign: 'left',
          }}>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#7a6e65',
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              marginBottom: 6,
            }}>
              Reason
            </div>
            <div style={{
              fontSize: 14,
              color: '#0f0c0c',
              lineHeight: 1.6,
            }}>
              {reason}
            </div>
            {suspendedAt && (
              <div style={{ fontSize: 12, color: '#7a6e65', marginTop: 6 }}>
                Suspended on {formatDate(suspendedAt)}
              </div>
            )}
          </div>
        )}

        {/* Contact */}
        <p style={{
          fontSize: 13,
          color: '#7a6e65',
          lineHeight: 1.7,
          marginBottom: 28,
        }}>
          If you believe this is a mistake, please contact us at{' '}
          <a
            href="mailto:support@nrithyaholics.in"
            style={{ color: '#c8430a', textDecoration: 'none', fontWeight: 600 }}
          >
            support@nrithyaholics.in
          </a>
        </p>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            width: '100%',
            background: '#0f0c0c',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            padding: '14px',
            fontSize: 15,
            fontWeight: 600,
            cursor: loggingOut ? 'not-allowed' : 'pointer',
            opacity: loggingOut ? 0.7 : 1,
          }}
        >
          {loggingOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 32,
        fontSize: 12,
        color: 'rgba(250,247,242,0.3)',
      }}>
        © {new Date().getFullYear()} NrithyaHolics
      </div>
    </div>
  )
}
