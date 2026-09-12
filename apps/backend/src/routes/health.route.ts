import { Router } from 'express';

interface HealthResponse {
  readonly status: 'ok';
}

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/health', (_request, response) => {
    const body: HealthResponse = { status: 'ok' };
    response.status(200).json(body);
  });

  return router;
}
