import { Router } from 'express';
import type { ReadinessChecker } from '../infrastructure/readiness';

interface ReadinessResponse {
  readonly status: 'ready' | 'not_ready';
  readonly dependencies: Awaited<ReturnType<ReadinessChecker>>;
}

function isReady(dependencies: ReadinessResponse['dependencies']) {
  return Object.values(dependencies).every((status) => status === 'ok');
}

export function createReadinessRouter(checker: ReadinessChecker): Router {
  const router = Router();

  router.get('/ready', async (_request, response, next) => {
    try {
      const dependencies = await checker();
      const ready = isReady(dependencies);
      response.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not_ready',
        dependencies,
      } satisfies ReadinessResponse);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
