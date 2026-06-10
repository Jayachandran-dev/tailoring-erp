import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth, type Session } from '../auth/AuthContext';

type Mode = 'signup' | 'login';
type Step = 'request' | 'verify';

interface OtpIssued {
  mobile: string;
  requestId: string;
  expiresAt: string;
  devCode?: string;
  tenantId?: string;
}

interface AuthResult {
  // The JWT now lives in an httpOnly cookie set by the backend, not in this body.
  expiresAt: string;
  tenant: { id: string; name: string; slug: string };
  user: { id: string; mobile: string; displayName: string | null };
  role: 'OWNER' | 'MANAGER' | 'STAFF';
}

export function AuthPage() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>('signup');
  const [step, setStep] = useState<Step>('request');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // form state
  const [mobile, setMobile] = useState('');
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [code, setCode] = useState('');
  const [issued, setIssued] = useState<OtpIssued | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setStep('request');
    setError(null);
    setIssued(null);
    setCode('');
  }

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        const data = await api<OtpIssued>('/auth/signup/start', {
          method: 'POST',
          body: { mobile, shopName, ownerName },
        });
        setIssued(data);
      } else {
        const data = await api<OtpIssued>('/auth/login/start', {
          method: 'POST',
          body: { mobile },
        });
        setIssued(data);
      }
      setStep('verify');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to request OTP');
    } finally {
      setLoading(false);
    }
  }

  async function verifyAndSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!issued) return;
    setError(null);
    setLoading(true);
    try {
      const path = mode === 'signup' ? '/auth/signup/verify' : '/auth/login/verify';
      const body =
        mode === 'signup'
          ? { requestId: issued.requestId, mobile: issued.mobile, code, shopName, ownerName }
          : { requestId: issued.requestId, mobile: issued.mobile, code };
      const data = await api<AuthResult>(path, { method: 'POST', body });
      const session: Session = {
        token: '', // JWT is in the httpOnly cookie; placeholder kept for back-compat
        expiresAt: data.expiresAt,
        tenant: data.tenant,
        user: data.user,
        role: data.role,
      };
      signIn(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>{mode === 'signup' ? 'Create your shop' : 'Sign in to your shop'}</h1>
      <p className="muted">
        Mobile-based OTP login.{' '}
        {mode === 'signup'
          ? 'A new tenant is provisioned on verification.'
          : 'Enter the mobile you registered your shop with.'}
      </p>

      <div className="tabs">
        <button
          type="button"
          className={mode === 'signup' ? 'active' : 'inactive'}
          onClick={() => switchMode('signup')}
        >
          Signup
        </button>
        <button
          type="button"
          className={mode === 'login' ? 'active' : 'inactive'}
          onClick={() => switchMode('login')}
        >
          Login
        </button>
      </div>

      {step === 'request' && (
        <form className="card" onSubmit={requestOtp}>
          <label>Mobile (10-digit or +country)</label>
          <input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="9876543210"
            required
            inputMode="tel"
          />
          {mode === 'signup' && (
            <>
              <label>Shop name</label>
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Acme Tailors"
                required
              />
              <label>Owner name</label>
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Your name"
                required
              />
            </>
          )}
          <button disabled={loading}>{loading ? 'Sending…' : 'Send OTP'}</button>
          {error && <div className="error">{error}</div>}
        </form>
      )}

      {step === 'verify' && issued && (
        <form className="card" onSubmit={verifyAndSignIn}>
          <p className="muted">OTP sent to <strong>{issued.mobile}</strong>.</p>
          {issued.devCode && (
            <div className="devcode">
              DEV OTP: <strong>{issued.devCode}</strong> (only shown because <code>OTP_EXPOSE_IN_RESPONSE=true</code>)
            </div>
          )}
          <label>Enter OTP</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
          <button disabled={loading}>{loading ? 'Verifying…' : 'Verify & continue'}</button>
          <button type="button" className="ghost" onClick={() => setStep('request')}>
            Back
          </button>
          {error && <div className="error">{error}</div>}
        </form>
      )}
    </div>
  );
}
