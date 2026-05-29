// Thin fetch wrapper that:
//  - prefixes the API base URL
//  - sends cookies on every request (the JWT lives in an httpOnly cookie set
//    by the backend on login/signup — JS never sees it)
//  - injects the X-Tenant-Id header (REQUIRED by the backend for tenant-scoped
//    routes; it also acts as a CSRF defense since custom headers force a CORS
//    preflight that the attacker origin can't satisfy)
//  - unwraps { data } / { error }

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  /** @deprecated Auth now uses an httpOnly cookie. Kept for call-site compat; ignored. */
  token?: string | null;
  tenantId?: string | null;
}

function buildUrl(path: string, query?: RequestOpts['query']): string {
  if (!query) return `${BASE}${path}`;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${BASE}${path}?${qs}` : `${BASE}${path}`;
}

function handle401(path: string, status: number) {
  // Tell the AuthContext to drop session state. Skip on /auth/* so a failed
  // login attempt doesn't fire a spurious "logged out" event.
  if (status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new CustomEvent('terp:auth-invalidated'));
  }
}

export async function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.tenantId) headers['X-Tenant-Id'] = opts.tenantId;

  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const err = json.error ?? { code: 'UNKNOWN', message: res.statusText };
    handle401(path, res.status);
    throw new ApiError(res.status, err.code, err.message, err.details);
  }
  return json.data as T;
}

// Multipart upload variant. Used for image uploads etc.
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  opts: Omit<RequestOpts, 'body' | 'method'> = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.tenantId) headers['X-Tenant-Id'] = opts.tenantId;

  const res = await fetch(buildUrl(path, opts.query), {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const err = json.error ?? { code: 'UNKNOWN', message: res.statusText };
    handle401(path, res.status);
    throw new ApiError(res.status, err.code, err.message, err.details);
  }
  return json.data as T;
}

// Helper for <img src=...> — uploads come from the backend origin.
// In dev we go through Vite's /uploads proxy; in prod set VITE_API_BASE_URL accordingly.
export function assetUrl(publicPath: string | null | undefined): string | undefined {
  if (!publicPath) return undefined;
  if (publicPath.startsWith('http://') || publicPath.startsWith('https://')) return publicPath;
  // /uploads/... is proxied to :4000 by vite dev server.
  return publicPath;
}
