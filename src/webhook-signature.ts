import { WebhookVerificationError } from './errors.js';
import type { WebhookEvent } from './types.js';

/** Signatures older (or further in the future) than this are refused, like the Standard Webhooks libraries. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export type WebhookHeaders =
  | Headers
  | Record<string, string | string[] | undefined>;

export interface VerifyOptions {
  /** Seconds of clock difference allowed. Default 300. */
  toleranceSeconds?: number;
  /** For tests: the current time in ms. */
  now?: number;
}

/**
 * Checks a webhook from JustOnAir and returns the parsed event. Throws
 * WebhookVerificationError when it was not signed with `secret`, is older than
 * five minutes, or lacks the headers.
 *
 * Pass the RAW body, exactly as received, before any JSON parsing: re-encoding
 * parsed JSON changes the bytes and the signature no longer matches.
 *
 * Standard Webhooks format (https://www.standardwebhooks.com). Uses Web Crypto,
 * so it runs on Node 20+, Deno, Bun and edge runtimes.
 */
export async function verifyWebhook(
  payload: string | Uint8Array | ArrayBuffer,
  headers: WebhookHeaders,
  secret: string,
  opts: VerifyOptions = {},
): Promise<WebhookEvent> {
  if (!secret) throw new WebhookVerificationError('No webhook secret. Pass it or set JOA_WEBHOOK_SECRET (whsec_…).');
  const id = header(headers, 'webhook-id');
  const ts = header(headers, 'webhook-timestamp');
  const sigs = header(headers, 'webhook-signature');
  if (!id || !ts || !sigs) {
    throw new WebhookVerificationError('Missing webhook-id, webhook-timestamp or webhook-signature header.');
  }
  const timestamp = Number(ts);
  if (!/^\d+$/.test(ts) || !Number.isSafeInteger(timestamp)) throw new WebhookVerificationError('Invalid webhook-timestamp.');
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  const tolerance = opts.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(nowSec - timestamp) > tolerance) {
    throw new WebhookVerificationError('Webhook timestamp is too old or too far in the future.');
  }

  const body = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
  const expected = await sign(secret, id, ts, body);
  // During a secret rotation the header carries one signature per secret.
  const matches = sigs
    .split(' ')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v1,'))
    .some((s) => constantTimeEqual(s.slice(3), expected));
  if (!matches) throw new WebhookVerificationError('Webhook signature does not match.');

  try {
    return JSON.parse(body) as WebhookEvent;
  } catch {
    throw new WebhookVerificationError('Webhook body is not JSON.');
  }
}

/** The `v1` signature (base64) for a message. Exposed for tests of your own handler. */
export async function sign(secret: string, id: string, timestamp: string | number, body: string): Promise<string> {
  const keyBytes = base64ToBytes(secret.startsWith('whsec_') ? secret.slice(6) : secret);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new WebhookVerificationError('Web Crypto is not available. Use Node 20 or newer.');
  const key = await subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return bytesToBase64(new Uint8Array(mac));
}

function header(h: WebhookHeaders, name: string): string | undefined {
  if (typeof (h as Headers).get === 'function') return (h as Headers).get(name) ?? undefined;
  const rec = h as Record<string, string | string[] | undefined>;
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name);
  const v = key !== undefined ? rec[key] : undefined;
  return Array.isArray(v) ? v.join(' ') : v;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new WebhookVerificationError('Webhook secret is not valid base64 (expected whsec_…).');
  }
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
