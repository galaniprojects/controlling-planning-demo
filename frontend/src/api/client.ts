import { BRANDING } from '@/config/branding';

const STORAGE_KEY = `${BRANDING.localStoragePrefix}-persona`;
let currentUserId = localStorage.getItem(STORAGE_KEY) || 'persona-controller';

/**
 * Thrown for any non-2xx response. Subclasses Error so existing
 * `catch (e) { setError(e.message) }` consumers keep working; callers
 * that need to discriminate by status (e.g. `navigateToWorkbenchByProject`
 * distinguishing 404 from transient failures) can `instanceof` check.
 */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function setCurrentUser(userId: string) {
  currentUserId = userId;
  localStorage.setItem(STORAGE_KEY, userId);
}

export function getCurrentUserId(): string {
  return currentUserId;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('X-Current-User', currentUserId);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    const detail = error.detail;
    // Structured errors (charging 409 cycle/depth, admin 409 max-depth)
    // ship `detail` as a dict {message, cycle_chain?, violating_path?,
    // violations?}. Stringify so downstream consumers like
    // EntityDistributionEditor that do `JSON.parse(err.message)` continue
    // to recover the structured fields. Simple errors (detail is a
    // string) round-trip unchanged.
    const msg =
      typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object'
          ? JSON.stringify(detail)
          : `HTTP ${response.status}`;
    throw new ApiError(msg, response.status);
  }

  return response.json();
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
};
