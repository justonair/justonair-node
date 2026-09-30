import { APIConnectionError, APIError, APITimeoutError, JustOnAirError } from './errors.js';
import { VERSION } from './version.js';

export const DEFAULT_BASE_URL = 'https://api.justonair.com';
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 2;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** Defaults to `process.env.JOA_API_KEY`. Starts with `joa_live_`. Not needed for `embed` and `webhooks.verify`. */
  apiKey?: string | undefined;
  /** Defaults to `process.env.JOA_BASE_URL`, then https://api.justonair.com. */
  baseUrl?: string | undefined;
  /** Secret for `webhooks.verify` (`whsec_…`). Defaults to `process.env.JOA_WEBHOOK_SECRET`. */
  webhookSecret?: string | undefined;
  /** Per attempt. Default 30 s. */
  timeoutMs?: number;
  /** Retries after a network error, a 5xx or `rate_limited`. Default 2. Never retries account limits. */
  maxRetries?: number;
  /** Custom fetch (tests, proxies). Defaults to the global fetch. */
  fetch?: FetchLike;
  /** Headers added to every request. */
  defaultHeaders?: Record<string, string>;
  /**
   * An API key in a browser is readable by anyone who opens the page and can
   * spend your credit. The SDK refuses to run with a key in a browser unless
   * this is true. Keep keys on your server.
   */
  dangerouslyAllowBrowser?: boolean;
}

export interface RequestOptions {
  /** Sent as `Idempotency-Key`. `streams.create` makes one for you if you don't. */
  idempotencyKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type QueryValue = string | number | boolean | null | undefined;

export interface RequestSpec {
  method: Method;
  path: string;
  query?: Record<string, QueryValue> | undefined;
  body?: unknown;
  /** Public endpoints (embed) send no key. */
  auth?: boolean;
  /** POSTs that do no harm when repeated (signing a URL). */
  retrySafe?: boolean;
}

const env = (name: string): string | undefined => {
  const v = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  return v && v.trim() ? v.trim() : undefined;
};

const isBrowser = () =>
  typeof window !== 'undefined' && typeof (window as { document?: unknown }).document !== 'undefined';

export class Core {
  readonly baseUrl: string;
  readonly webhookSecret: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: FetchLike;
  private readonly defaultHeaders: Record<string, string>;

  constructor(opts: ClientOptions = {}) {
    this.apiKey = opts.apiKey ?? env('JOA_API_KEY');
    this.baseUrl = (opts.baseUrl ?? env('JOA_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.webhookSecret = opts.webhookSecret ?? env('JOA_WEBHOOK_SECRET');
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.defaultHeaders = opts.defaultHeaders ?? {};
    const f = opts.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
    if (!f) throw new JustOnAirError('No fetch available. Use Node 20 or newer, or pass `fetch` in the options.');
    this.fetchImpl = f;
    if (this.apiKey && isBrowser() && !opts.dangerouslyAllowBrowser) {
      throw new JustOnAirError(
        'An API key in a browser can be read by anyone and spends your credit. Call JustOnAir from your server, ' +
          'or set dangerouslyAllowBrowser: true if you understand the risk.',
      );
    }
  }

  async request<T>(spec: RequestSpec, opts: RequestOptions = {}): Promise<T> {
    const auth = spec.auth ?? true;
    if (auth && !this.apiKey) {
      throw new JustOnAirError('No API key. Pass { apiKey } or set JOA_API_KEY. Create keys at https://app.justonair.com.');
    }
    const url = this.url(spec.path, spec.query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': `justonair-node/${VERSION}`,
      ...this.defaultHeaders,
      ...opts.headers,
    };
    if (auth) headers.Authorization = `Bearer ${this.apiKey}`;
    if (spec.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.idempotencyKey !== undefined) headers['Idempotency-Key'] = opts.idempotencyKey;
    const body = spec.body !== undefined ? JSON.stringify(spec.body) : undefined;

    // Repeating a GET, PATCH or DELETE changes nothing; a POST only when an
    // Idempotency-Key makes the API return the first answer again.
    const safe = spec.method !== 'POST' || spec.retrySafe === true || opts.idempotencyKey !== undefined;
    const maxRetries = safe ? (opts.maxRetries ?? this.maxRetries) : 0;
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchOnce(url, { method: spec.method, headers, body }, timeoutMs, opts.signal);
      } catch (err) {
        if (opts.signal?.aborted) throw err;
        if (attempt < maxRetries) {
          await sleep(backoffMs(attempt, null));
          continue;
        }
        throw err;
      }
      if (res.ok) return (await parseBody(res)) as T;

      const parsed = await parseBody(res).catch(() => null);
      const error = APIError.from(res.status, parsed, res.headers);
      if (attempt < maxRetries && retryable(error)) {
        await sleep(backoffMs(attempt, res.headers.get('retry-after')));
        continue;
      }
      throw error;
    }
  }

  private url(path: string, query?: Record<string, QueryValue>): string {
    const u = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    }
    return u.toString();
  }

  private async fetchOnce(url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(new APITimeoutError(`No answer from JustOnAir within ${timeoutMs} ms`)), timeoutMs);
    const onAbort = () => ctl.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await this.fetchImpl(url, { ...init, signal: ctl.signal });
    } catch (err) {
      if (signal?.aborted) throw signal.reason ?? err;
      if (ctl.signal.reason instanceof APITimeoutError) throw ctl.signal.reason;
      throw new APIConnectionError(`Could not reach JustOnAir: ${(err as Error)?.message ?? String(err)}`, { cause: err });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

/** 5xx (including `no_capacity`) and the embed endpoint's `rate_limited`. Account limits (`limit_*`) never clear by retrying. */
function retryable(e: APIError): boolean {
  if (e.status >= 500) return true;
  if (e.status === 408) return true;
  return e.status === 429 && e.code === 'rate_limited';
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  const s = retryAfter !== null ? Number(retryAfter) : NaN;
  if (Number.isFinite(s) && s >= 0) return Math.min(s, 60) * 1000;
  const base = Math.min(8_000, 500 * 2 ** attempt);
  return Math.round(base * (0.75 + Math.random() * 0.25));
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Path segment for an id the caller passed in. */
export const seg = (id: string): string => {
  if (typeof id !== 'string' || id.length === 0) throw new JustOnAirError('An id is required.');
  return encodeURIComponent(id);
};
