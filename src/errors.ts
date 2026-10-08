/**
 * Every failure the SDK raises is a JustOnAirError. API errors carry the
 * API's stable `code` (see https://docs.justonair.com/errors): program
 * against the code, show the message to people.
 */
export class JustOnAirError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The API answered with an error status. */
export class APIError extends JustOnAirError {
  /** HTTP status, e.g. 429. */
  readonly status: number;
  /** Stable, machine-readable code, e.g. `limit_pending_streams`. Null if the body had none. */
  readonly code: string | null;
  /** Extra facts the API sent, e.g. `{ limit: 2, current: 2 }`. */
  readonly details: Record<string, unknown> | null;
  /** Response headers. */
  readonly headers: Headers;

  constructor(status: number, code: string | null, message: string, details: Record<string, unknown> | null, headers: Headers) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }

  /** @internal Picks the subclass for a status. */
  static from(status: number, body: unknown, headers: Headers): APIError {
    const e = (body as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)?.error;
    const code = typeof e?.code === 'string' ? e.code : null;
    const message = typeof e?.message === 'string' ? e.message : `JustOnAir API answered ${status}`;
    const details = e?.details && typeof e.details === 'object' ? (e.details as Record<string, unknown>) : null;
    const Cls =
      status === 400 || status === 422 ? BadRequestError
      : status === 401 ? AuthenticationError
      : status === 402 ? InsufficientCreditError
      : status === 403 ? PermissionDeniedError
      : status === 404 ? NotFoundError
      : status === 409 ? ConflictError
      : status === 429 ? RateLimitError
      : status >= 500 ? InternalServerError
      : APIError;
    return new Cls(status, code, message, details, headers);
  }
}

/** 400 `invalid_request`, `invalid_nickname`; 422 `idempotency_key_reused`, `chat_message_not_allowed`. */
export class BadRequestError extends APIError {}
/** 401 `unauthorized` (missing or wrong API key), `invalid_session` (a viewer session on public chat calls). */
export class AuthenticationError extends APIError {}
/** 402 `insufficient_credit`: less than $1.00 of credit left. */
export class InsufficientCreditError extends APIError {}
/** 403 `account_pending` or `tenant_suspended`. */
export class PermissionDeniedError extends APIError {}
/** 404 `not_found`. */
export class NotFoundError extends APIError {}
/** 409 `stream_not_pending`, `stream_ended`, `recording_not_ready`, `chat_not_enabled`, `chat_closed`, `chat_paused`. */
export class ConflictError extends APIError {}
/** 429: an account limit (`limit_*`), `rate_limited`, or chat's `chat_slow_mode`, `chat_rate_limited`, `chat_busy` (`details.retry_after_seconds`). */
export class RateLimitError extends APIError {}
/** 5xx, including 503 `no_capacity`. */
export class InternalServerError extends APIError {}

/** The request never got an answer: DNS, connection reset, TLS. */
export class APIConnectionError extends JustOnAirError {}

/** No answer within `timeoutMs`. */
export class APITimeoutError extends APIConnectionError {}

/** A webhook failed verification: bad signature, wrong secret, too old, or missing headers. */
export class WebhookVerificationError extends JustOnAirError {}
