import type { Request, Response } from 'express';
import type { Env } from '../config';

export const REFRESH_TOKEN_COOKIE_NAME = 'codesync_refresh_token';
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';

export function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.header('cookie');

  if (!cookieHeader) {
    return undefined;
  }

  const cookies = cookieHeader.split(';');

  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split('=');

    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }

  return undefined;
}

export function setRefreshTokenCookie(response: Response, refreshToken: string, env: Env) {
  response.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: env.JWT_REFRESH_TTL_SECONDS * 1000,
  });
}

export function clearRefreshTokenCookie(response: Response, env: Env) {
  response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    path: REFRESH_TOKEN_COOKIE_PATH,
  });
}
