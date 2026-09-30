# JustOnAir for Node.js

The official TypeScript SDK for the [JustOnAir](https://docs.justonair.com) live video API: create a stream, send video over RTMP or WHIP, and viewers watch through the hosted player or your own.

```bash
npm install justonair
```

Node 20 or newer. No dependencies. ESM and CommonJS. Also runs on Bun, Deno and edge runtimes.

## Quick start

Create an API key in the [dashboard](https://app.justonair.com) under **API keys**, and set it as `JOA_API_KEY`.

```ts
import JustOnAir from 'justonair';

const joa = new JustOnAir(); // reads JOA_API_KEY

const stream = await joa.streams.create({ name: 'Town hall' });

// For OBS or ffmpeg. Returned only here: store it.
console.log(stream.rtmp_url, stream.stream_key);
// For a browser or any WebRTC encoder.
console.log(stream.whip_url);
// The hosted player: share the link or put it in an iframe.
console.log(stream.embed_url);
```

Send video to it (a test picture, no camera needed):

```bash
ffmpeg -re -f lavfi -i "testsrc2=size=1280x720:rate=30" -f lavfi -i "sine=frequency=440" \
  -c:v libx264 -preset veryfast -b:v 2500k -g 60 -keyint_min 60 -sc_threshold 0 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -f flv "$RTMP_URL/$STREAM_KEY"
```

and open `embed_url`. The [Quickstart](https://docs.justonair.com/quickstart) has the details, including OBS settings.

## Streams

```ts
const stream = await joa.streams.create({
  name: 'Yoga, Tuesday 18:00',
  profile: 'abr_basic',          // several qualities for viewers (default), or 'passthrough'
  max_resolution: 720,           // the tallest video you will send: 480, 720 (default), 1080 (trusted accounts)
  record: true,                  // an MP4 after the stream ends (default)
  recording_retention_days: 30,  // null keeps it until you delete it
  metadata: { class_id: 'c_42' },// your own JSON, never shown to viewers
  player: { show_name: true, max_height: 720, watch_minutes_limit: 60_000 },
});

await joa.streams.get(stream.id);        // status, ingest, recording, cost, viewers
await joa.streams.update(stream.id, { name: 'Yoga (moved)' });
await joa.streams.end(stream.id);        // ends a live stream, cancels a pending one

const page = await joa.streams.list({ status: 'live', limit: 20 });
for await (const s of joa.streams.listAll()) console.log(s.id, s.status);

await joa.streams.replaceKey(stream.id); // lost the key before going live
await joa.streams.playbackToken(stream.id, { expires_in: 600 }); // a short signed HLS URL
await joa.streams.viewers(stream.id);    // viewers per minute and by country
```

A stream waits up to 30 minutes for video (`pending`), then is `live`, and finally `ended`, `expired` (nothing connected in time) or `cancelled`. Field-by-field meaning: [API reference](https://docs.justonair.com/api-reference).

## Recordings

One MP4 of the top quality, ready a few minutes after the stream ends.

```ts
await joa.recordings.waitUntilReady(stream.id);              // polls; throws if it will never be ready
const { url } = await joa.recordings.download(stream.id);    // signed link, 1 hour by default
await joa.recordings.delete(stream.id);
```

## Webhooks

Get `stream.live`, `stream.ended`, `recording.ready`, `credit.low` and more pushed to your server instead of polling.

```ts
const endpoint = await joa.webhooks.endpoints.create({
  url: 'https://example.com/webhooks/justonair',
  events: ['stream.live', 'stream.ended', 'recording.ready'], // leave out for every event
});
// endpoint.secret is whsec_…: store it as JOA_WEBHOOK_SECRET
```

Verify each delivery against the **raw** body, before any JSON parsing:

```ts
// Express
app.post('/webhooks/justonair', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = await joa.webhooks.verify(req.body, req.headers); // uses JOA_WEBHOOK_SECRET
  } catch {
    return res.sendStatus(400);
  }
  res.sendStatus(204); // answer within 10 s, then do the work
  if (event.type === 'recording.ready') await importRecording(event.data.id);
});
```

```ts
// Next.js route handler, or anything with a Fetch API Request
export async function POST(req: Request) {
  const event = await joa.webhooks.verify(await req.text(), req.headers);
  // …
  return new Response(null, { status: 204 });
}
```

`verify` throws `WebhookVerificationError` for a bad signature, a wrong secret, a message older than 5 minutes, or missing headers. It is the [Standard Webhooks](https://www.standardwebhooks.com) format, and `verifyWebhook(body, headers, secret)` is exported on its own too. More: `joa.webhooks.endpoints.list / get / update / delete / rotateSecret / test / deliveries / retryDelivery`.

## Balance and usage

```ts
const usage = await joa.usage.get({ days: 30 });
console.log(usage.available_usd, usage.days.map((d) => [d.date, d.cost_usd]));

await joa.account.notifications.update({ low_balance_threshold_usd: '20.00' });
```

Amounts are decimal strings (`"12.345000"`), so nothing is lost to floating point.

## The hosted player

```ts
joa.embed.iframe(stream.embed_url, { title: 'Town hall' }); // the <iframe> snippet
await joa.embed.get(stream.id); // the player's public read; needs no API key
```

## Errors

Every error is a `JustOnAirError`. When the API answers with an error you get an `APIError` subclass with the API's stable `code`: program against the code, show the `message` to people.

```ts
import { RateLimitError, InsufficientCreditError } from 'justonair';

try {
  await joa.streams.create();
} catch (err) {
  if (err instanceof RateLimitError && err.code === 'limit_pending_streams') {
    // err.details: { limit: 2, current: 2 }
  } else if (err instanceof InsufficientCreditError) {
    // add credit
  } else throw err;
}
```

| Class | Status | Codes |
|---|---|---|
| `BadRequestError` | 400, 422 | `invalid_request`, `idempotency_key_reused` |
| `AuthenticationError` | 401 | `unauthorized` |
| `InsufficientCreditError` | 402 | `insufficient_credit` |
| `PermissionDeniedError` | 403 | `account_pending`, `tenant_suspended` |
| `NotFoundError` | 404 | `not_found` |
| `ConflictError` | 409 | `stream_not_pending`, `stream_ended`, `recording_not_ready` |
| `RateLimitError` | 429 | `limit_*`, `rate_limited` |
| `InternalServerError` | 5xx | `no_capacity`, … |
| `APIConnectionError` / `APITimeoutError` | — | no answer |

All codes: [Errors](https://docs.justonair.com/errors).

## Retries, timeouts, idempotency

- Network errors, 5xx (including `no_capacity`) and `rate_limited` are retried twice with backoff. Account limits (`limit_*`) are not: waiting a second doesn't lift them.
- `streams.create` sends an `Idempotency-Key` for you, so a retry never makes a second stream. Pass your own (`{ idempotencyKey }`) to keep that true across restarts of your process, for example your own order or event id.
- A POST without an idempotency key is never retried.
- Every request times out after 30 s.

```ts
const joa = new JustOnAir({ maxRetries: 0, timeoutMs: 8_000 });
await joa.streams.create(params, { idempotencyKey: `event-${eventId}`, timeoutMs: 5_000, signal });
```

## Configuration

| Option | Default | |
|---|---|---|
| `apiKey` | `JOA_API_KEY` | Not needed for `embed` and `webhooks.verify`. |
| `webhookSecret` | `JOA_WEBHOOK_SECRET` | For `webhooks.verify`. |
| `baseUrl` | `JOA_BASE_URL`, then `https://api.justonair.com` | |
| `timeoutMs` | `30000` | Per attempt. |
| `maxRetries` | `2` | |
| `fetch` | global `fetch` | For tests or a proxy. |
| `defaultHeaders` | | Sent with every request. |

Keep API keys on your server. The SDK refuses to start with a key in a browser, where anyone could read it and spend your credit (`dangerouslyAllowBrowser: true` overrides that).

## Types

Every request and response is typed from the [OpenAPI spec](https://docs.justonair.com/openapi.json), and the types are exported:

```ts
import type { Stream, CreatedStream, WebhookEvent, Usage } from 'justonair';
```

## Links

[Docs](https://docs.justonair.com) · [API reference](https://docs.justonair.com/api-reference) · [Pricing](https://docs.justonair.com/pricing) · [For AI agents](https://docs.justonair.com/agents) · [Dashboard](https://app.justonair.com)

Security reports: security@justonair.com. Everything else: [issues](https://github.com/justonair/justonair-node/issues) or hello@justonair.com.

## License

MIT
