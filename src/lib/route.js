/**
 * The plugin-owned Host HTTP route behind the browser's "Copy as Markdown".
 *
 * The route is read-only: it reads one session, converts it to Markdown and
 * hands it back to the same-origin browser that asked for it. Nothing is
 * persisted and nothing leaves the machine.
 *
 * Which read is used matters. `sessionQuery.readSession` replays and validates
 * the *complete raw* log, including events the Host has since shadowed via
 * `compaction/prune` and bypassing anything the model no longer sees.
 * `sessionQuery.readSurface` returns the current model surface — the same event
 * set the model itself reasons over — so a compacted session exports what the
 * model actually still holds. `readSurface` is preferred and `readSession` is
 * the fallback for releases (or readings) where the surface cannot be folded.
 *
 * Every failure path answers with a status and a short body; the handler never
 * throws, so a missing or renamed Host service can only cost the Markdown menu
 * item, never the application.
 */

import { clampMarkdown, extractConversation, renderConversation } from './markdown.js';

export const SESSION_COPY_PATH = '/api/session-copy.snapshot';
export const MAX_REQUEST_BYTES = 4096;

/**
 * Upper bound on the Markdown handed to the browser. A real session produced
 * 434 KB, which is past what a single clipboard write reliably accepts and is
 * not useful to paste; the document is trimmed on a section boundary instead.
 */
export const MAX_MARKDOWN_CHARACTERS = 220_000;

class RequestBoundaryError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'RequestBoundaryError';
    this.status = status;
  }
}

function header(headers, name) {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : typeof value === 'string' ? value : undefined;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`);
  } catch {
    return undefined;
  }
}

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const parts = hostname.split('.');
  return parts.length === 4
    && parts[0] === '127'
    && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isTrustedAuthority(hostUrl, trustedHosts) {
  return trustedHosts.some((entry) => {
    if (typeof entry !== 'string') return false;
    const entryUrl = parseAuthority(entry);
    if (entryUrl === undefined) return false;
    return entryUrl.port === '' || entryUrl.port === hostUrl.port
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host;
  });
}

/**
 * Mirror DSH Web's own `/api` Host/Origin trust fence for this plugin route.
 * @param {import('node:http').IncomingMessage} request
 * @param {readonly string[]} trustedHosts
 * @returns {boolean}
 */
export function isTrustedRequest(request, trustedHosts) {
  const host = header(request.headers, 'host');
  if (host === undefined) return false;
  const hostUrl = parseAuthority(host);
  if (hostUrl === undefined) return false;
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false;
  const origin = header(request.headers, 'origin');
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      throw new RequestBoundaryError(413, 'request body is too large');
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestBoundaryError(400, 'request body must be valid JSON');
  }
}

function writeText(response, status, text) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(text);
}

function writeJson(response, status, value) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

/** Read the session header out of whichever shape the Host returned. */
function headerOf(snapshot) {
  if (!isRecord(snapshot)) return undefined;
  if (isRecord(snapshot.session)) return snapshot.session;
  if (isRecord(snapshot.header)) return snapshot.header;
  return undefined;
}

function eventsOf(snapshot) {
  if (!isRecord(snapshot)) return [];
  if (Array.isArray(snapshot.events)) return snapshot.events;
  return [];
}

function cwdOf(snapshot) {
  const sessionHeader = headerOf(snapshot);
  if (sessionHeader === undefined) return null;
  return typeof sessionHeader.cwd === 'string' && sessionHeader.cwd !== '' ? sessionHeader.cwd : null;
}

/**
 * Build the Node HTTP handler registered with DSH's `webServer`.
 *
 * @param {{
 *   readSession: (sessionId: string) => Promise<unknown>,
 *   readSurface?: (sessionId: string) => Promise<unknown>,
 *   trustedHosts?: () => readonly string[],
 *   onError?: (error: unknown) => void,
 *   maxCharacters?: number,
 * }} options
 * @returns {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => Promise<void>}
 */
export function createSessionSnapshotHandler({
  readSession,
  readSurface,
  trustedHosts = () => [],
  onError = () => {},
  maxCharacters = MAX_MARKDOWN_CHARACTERS,
}) {
  /**
   * Prefer the current model surface; fall back to the raw log if the surface
   * cannot be folded (older release, or a log the strict surface validator
   * rejects). The fallback is what makes this resilient across DSH versions.
   */
  const read = async (sessionId) => {
    if (typeof readSurface === 'function') {
      try {
        return { snapshot: await readSurface(sessionId), source: 'surface' };
      } catch (error) {
        try {
          onError(error);
        } catch {
          /* logging must not mask the fallback */
        }
      }
    }
    return { snapshot: await readSession(sessionId), source: 'log' };
  };

  return async (request, response) => {
    try {
      if (request.method !== 'POST') {
        writeText(response, 405, 'method not allowed');
        return;
      }
      let hosts = [];
      try {
        const resolved = trustedHosts();
        if (Array.isArray(resolved)) hosts = resolved.filter((entry) => typeof entry === 'string');
      } catch {
        hosts = [];
      }
      if (!isTrustedRequest(request, hosts)) {
        writeText(response, 403, 'forbidden');
        return;
      }
      const mediaType = header(request.headers, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase();
      if (mediaType !== 'application/json') {
        writeText(response, 415, 'content type must be application/json');
        return;
      }

      const value = await readJsonBody(request);
      const sessionId = isRecord(value) ? value.sessionId : undefined;
      if (typeof sessionId !== 'string' || sessionId === '') {
        throw new RequestBoundaryError(400, 'sessionId is required');
      }

      const { snapshot, source } = await read(sessionId);
      const events = eventsOf(snapshot);
      const { title, items, stats } = extractConversation(events);
      const cwd = cwdOf(snapshot);
      const resolvedTitle = title
        ?? (typeof headerOf(snapshot)?.title === 'string' && headerOf(snapshot).title !== ''
          ? headerOf(snapshot).title
          : null);
      const full = renderConversation(items, { title: resolvedTitle, sessionId, cwd });
      const clamped = clampMarkdown(full, maxCharacters);

      writeJson(response, 200, {
        ok: true,
        sessionId,
        title: resolvedTitle,
        cwd,
        markdown: clamped.markdown,
        characters: clamped.markdown.length,
        truncated: clamped.truncated,
        source,
        messages: items.length,
        stats,
      });
    } catch (error) {
      if (error instanceof RequestBoundaryError) {
        writeText(response, error.status, error.message);
        return;
      }
      try {
        onError(error);
      } catch {
        /* logging must not mask the response */
      }
      writeText(response, 500, 'session snapshot failed');
    }
  };
}
