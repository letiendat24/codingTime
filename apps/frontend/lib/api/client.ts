export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function getAccessToken() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.localStorage.getItem('codesync_access_token') ?? undefined;
}

export function storeAccessToken(accessToken: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem('codesync_access_token', accessToken);
}

export function clearAccessToken() {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem('codesync_access_token');
}

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const accessToken = getAccessToken();

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { readonly error?: { readonly message?: string } }
      | undefined;
    throw new Error(body?.error?.message ?? 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
