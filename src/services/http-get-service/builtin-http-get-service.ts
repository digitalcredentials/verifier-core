import type { HttpGetResult } from '../../types/http.js';
import type { HttpGetService } from './http-get-service.js';
import { checkUrl } from './url-policy.js';

/** Options for {@link BuiltinHttpGetService}. */
export interface BuiltinHttpGetServiceOptions {
  /** Deadline for the whole request, redirects and body included. Default 10 000. */
  timeoutMs?: number;
  /** Largest body accepted, in bytes. Default 5 MB (5 * 1024 * 1024). */
  maxBytes?: number;
}

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * `fetch`-based {@link HttpGetService} that is safe to point at URLs a
 * credential chooses.
 *
 * - Only `https:`, and never `localhost` or a loopback, private, link-local
 *   or unspecified IP literal. Every redirect hop is checked before it is
 *   requested, and at most five are followed.
 * - One deadline (`timeoutMs`) covers the whole request, body included, and
 *   the body is capped at `maxBytes`.
 * - The body is read once and parsed as JSON whatever the content type; if
 *   it is not JSON, the text is returned.
 * - Errors carry fixed text naming the URL and the reason — never response
 *   bytes, parser output or the underlying network error, which callers put
 *   into problem details. The original error is kept as `cause`.
 *
 * There is no override. For local testing use a tunnel or a DNS name with a
 * valid certificate, or inject your own {@link HttpGetService}, which then
 * gets none of this. Hosts are judged as names or literals only: there is no
 * portable DNS lookup, so a public name resolving to a private address is
 * not caught.
 */
export function BuiltinHttpGetService(
  options: BuiltinHttpGetServiceOptions = {}
): HttpGetService {
  const timeoutMs = positiveOption(
    'timeoutMs',
    options.timeoutMs,
    DEFAULT_TIMEOUT_MS
  );
  const maxBytes = positiveOption(
    'maxBytes',
    options.maxBytes,
    DEFAULT_MAX_BYTES
  );

  return {
    async get(url: string): Promise<HttpGetResult> {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      // The race keeps the deadline even on a runtime where aborting does
      // not interrupt a body read already in progress.
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new Error(`Request to ${url} timed out after ${timeoutMs} ms`)
          );
        }, timeoutMs);
      });
      try {
        return await Promise.race([
          fetchWithinPolicy(url, controller.signal, maxBytes),
          deadline
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

export type BuiltinHttpGetServiceType = ReturnType<
  typeof BuiltinHttpGetService
>;

function positiveOption(
  name: string,
  value: number | undefined,
  fallback: number
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number`);
  }
  return value;
}

async function fetchWithinPolicy(
  url: string,
  signal: AbortSignal,
  maxBytes: number
): Promise<HttpGetResult> {
  let current = url;
  let response: Response;
  for (let redirects = 0; ; redirects++) {
    assertAllowed(current);
    response = await fetchOrFail(current, { redirect: 'manual', signal });

    // Browsers hide a manual redirect behind an opaque response with no
    // Location, so it cannot be followed hop by hop. Let the browser follow
    // it, and judge the final URL below.
    if (response.type === 'opaqueredirect') {
      response = await fetchOrFail(current, { redirect: 'follow', signal });
      break;
    }

    const location = response.headers.get('location');
    if (!REDIRECT_STATUSES.has(response.status) || location === null) {
      break;
    }
    await discard(response);
    if (redirects === MAX_REDIRECTS) {
      throw new Error(`Request to ${url} refused: too many redirects`);
    }
    try {
      current = new URL(location, current).href;
    } catch {
      throw new Error(`Request to ${current} refused: not a valid URL`);
    }
  }

  // React Native ignores `redirect: 'manual'` and follows on its own, as
  // does the browser fallback above, so the URL actually reached is judged
  // too. Its response is never read.
  if (response.url) {
    const check = checkUrl(response.url);
    if (!check.allowed) {
      await discard(response);
      throw new Error(`Request to ${response.url} refused: ${check.reason}`);
    }
  }

  const text = await readCapped(response, current, maxBytes);
  return {
    body: parseOnce(text),
    headers: response.headers,
    status: response.status
  };
}

function assertAllowed(url: string): void {
  const check = checkUrl(url);
  if (!check.allowed) {
    throw new Error(`Request to ${url} refused: ${check.reason}`);
  }
}

async function fetchOrFail(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    // The network error's own text (ECONNREFUSED and the like) would let a
    // caller probe which hosts and ports answer, so it stays on `cause`.
    throw new Error(`Request to ${url} failed`, { cause });
  }
}

/**
 * Read the body as text, refusing more than `maxBytes`. Streams where the
 * runtime offers `response.body` (Node, browsers), and checks the size after
 * the fact where it does not (React Native).
 */
async function readCapped(
  response: Response,
  url: string,
  maxBytes: number
): Promise<string> {
  const tooLarge = () =>
    new Error(`Request to ${url} exceeded ${maxBytes} bytes`);

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discard(response);
    throw tooLarge();
  }

  const reader = response.body?.getReader?.();
  if (reader === undefined) {
    const text = await response.text();
    if (byteLength(text) > maxBytes) {
      throw tooLarge();
    }
    return text;
  }

  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return text + decoder.decode();
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
}

function byteLength(text: string): number {
  return typeof TextEncoder === 'function'
    ? new TextEncoder().encode(text).byteLength
    : text.length;
}

/** Parsed JSON when the body is JSON, whatever the content type; else the text. */
function parseOnce(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}
