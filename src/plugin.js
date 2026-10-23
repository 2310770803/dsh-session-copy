/**
 * Native DSH Host half: one read-only route that returns a session snapshot as
 * Markdown for the browser's "Copy as Markdown" action.
 *
 * Defensive by construction:
 *  - no `inject` list, so a renamed/removed Host service can never stop this
 *    plugin from activating;
 *  - `webServer` is awaited through `ctx.inject`, not assumed at load time;
 *  - `sessionQuery` is resolved lazily on every request, so a version bump that
 *    moves the service only degrades the Markdown action;
 *  - every step is wrapped, so a throw here is logged and swallowed instead of
 *    reaching the loader's activation audit.
 */

import { SESSION_COPY_PATH, createSessionSnapshotHandler } from './lib/route.js';

export const name = 'session-copy';

/** Nothing is required at activation time; every service is resolved lazily. */
export const inject = [];

function report(ctx, level, error) {
  try {
    const logger = ctx?.logger;
    const write = logger?.[level];
    if (typeof write === 'function') {
      write.call(logger, error instanceof Error ? error : new Error(String(error)));
      return;
    }
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : 'warn']('[dsh-session-copy]', error);
  } catch {
    /* diagnostics must never escalate */
  }
}

function serviceOf(scope, ctx, serviceName) {
  try {
    const fromScope = scope?.get?.(serviceName);
    if (fromScope !== undefined && fromScope !== null) return fromScope;
  } catch {
    /* fall through to the root context */
  }
  try {
    const fromRoot = ctx?.get?.(serviceName);
    if (fromRoot !== undefined && fromRoot !== null) return fromRoot;
  } catch {
    /* treat as unavailable */
  }
  return undefined;
}

/**
 * Register the snapshot route once the Host's `webServer` is available.
 * @param {object} ctx DSH Cordis context.
 */
export function apply(ctx) {
  try {
    ctx.inject(['webServer'], (scope) => {
      try {
        const handler = createSessionSnapshotHandler({
          readSession: (sessionId) => {
            const query = serviceOf(scope, ctx, 'sessionQuery');
            if (query === undefined || typeof query.readSession !== 'function') {
              const error = new Error(
                'dsh-session-copy: the sessionQuery service is unavailable in this DSH version',
              );
              error.status = 503;
              throw error;
            }
            return query.readSession(sessionId);
          },
          trustedHosts: () => {
            const runtime = serviceOf(scope, ctx, 'webRuntime');
            const hosts = runtime?.trustedHosts;
            return Array.isArray(hosts) ? hosts : [];
          },
          onError: (error) => report(ctx, 'warn', error),
        });

        scope.effect(
          () => scope.webServer.register({ kind: 'exact', path: SESSION_COPY_PATH, handler }),
          'session-copy: session snapshot route',
        );
      } catch (error) {
        report(ctx, 'error', error);
      }
    });
  } catch (error) {
    report(ctx, 'error', error);
  }
}
