import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  requestJson,
  getAccessToken,
  storeAccessToken,
  clearAccessToken,
  ApiError,
} from './api';

describe('Authentication Refresh & Session Recovery', () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const mockLocalStorage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    };

    // Mock window and localStorage
    (globalThis as unknown as { window: { localStorage: typeof mockLocalStorage } }).window = {
      localStorage: mockLocalStorage,
    };

    clearAccessToken();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete (globalThis as unknown as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it('transparently recovers from an expired access token by refreshing and replaying the request', async () => {
    storeAccessToken('old-expired-token');

    // 1st call: /courses returns 401 (token expired)
    // 2nd call: /auth/refresh returns 200 with new token
    // 3rd call: /courses retried with new token returns 200
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Token expired' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'new-refreshed-token',
          user: { id: 'u1', email: 'test@example.com', roles: ['STUDENT'] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [{ id: 'course-1', title: 'Fullstack TS' }] }),
      });

    const result = await requestJson<{ items: { id: string; title: string }[] }>('/courses');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('course-1');
    expect(getAccessToken()).toBe('new-refreshed-token');

    // Check request order and headers
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // 1st: initial request with old token
    expect(mockFetch.mock.calls[0]?.[1]?.headers?.get('Authorization')).toBe('Bearer old-expired-token');

    // 2nd: refresh call
    expect(mockFetch.mock.calls[1]?.[0]).toContain('/auth/refresh');

    // 3rd: retried request with new token
    expect(mockFetch.mock.calls[2]?.[1]?.headers?.get('Authorization')).toBe('Bearer new-refreshed-token');
  });

  it('deduplicates concurrent 401 requests into exactly ONE refresh request', async () => {
    storeAccessToken('expired-token');

    let refreshCallCount = 0;

    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCallCount++;
        // Simulate small network delay
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            accessToken: 'shared-refreshed-token',
            user: { id: 'u1', email: 'user@test.com', roles: ['STUDENT'] },
          }),
        };
      }

      const isFirstAttempt = !mockFetch.mock.calls.some(
        (call) => call[0] === url && call[1]?.headers?.get('Authorization') === 'Bearer shared-refreshed-token',
      );

      if (isFirstAttempt) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Expired' } }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ data: `success for ${url}` }),
      };
    });

    // Launch 10 simultaneous requests
    const promises = Array.from({ length: 10 }, (_, i) =>
      requestJson<{ data: string }>(`/resource-${i}`),
    );

    const results = await Promise.all(promises);

    expect(results).toHaveLength(10);
    results.forEach((res, i) => {
      expect(res.data).toBe(`success for http://localhost:4000/api/v1/resource-${i}`);
    });

    // Exactly 1 refresh network call was executed!
    expect(refreshCallCount).toBe(1);
    expect(getAccessToken()).toBe('shared-refreshed-token');
  });

  it('does NOT clear credentials or treat session as invalid when refresh returns 500 server error', async () => {
    storeAccessToken('current-token');

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Token expired' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database unreachable' } }),
      });

    await expect(requestJson('/users/me')).rejects.toThrow(ApiError);

    // Token must NOT be cleared on temporary 500 server errors
    expect(getAccessToken()).toBe('current-token');
  });

  it('does NOT clear credentials when a network failure occurs during refresh', async () => {
    storeAccessToken('current-token');

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Token expired' } }),
      })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(requestJson('/users/me')).rejects.toThrow('Failed to fetch');

    // Token must NOT be cleared on offline/network errors
    expect(getAccessToken()).toBe('current-token');
  });

  it('clears access token and fails when refresh session is genuinely expired or revoked (401)', async () => {
    storeAccessToken('old-token');

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Token expired' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'AUTH_INVALID_REFRESH_TOKEN', message: 'Invalid refresh token' } }),
      });

    await expect(requestJson('/users/me')).rejects.toThrow('Invalid refresh token');

    // Token must be cleared on genuine 401 refresh failure
    expect(getAccessToken()).toBeUndefined();
  });

  it('supports cold-start / page reload when starting without access token in localStorage', async () => {
    // No token in localStorage at start
    expect(getAccessToken()).toBeUndefined();

    // 1st: /users/me fails with 401 (no auth header)
    // 2nd: /auth/refresh succeeds using HTTP-only cookie
    // 3rd: /users/me retried with new token and succeeds
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'AUTH_REQUIRED', message: 'Authentication is required' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'cold-start-access-token',
          user: { id: 'u1', email: 'cold@start.com', roles: ['STUDENT'] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'u1', email: 'cold@start.com', roles: ['STUDENT'] } }),
      });

    const result = await requestJson<{ user: { id: string; email: string } }>('/users/me');

    expect(result.user.email).toBe('cold@start.com');
    expect(getAccessToken()).toBe('cold-start-access-token');
  });

  it('prevents infinite retry loops if the retried request also returns 401', async () => {
    storeAccessToken('initial-token');

    // 1st: 401
    // 2nd: /auth/refresh returns new token
    // 3rd: Retried request STILL returns 401
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'AUTH_INVALID_TOKEN', message: 'First 401' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'second-token',
          user: { id: 'u1', email: 'test@example.com', roles: ['STUDENT'] },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Persistent 401' } }),
      });

    await expect(requestJson('/protected-resource')).rejects.toThrow('Persistent 401');

    // Must NOT make a 4th call (no infinite loop)
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
