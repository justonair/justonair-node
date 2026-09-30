import type { FetchLike } from '../src/index.js';

export interface Call {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = Response | Error | ((call: Call) => Response | Error | Promise<Response>);

/** A fetch that records every call and answers from a queue. */
export function mockFetch(...replies: Reply[]) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (input, init = {}) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    const call: Call = {
      url: new URL(input),
      method: init.method ?? 'GET',
      headers,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const next = replies.shift();
    if (!next) throw new Error(`unexpected request ${call.method} ${call.url}`);
    const r = typeof next === 'function' ? await next(call) : next;
    if (r instanceof Error) throw r;
    return r;
  };
  return { fetch, calls };
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

export const apiError = (status: number, code: string, message = code, details?: Record<string, unknown>, headers: Record<string, string> = {}) =>
  json(status, { error: { code, message, ...(details ? { details } : {}) } }, headers);

export const stream = (over: Record<string, unknown> = {}) => ({
  id: 'str_e1bzk3dxw9z9allei6n7',
  object: 'stream',
  name: 'Town hall',
  status: 'pending',
  profile: 'abr_basic',
  record: true,
  recording: null,
  node_ready: true,
  rtmp_url: 'rtmp://ingest-1.justonair.com:1935/abr-basic',
  playback_url: 'https://live.joacdn.com/bcdn_token=x/str_e1bzk3dxw9z9allei6n7/master.m3u8',
  playback_url_expires_at: '2026-10-01T00:00:00.000Z',
  embed_url: 'https://play.joacdn.com/str_e1bzk3dxw9z9allei6n7',
  renditions: ['source', '480p'],
  max_ingest_resolution: 720,
  max_duration_seconds: 14400,
  metadata: null,
  player: { show_name: true, max_height: null, watch_minutes_limit: null, closed_at: null },
  reservation_expires_at: '2026-09-30T12:30:00.000Z',
  reservation_expires_in_seconds: 1800,
  created_at: '2026-09-30T12:00:00.000Z',
  went_live_at: null,
  ended_at: null,
  end_reason: null,
  ingest: null,
  ...over,
});
