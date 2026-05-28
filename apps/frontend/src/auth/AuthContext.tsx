import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';

export interface Session {
  token: string;
  expiresAt: string; // ISO; server-issued, also enforced locally
  tenant: { id: string; name: string; slug: string };
  user: { id: string; mobile: string; displayName: string | null };
}

interface AuthCtx {
  session: Session | null;
  signIn: (s: Session) => void;
  signOut: () => void | Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const STORAGE_KEY = 'terp.session.v1';

function readStoredSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    // Local expiry check — clears expired sessions on app boot without hitting the server.
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readStoredSession());

  useEffect(() => {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  }, [session]);

  // Auto-clear when the local clock crosses expiresAt (handles a tab left open for days).
  useEffect(() => {
    if (!session) return;
    const ms = new Date(session.expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      setSession(null);
      return;
    }
    const t = window.setTimeout(() => setSession(null), Math.min(ms, 2_147_483_000));
    return () => window.clearTimeout(t);
  }, [session]);

  // Cross-tab sync: if another tab signs out, this tab follows.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setSession(e.newValue ? (JSON.parse(e.newValue) as Session) : null);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Global "auth invalidated" event raised by the API client on 401.
  useEffect(() => {
    const onInvalidated = () => setSession(null);
    window.addEventListener('terp:auth-invalidated', onInvalidated);
    return () => window.removeEventListener('terp:auth-invalidated', onInvalidated);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      signIn: (s) => setSession(s),
      signOut: async () => {
        // Best-effort server revocation; always clear locally regardless.
        if (session) {
          try {
            await api('/auth/logout', { method: 'POST', token: session.token });
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
          }
        }
        setSession(null);
      },
    }),
    [session],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
