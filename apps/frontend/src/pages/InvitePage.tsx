// Public invite-acceptance page. Reached via /invite/:token (a link the
// owner/manager shared with the invitee). Two steps:
//   1) Preview — fetches GET /auth/invite/:token to show shop name + role.
//      Pressing "Send OTP" calls POST /auth/invite/start.
//   2) Verify — invitee types the OTP and (optionally) a display name. We POST
//      to /auth/invite/verify which sets the session cookie and we hand off to
//      AuthContext.signIn() so the rest of the app takes over.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth, type Session } from '../auth/AuthContext';

interface Preview {
  tenant: { id: string; name: string; slug: string };
  mobile: string;
  role: 'MANAGER' | 'STAFF';
  displayName: string | null;
  expiresAt: string;
}

interface OtpIssued {
  mobile: string;
  requestId: string;
  expiresAt: string;
  devCode?: string;
}

interface AcceptResult {
  expiresAt: string;
  tenant: { id: string; name: string; slug: string };
  user: { id: string; mobile: string; displayName: string | null };
  role: 'MANAGER' | 'STAFF';
}

export function InvitePage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [issued, setIssued] = useState<OtpIssued | null>(null);
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await api<Preview>(`/auth/invite/${encodeURIComponent(token)}`);
      setPreview(p);
      setDisplayName(p.displayName ?? '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'This invite link is invalid.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void load();
  }, [token, load]);

  async function sendOtp() {
    setBusy(true);
    setError(null);
    try {
      const data = await api<OtpIssued>('/auth/invite/start', {
        method: 'POST',
        body: { token },
      });
      setIssued(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send OTP');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!issued) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<AcceptResult>('/auth/invite/verify', {
        method: 'POST',
        body: {
          token,
          requestId: issued.requestId,
          code,
          displayName: displayName.trim() || undefined,
        },
      });
      // Session cookie is set by the server; rehydrate our context.
      const session: Session = {
        token: '', // JWT lives in the cookie
        expiresAt: result.expiresAt,
        tenant: result.tenant,
        user: result.user,
        role: result.role,
      };
      signIn(session);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="card" style={{ maxWidth: 480, margin: '40px auto' }}>
        <h1 style={{ marginTop: 0 }}>Join the team</h1>

        {loading && <p className="muted">Loading invite…</p>}

        {!loading && error && !preview && (
          <>
            <p className="error">{error}</p>
            <button type="button" onClick={() => navigate('/auth')}>Go to sign in</button>
          </>
        )}

        {preview && (
          <>
            <p>
              You've been invited to join <strong>{preview.tenant.name}</strong> as a{' '}
              <strong>{preview.role}</strong>.
            </p>
            <p className="muted">
              We'll send a one-time code to <strong>{preview.mobile}</strong> to confirm it's you.
              This invite expires {new Date(preview.expiresAt).toLocaleString()}.
            </p>

            {!issued ? (
              <>
                <button type="button" onClick={sendOtp} disabled={busy}>
                  {busy ? 'Sending…' : 'Send OTP'}
                </button>
                {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
              </>
            ) : (
              <form onSubmit={verify}>
                {issued.devCode && (
                  <div className="devcode">
                    DEV OTP: <strong>{issued.devCode}</strong>
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
                <label>Your name (optional)</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How should teammates see you?"
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button disabled={busy}>{busy ? 'Verifying…' : 'Accept invite'}</button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIssued(null);
                      setCode('');
                    }}
                  >
                    Back
                  </button>
                </div>
                {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
