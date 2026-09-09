/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, RequestHandler } from 'express';

function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * Returns an Express Router whose get/post/put/delete automatically catch
 * rejected Promises from async handlers and forward them to Express's error
 * middleware (server.ts), instead of leaving the request hanging or
 * crashing the process - the built-in behavior in Express 4.
 */
export function createRouter(): Router {
  const router = Router();
  (['get', 'post', 'put', 'delete', 'patch'] as const).forEach(method => {
    const original = router[method].bind(router);
    (router as any)[method] = (path: string, ...handlers: RequestHandler[]) =>
      original(path, ...handlers.map(wrap));
  });
  return router;
}
