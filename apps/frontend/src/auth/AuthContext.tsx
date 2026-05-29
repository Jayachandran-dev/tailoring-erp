import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import { setSentrySession } from '../observability/sentry';

// The JWT lives in an httpOnly cookie set by the backend; the SPA never sees
// it. `token` is kept as an empty placeholder so existing call-sites that read
// `session.token` keep compiling — the api client ignores it.
export interface Session {
  token: string;
  expiresAt: string; // ISO; informational only — server is the source of truth
  tenant: { id: string; name: string; slug: string };
  user: { id: string; mobile: string; displayName: string | null };
  role: 'OWNER' | 'MANAGER' | 'STAFF';
}

interface AuthCtx {
  session: Session | null;
  ready: boolean; // false until the /auth/me bootstrap completes
  signIn: (s: Session) => void;
  signOut: () => void | Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

// Shape returned by GET /auth/me (token is in the cookie, not in the body).
type MeResponse = Omit<Session, 'token' | 'expiresAt'> & { expiresAt?: string };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  // Boot: ask the server who we are. If the cookie is missing/invalid we get
  // a 401 and stay logged out. Otherwise we hydrate the in-memory session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api<MeResponse>('/auth/me');
        if (cancelled) return;
        setSession({
          token: '',
          expiresAt: me.expiresAt ?? '',
          tenant: me.tenant,
          user: me.user,
          role: me.role,
        });
      } catch (err) {
        if (!(err instanceof ApiError)) console.error(err);
        // Any error (401, network, etc.) → treat as signed-out.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Global "auth invalidated" event raised by the API client on 401.
  useEffect(() => {
    const onInvalidated = () => setSession(null);
    window.addEventListener('terp:auth-invalidated', onInvalidated);
    return () => window.removeEventListener('terp:auth-invalidated', onInvalidated);
  }, []);

  // Keep Sentry's per-user scope in sync with the in-memory session so every
  // captured event is tagged with tenantId / userId / role.
  useEffect(() => {
    setSentrySession(session);
  }, [session]);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      ready,
      signIn: (s) => setSession(s),
      signOut: async () => {
        // Best-effort server revocation (also clears the cookie); always clear
        // local state regardless of network outcome.
        try {
          await api('/auth/logout', { method: 'POST' });
        } catch (err) {
          if (!(err instanceof ApiError)) throw err;
        }
        setSession(null);
      },
    }),
    [session, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
