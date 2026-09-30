import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import JustOnAir, { WebhookVerificationError, signWebhook, verifyWebhook } from '../src/index.js';

// The API's own signer (apps/api/src/webhooks/signing.ts), copied so the SDK
// is checked against the real algorithm, not against itself.
const newSecret = () => `whsec_${randomBytes(24).toString('base64')}`;
function apiSignature(secret: string, id: string, timestamp: number, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}
function apiHeaders(secrets: string[], id: string, timestamp: number, body: string) {
  return {
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': secrets.map((s) => apiSignature(s, id, timestamp, body)).join(' '),
  };
}

const secret = newSecret();
const now = Math.floor(Date.now() / 1000);
const body = JSON.stringify({ type: 'stream.live', timestamp: '2026-09-30T12:00:00.000Z', data: { object: 'stream', id: 'str_a', status: 'live' } });

describe('webhook verification', () => {
  it('accepts what the API signs and returns the event', async () => {
    const event = await verifyWebhook(body, apiHeaders([secret], 'evt_1', now, body), secret);
    expect(event.type).toBe('stream.live');
    expect(event.data.id).toBe('str_a');
  });

  it('accepts bytes, a Headers object, and Express-style headers', async () => {
    const h = apiHeaders([secret], 'evt_1', now, body);
    await expect(verifyWebhook(Buffer.from(body), new Headers(h), secret)).resolves.toBeTruthy();
    await expect(verifyWebhook(new TextEncoder().encode(body), { 'Webhook-Id': h['webhook-id'], 'webhook-timestamp': h['webhook-timestamp'], 'webhook-signature': [h['webhook-signature']] }, secret)).resolves.toBeTruthy();
  });

  it('accepts either signature during a secret rotation', async () => {
    const newer = newSecret();
    const h = apiHeaders([secret, newer], 'evt_1', now, body);
    await expect(verifyWebhook(body, h, secret)).resolves.toBeTruthy();
    await expect(verifyWebhook(body, h, newer)).resolves.toBeTruthy();
  });

  it('refuses a changed body, a wrong secret, an old timestamp, missing headers', async () => {
    const h = apiHeaders([secret], 'evt_1', now, body);
    await expect(verifyWebhook(body.replace('live', 'ended'), h, secret)).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(verifyWebhook(body, h, newSecret())).rejects.toThrow('does not match');
    const old = apiHeaders([secret], 'evt_1', now - 301, body);
    await expect(verifyWebhook(body, old, secret)).rejects.toThrow('too old');
    await expect(verifyWebhook(body, { 'webhook-id': 'evt_1' }, secret)).rejects.toThrow('Missing');
    await expect(verifyWebhook(body, h, '')).rejects.toThrow('No webhook secret');
    const otherId = { ...h, 'webhook-id': 'evt_2' };
    await expect(verifyWebhook(body, otherId, secret)).rejects.toThrow('does not match');
  });

  it('signWebhook matches the API signer', async () => {
    const sig = await signWebhook(secret, 'evt_9', now, body);
    expect(`v1,${sig}`).toBe(apiSignature(secret, 'evt_9', now, body));
  });

  it('client.webhooks.verify uses the configured secret', async () => {
    const joa = new JustOnAir({ webhookSecret: secret, fetch: async () => new Response() });
    const event = await joa.webhooks.verify(body, apiHeaders([secret], 'evt_1', now, body));
    expect(event.type).toBe('stream.live');
  });
});
