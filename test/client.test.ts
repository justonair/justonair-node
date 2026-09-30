import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import JustOnAir, {
  APIConnectionError,
  APITimeoutError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InsufficientCreditError,
  InternalServerError,
  JustOnAirError,
  NotFoundError,
  RateLimitError,
  VERSION,
} from '../src/index.js';
import { apiError, json, mockFetch, stream } from './helpers.js';

const KEY = 'joa_live_test';

describe('streams.create', () => {
  it('sends the key, the body and an Idempotency-Key, and returns the stream', async () => {
    const created = { ...stream(), stream_key: 'str_e1bzk3dxw9z9allei6n7?key=s3cret', whip_url: 'https://x/whip?key=s3cret' };
    const { fetch, calls } = mockFetch(json(201, created));
    const joa = new JustOnAir({ apiKey: KEY, fetch });

    const s = await joa.streams.create({ name: 'Town hall', record: false, player: { max_height: 720 } });

    expect(s.stream_key).toBe('str_e1bzk3dxw9z9allei6n7?key=s3cret');
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.method).toBe('POST');
    expect(c.url.toString()).toBe('https://api.justonair.com/v1/streams');
    expect(c.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(c.headers['content-type']).toBe('application/json');
    expect(c.headers['user-agent']).toBe(`justonair-node/${VERSION}`);
    expect(c.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.body).toEqual({ name: 'Town hall', record: false, player: { max_height: 720 } });
  });

  it('retries a 503 no_capacity with the SAME Idempotency-Key', async () => {
    const { fetch, calls } = mockFetch(
      apiError(503, 'no_capacity', 'No ingest capacity', undefined, { 'retry-after': '0' }),
      json(201, stream()),
    );
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    await joa.streams.create({}, { idempotencyKey: 'mine-1' });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.headers['idempotency-key']).toBe('mine-1');
    expect(calls[1]!.headers['idempotency-key']).toBe('mine-1');
  });

  it('gives up after maxRetries and throws the last error', async () => {
    const r = () => apiError(503, 'no_capacity', 'No ingest capacity', undefined, { 'retry-after': '0' });
    const { fetch, calls } = mockFetch(r(), r(), r());
    const joa = new JustOnAir({ apiKey: KEY, fetch, maxRetries: 2 });
    const err = await joa.streams.create().catch((e) => e);
    expect(err).toBeInstanceOf(InternalServerError);
    expect(err.code).toBe('no_capacity');
    expect(calls).toHaveLength(3);
  });

  it('never retries an account limit, and exposes code and details', async () => {
    const { fetch, calls } = mockFetch(
      apiError(429, 'limit_pending_streams', 'At most 2 streams may be waiting', { limit: 2, current: 2 }),
    );
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    const err = await joa.streams.create().catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err).toBeInstanceOf(JustOnAirError);
    expect(err.status).toBe(429);
    expect(err.code).toBe('limit_pending_streams');
    expect(err.details).toEqual({ limit: 2, current: 2 });
    expect(err.message).toBe('At most 2 streams may be waiting');
    expect(calls).toHaveLength(1);
  });
});

describe('errors', () => {
  it.each([
    [400, 'invalid_request', BadRequestError],
    [401, 'unauthorized', AuthenticationError],
    [402, 'insufficient_credit', InsufficientCreditError],
    [404, 'not_found', NotFoundError],
    [409, 'stream_ended', ConflictError],
    [422, 'idempotency_key_reused', BadRequestError],
  ])('%i %s', async (status, code, Cls) => {
    const { fetch } = mockFetch(apiError(status, code));
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    const err = await joa.streams.get('str_x').catch((e) => e);
    expect(err).toBeInstanceOf(Cls);
    expect(err.code).toBe(code);
  });

  it('copes with a body that is not JSON', async () => {
    const { fetch } = mockFetch(new Response('<html>bad gateway</html>', { status: 502 }), new Response('nope', { status: 502 }), new Response('x', { status: 502 }));
    const joa = new JustOnAir({ apiKey: KEY, fetch, maxRetries: 0 });
    const err = await joa.streams.get('str_x').catch((e) => e);
    expect(err).toBeInstanceOf(InternalServerError);
    expect(err.code).toBeNull();
    expect(err.message).toContain('502');
  });
});

describe('retries', () => {
  it('retries a GET after a network error', async () => {
    const { fetch, calls } = mockFetch(new TypeError('fetch failed'), json(200, stream()));
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    const s = await joa.streams.get('str_e1bzk3dxw9z9allei6n7');
    expect(s.id).toBe('str_e1bzk3dxw9z9allei6n7');
    expect(calls).toHaveLength(2);
  });

  it('wraps a network error as APIConnectionError', async () => {
    const { fetch } = mockFetch(new TypeError('fetch failed'));
    const joa = new JustOnAir({ apiKey: KEY, fetch, maxRetries: 0 });
    const err = await joa.streams.get('str_x').catch((e) => e);
    expect(err).toBeInstanceOf(APIConnectionError);
    expect(err.cause).toBeInstanceOf(TypeError);
  });

  it('does not retry a POST without an Idempotency-Key (webhook create)', async () => {
    const { fetch, calls } = mockFetch(apiError(500, 'internal'));
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    await expect(joa.webhooks.endpoints.create({ url: 'https://example.com/h' })).rejects.toBeInstanceOf(InternalServerError);
    expect(calls).toHaveLength(1);
  });

  it('times out with APITimeoutError', async () => {
    const hang: typeof globalThis.fetch = (_i, init) =>
      new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
    const joa = new JustOnAir({ apiKey: KEY, fetch: hang, timeoutMs: 20, maxRetries: 0 });
    await expect(joa.streams.get('str_x')).rejects.toBeInstanceOf(APITimeoutError);
  });

  it('stops at once when the caller aborts', async () => {
    const hang: typeof globalThis.fetch = (_i, init) =>
      new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
    const joa = new JustOnAir({ apiKey: KEY, fetch: hang, maxRetries: 3 });
    const ctl = new AbortController();
    const p = joa.streams.get('str_x', { signal: ctl.signal });
    ctl.abort(new Error('stop'));
    await expect(p).rejects.toThrow('stop');
  });
});

describe('streams', () => {
  it('lists with query parameters, leaving out undefined ones', async () => {
    const { fetch, calls } = mockFetch(json(200, { object: 'list', data: [], has_more: false }));
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    await joa.streams.list({ limit: 5, status: 'live', starting_after: undefined });
    expect(calls[0]!.url.search).toBe('?limit=5&status=live');
  });

  it('listAll walks every page', async () => {
    const page = (ids: string[], has_more: boolean) => json(200, { object: 'list', data: ids.map((id) => stream({ id })), has_more });
    const { fetch, calls } = mockFetch(page(['str_a', 'str_b'], true), page(['str_c'], false));
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    const ids: string[] = [];
    for await (const s of joa.streams.listAll({ limit: 2 })) ids.push(s.id);
    expect(ids).toEqual(['str_a', 'str_b', 'str_c']);
    expect(calls[1]!.url.searchParams.get('starting_after')).toBe('str_b');
  });

  it('update, end, replaceKey, playbackToken, viewers hit the right routes', async () => {
    const { fetch, calls } = mockFetch(
      json(200, stream()),
      json(200, stream({ status: 'ended' })),
      json(200, stream()),
      json(200, { object: 'playback_token' }),
      json(200, { object: 'viewer_series' }),
    );
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    await joa.streams.update('str_a', { player: { watch_minutes_limit: 600 } });
    await joa.streams.end('str_a');
    await joa.streams.replaceKey('str_a');
    await joa.streams.playbackToken('str_a', { expires_in: 300 });
    await joa.streams.viewers('str_a');
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      'PATCH /v1/streams/str_a',
      'DELETE /v1/streams/str_a',
      'POST /v1/streams/str_a/stream-key',
      'POST /v1/streams/str_a/playback-token',
      'GET /v1/streams/str_a/viewers',
    ]);
    expect(calls[0]!.body).toEqual({ player: { watch_minutes_limit: 600 } });
    expect(calls[3]!.body).toEqual({ expires_in: 300 });
  });

  it('encodes ids into the path', async () => {
    const { fetch, calls } = mockFetch(json(200, stream()));
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    await joa.streams.get('../v1/usage');
    expect(calls[0]!.url.pathname).toBe('/v1/streams/..%2Fv1%2Fusage');
  });
});

describe('recordings', () => {
  it('waitUntilReady polls until ready', async () => {
    const { fetch, calls } = mockFetch(
      json(200, stream({ status: 'ended', recording: { status: 'processing' } })),
      json(200, stream({ status: 'ended', recording: { status: 'ready', bytes: 10 } })),
    );
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    const s = await joa.recordings.waitUntilReady('str_a', { intervalMs: 1 });
    expect(s.recording?.status).toBe('ready');
    expect(calls).toHaveLength(2);
  });

  it('waitUntilReady throws when the recording will never be ready', async () => {
    const { fetch } = mockFetch(json(200, stream({ status: 'ended', recording: { status: 'not_recorded' } })));
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    await expect(joa.recordings.waitUntilReady('str_a', { intervalMs: 1 })).rejects.toThrow('not_recorded');
  });

  it('download and delete', async () => {
    const { fetch, calls } = mockFetch(json(200, { object: 'recording_download', url: 'https://x' }), json(200, stream()));
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    const d = await joa.recordings.download('str_a', { expires_in: 600 });
    expect(d.url).toBe('https://x');
    await joa.recordings.delete('str_a');
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      'POST /v1/streams/str_a/recording/download',
      'DELETE /v1/streams/str_a/recording',
    ]);
  });
});

describe('webhook endpoints, usage, account', () => {
  it('delete returns nothing on 204', async () => {
    const { fetch } = mockFetch(new Response(null, { status: 204 }));
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    await expect(joa.webhooks.endpoints.delete('whk_1')).resolves.toBeUndefined();
  });

  it('routes', async () => {
    const ok = () => json(200, {});
    const { fetch, calls } = mockFetch(ok(), ok(), ok(), ok(), ok(), ok(), ok(), ok(), ok());
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    await joa.webhooks.endpoints.list();
    await joa.webhooks.endpoints.get('whk_1');
    await joa.webhooks.endpoints.update('whk_1', { enabled: false });
    await joa.webhooks.endpoints.rotateSecret('whk_1');
    await joa.webhooks.endpoints.test('whk_1');
    await joa.webhooks.endpoints.deliveries('whk_1', { status: 'failed' });
    await joa.webhooks.endpoints.retryDelivery('whk_1', 'dlv_2');
    await joa.usage.get({ days: 30 });
    await joa.account.notifications.update({ low_balance_threshold_usd: '12.50' });
    expect(calls.map((c) => `${c.method} ${c.url.pathname}${c.url.search}`)).toEqual([
      'GET /v1/webhooks',
      'GET /v1/webhooks/whk_1',
      'PATCH /v1/webhooks/whk_1',
      'POST /v1/webhooks/whk_1/secret',
      'POST /v1/webhooks/whk_1/test',
      'GET /v1/webhooks/whk_1/deliveries?status=failed',
      'POST /v1/webhooks/whk_1/deliveries/dlv_2/retry',
      'GET /v1/usage?days=30',
      'PATCH /v1/account/notifications',
    ]);
  });
});

describe('embed and keys', () => {
  it('embed.get sends no key and works without one', async () => {
    const { fetch, calls } = mockFetch(json(200, { object: 'embed', status: 'live' }));
    const joa = new JustOnAir({ apiKey: undefined, fetch });
    const saved = process.env.JOA_API_KEY;
    delete process.env.JOA_API_KEY;
    try {
      const e = await new JustOnAir({ fetch }).embed.get('str_a');
      expect(e.status).toBe('live');
      expect(calls[0]!.headers.authorization).toBeUndefined();
    } finally {
      if (saved !== undefined) process.env.JOA_API_KEY = saved;
    }
    void joa;
  });

  it('refuses an authenticated call without a key', async () => {
    const saved = process.env.JOA_API_KEY;
    delete process.env.JOA_API_KEY;
    try {
      const { fetch, calls } = mockFetch();
      await expect(new JustOnAir({ fetch }).streams.list()).rejects.toThrow('No API key');
      expect(calls).toHaveLength(0);
    } finally {
      if (saved !== undefined) process.env.JOA_API_KEY = saved;
    }
  });

  it('reads JOA_API_KEY and JOA_BASE_URL from the environment', async () => {
    process.env.JOA_API_KEY = 'joa_live_env';
    process.env.JOA_BASE_URL = 'http://localhost:3000/';
    try {
      const { fetch, calls } = mockFetch(json(200, { object: 'usage' }));
      await new JustOnAir({ fetch }).usage.get();
      expect(calls[0]!.url.toString()).toBe('http://localhost:3000/v1/usage');
      expect(calls[0]!.headers.authorization).toBe('Bearer joa_live_env');
    } finally {
      delete process.env.JOA_API_KEY;
      delete process.env.JOA_BASE_URL;
    }
  });

  it('iframe escapes the title', () => {
    const joa = new JustOnAir({ fetch: mockFetch().fetch });
    expect(joa.embed.iframe('https://play.joacdn.com/str_a', { title: 'A "live" <show>' })).toBe(
      '<iframe src="https://play.joacdn.com/str_a" title="A &#34;live&#34; &#60;show&#62;" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="aspect-ratio:16/9;width:100%;border:0"></iframe>',
    );
  });
});

describe('browser guard', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('refuses an API key in a browser unless allowed', () => {
    (globalThis as { window?: unknown }).window = { document: {} };
    const { fetch } = mockFetch();
    expect(() => new JustOnAir({ apiKey: KEY, fetch })).toThrow('browser');
    expect(() => new JustOnAir({ apiKey: KEY, fetch, dangerouslyAllowBrowser: true })).not.toThrow();
  });
});

it('VERSION matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  expect(VERSION).toBe(pkg.version);
});
