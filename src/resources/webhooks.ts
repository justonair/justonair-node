import { seg, type Core, type RequestOptions } from '../core.js';
import { verifyWebhook, type VerifyOptions, type WebhookHeaders } from '../webhook-signature.js';
import type {
  WebhookDelivery,
  WebhookDeliveryList,
  WebhookDeliveryListParams,
  WebhookEndpoint,
  WebhookEndpointCreateParams,
  WebhookEndpointList,
  WebhookEndpointUpdateParams,
  WebhookEvent,
} from '../types.js';

export class WebhookEndpoints {
  constructor(private readonly core: Core) {}

  /** Up to 5 per account. The answer includes `secret` (`whsec_…`). Leave `events` out for every event, including future ones. */
  create(params: WebhookEndpointCreateParams, opts?: RequestOptions): Promise<WebhookEndpoint> {
    return this.core.request({ method: 'POST', path: '/v1/webhooks', body: params }, opts);
  }

  /** Without secrets. Also lists every event type (`event_types`). */
  list(opts?: RequestOptions): Promise<WebhookEndpointList> {
    return this.core.request({ method: 'GET', path: '/v1/webhooks' }, opts);
  }

  /** With its secret. */
  get(id: string, opts?: RequestOptions): Promise<WebhookEndpoint> {
    return this.core.request({ method: 'GET', path: `/v1/webhooks/${seg(id)}` }, opts);
  }

  update(id: string, params: WebhookEndpointUpdateParams, opts?: RequestOptions): Promise<WebhookEndpoint> {
    return this.core.request({ method: 'PATCH', path: `/v1/webhooks/${seg(id)}`, body: params }, opts);
  }

  /** Its delivery log goes with it. */
  async delete(id: string, opts?: RequestOptions): Promise<void> {
    await this.core.request({ method: 'DELETE', path: `/v1/webhooks/${seg(id)}` }, opts);
  }

  /** New secret; the old one keeps signing alongside it for 24 hours. */
  rotateSecret(id: string, opts?: RequestOptions): Promise<WebhookEndpoint> {
    return this.core.request({ method: 'POST', path: `/v1/webhooks/${seg(id)}/secret` }, opts);
  }

  /** Queues a `webhook.test` event, sent within a couple of seconds. */
  test(id: string, opts?: RequestOptions): Promise<WebhookDelivery> {
    return this.core.request({ method: 'POST', path: `/v1/webhooks/${seg(id)}/test` }, opts);
  }

  /** Delivery log, newest first, kept 30 days. */
  deliveries(id: string, params: WebhookDeliveryListParams = {}, opts?: RequestOptions): Promise<WebhookDeliveryList> {
    return this.core.request({ method: 'GET', path: `/v1/webhooks/${seg(id)}/deliveries`, query: params }, opts);
  }

  /** One more attempt now for a failed delivery; brings a pending one forward. */
  retryDelivery(id: string, deliveryId: string, opts?: RequestOptions): Promise<WebhookDelivery> {
    return this.core.request(
      { method: 'POST', path: `/v1/webhooks/${seg(id)}/deliveries/${seg(deliveryId)}/retry`, retrySafe: true },
      opts,
    );
  }
}

export class Webhooks {
  readonly endpoints: WebhookEndpoints;

  constructor(private readonly core: Core) {
    this.endpoints = new WebhookEndpoints(core);
  }

  /**
   * Verifies a webhook and returns the event. Pass the RAW body (string or
   * bytes, before JSON parsing) and the request headers. The secret defaults to
   * the client's `webhookSecret` / JOA_WEBHOOK_SECRET. Throws WebhookVerificationError.
   *
   * ```ts
   * app.post('/webhooks/justonair', express.raw({ type: 'application/json' }), async (req, res) => {
   *   const event = await joa.webhooks.verify(req.body, req.headers);
   *   res.sendStatus(204);
   * });
   * ```
   */
  verify(
    payload: string | Uint8Array | ArrayBuffer,
    headers: WebhookHeaders,
    secret?: string,
    opts?: VerifyOptions,
  ): Promise<WebhookEvent> {
    return verifyWebhook(payload, headers, secret ?? this.core.webhookSecret ?? '', opts);
  }
}
