import { seg, type Core, type RequestOptions } from '../core.js';
import type {
  CreatedStream,
  PlaybackToken,
  PlaybackTokenParams,
  Stream,
  StreamCreateParams,
  StreamList,
  StreamListParams,
  StreamUpdateParams,
  ViewerSeries,
} from '../types.js';

export class Streams {
  constructor(private readonly core: Core) {}

  /**
   * Creates a stream and reserves ingest capacity for 30 minutes. The answer
   * holds `rtmp_url` + `stream_key`, `whip_url`, `embed_url` and
   * `playback_url`. `stream_key` and `whip_url` are returned ONLY here: store them.
   *
   * An `Idempotency-Key` is generated for you (pass your own to make retries
   * across process restarts safe too), so a retried call never creates a second stream.
   */
  create(params: StreamCreateParams = {}, opts: RequestOptions = {}): Promise<CreatedStream> {
    const idempotencyKey = opts.idempotencyKey ?? globalThis.crypto.randomUUID();
    return this.core.request({ method: 'POST', path: '/v1/streams', body: params }, { ...opts, idempotencyKey });
  }

  /** Status, what is arriving (`ingest`), the recording, `cost` and `viewers` so far. */
  get(id: string, opts?: RequestOptions): Promise<Stream> {
    return this.core.request({ method: 'GET', path: `/v1/streams/${seg(id)}` }, opts);
  }

  /** One page, newest first. Use `listAll` to walk every page. */
  list(params: StreamListParams = {}, opts?: RequestOptions): Promise<StreamList> {
    return this.core.request({ method: 'GET', path: '/v1/streams', query: params }, opts);
  }

  /** Every stream, newest first, fetching pages as you iterate: `for await (const s of joa.streams.listAll())`. */
  async *listAll(params: Omit<StreamListParams, 'starting_after'> = {}, opts?: RequestOptions): AsyncGenerator<Stream> {
    let startingAfter: string | undefined;
    for (;;) {
      const page = await this.list({ ...params, starting_after: startingAfter }, opts);
      for (const s of page.data) yield s;
      const last = page.data[page.data.length - 1];
      if (!page.has_more || !last) return;
      startingAfter = last.id;
    }
  }

  /** Rename, replace `metadata`, or change `player` settings. Works in any status; null clears a field. */
  update(id: string, params: StreamUpdateParams, opts?: RequestOptions): Promise<Stream> {
    return this.core.request({ method: 'PATCH', path: `/v1/streams/${seg(id)}`, body: params }, opts);
  }

  /** Live: ends it and disconnects the publisher. Pending: cancels it. Already finished: returns it unchanged. */
  end(id: string, opts?: RequestOptions): Promise<Stream> {
    return this.core.request({ method: 'DELETE', path: `/v1/streams/${seg(id)}` }, opts);
  }

  /** New `stream_key` and `whip_url` for a pending stream; the old ones stop working at once. */
  replaceKey(id: string, opts?: RequestOptions): Promise<CreatedStream> {
    return this.core.request({ method: 'POST', path: `/v1/streams/${seg(id)}/stream-key` }, opts);
  }

  /** A freshly signed HLS URL, e.g. a short-lived one per viewer. `expires_in` in seconds (60–604800). */
  playbackToken(id: string, params: PlaybackTokenParams = {}, opts?: RequestOptions): Promise<PlaybackToken> {
    return this.core.request(
      { method: 'POST', path: `/v1/streams/${seg(id)}/playback-token`, body: params, retrySafe: true },
      opts,
    );
  }

  /** Viewers per minute (hosted-player estimate live, exact CDN counts about an hour later) and by country. */
  viewers(id: string, opts?: RequestOptions): Promise<ViewerSeries> {
    return this.core.request({ method: 'GET', path: `/v1/streams/${seg(id)}/viewers` }, opts);
  }
}
