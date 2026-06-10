// Sentry wiring for the SPA.
//
// Init is no-op when VITE_SENTRY_DSN is unset, so local dev and self-hosters
// without Sentry pay zero cost.
//
// `setSentrySession(session)` is called from AuthContext whenever the
// in-memory session changes so every event captures who/which-tenant.

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENABLED = Boolean(DSN);

export function isSentryEnabled(): boolean {
  return ENABLED;
}

export function initSentry(): void {
  if (!ENABLED) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    // Conservative defaults: errors only. Opt in to traces / replay via env.
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? '0'),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}

interface SessionLike {
  user: { id: string };
  tenant: { id: string };
  role: string;
}

/**
 * Tag the current Sentry scope with the signed-in actor. Pass `null` on
 * sign-out to clear. No-op when Sentry is disabled.
 */
export function setSentrySession(session: SessionLike | null): void {
  if (!ENABLED) return;
  const scope = Sentry.getCurrentScope();
  if (session) {
    scope.setUser({ id: session.user.id });
    scope.setTag('tenantId', session.tenant.id);
    scope.setTag('role', session.role);
  } else {
    scope.setUser(null);
    scope.setTag('tenantId', undefined as unknown as string);
    scope.setTag('role', undefined as unknown as string);
  }
}
