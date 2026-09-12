import type { Request, Response } from 'express';
import type { Env } from '../../config';
import {
  clearRefreshTokenCookie,
  readCookie,
  REFRESH_TOKEN_COOKIE_NAME,
  setRefreshTokenCookie,
} from '../../shared/cookies';
import { HttpError } from '../../shared/http-error';
import { loginSchema, registerSchema, sessionIdParamSchema } from './auth.schemas';
import { AuthService } from './auth.service';
import type { AuthSessionMetadata } from './auth.types';

function readSessionMetadata(request: Request): AuthSessionMetadata {
  const userAgent = request.header('user-agent');

  return {
    ...(userAgent ? { userAgent } : {}),
    ...(request.ip ? { ipAddress: request.ip } : {}),
  };
}

export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly env: Env,
  ) {}

  register = async (request: Request, response: Response) => {
    const body = registerSchema.parse(request.body);
    const result = await this.auth.register(body, readSessionMetadata(request));
    setRefreshTokenCookie(response, result.refreshToken, this.env);

    response.status(201).json({
      accessToken: result.accessToken,
      user: result.user,
    });
  };

  login = async (request: Request, response: Response) => {
    const body = loginSchema.parse(request.body);
    const result = await this.auth.login(body, readSessionMetadata(request));
    setRefreshTokenCookie(response, result.refreshToken, this.env);

    response.status(200).json({
      accessToken: result.accessToken,
      user: result.user,
    });
  };

  refresh = async (request: Request, response: Response) => {
    const refreshToken = readCookie(request, REFRESH_TOKEN_COOKIE_NAME);

    if (!refreshToken) {
      throw new HttpError(401, 'AUTH_INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    }

    const result = await this.auth.refresh(refreshToken);
    setRefreshTokenCookie(response, result.refreshToken, this.env);

    response.status(200).json({
      accessToken: result.accessToken,
      user: result.user,
    });
  };

  logout = async (request: Request, response: Response) => {
    if (!request.auth) {
      throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
    }

    await this.auth.logout(request.auth.userId, request.auth.sessionId);
    clearRefreshTokenCookie(response, this.env);
    response.status(204).send();
  };

  logoutAll = async (request: Request, response: Response) => {
    if (!request.auth) {
      throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
    }

    await this.auth.logoutAll(request.auth.userId);
    clearRefreshTokenCookie(response, this.env);
    response.status(204).send();
  };

  listSessions = async (request: Request, response: Response) => {
    if (!request.auth) {
      throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
    }

    const sessions = await this.auth.listSessions(request.auth.userId, request.auth.sessionId);
    response.status(200).json({ sessions });
  };

  revokeSession = async (request: Request, response: Response) => {
    if (!request.auth) {
      throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
    }

    const params = sessionIdParamSchema.parse(request.params);
    await this.auth.revokeSession(request.auth.userId, params.sessionId);
    response.status(204).send();
  };
}
