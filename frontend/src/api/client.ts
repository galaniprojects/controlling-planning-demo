import { BRANDING } from '@/config/branding';

const STORAGE_KEY = `${BRANDING.localStoragePrefix}-persona`;
let currentUserId = localStorage.getItem(STORAGE_KEY) || 'persona-controller';

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
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
};
