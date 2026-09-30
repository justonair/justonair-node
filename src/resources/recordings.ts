import { seg, type Core, type RequestOptions } from '../core.js';
import { JustOnAirError } from '../errors.js';
import type { RecordingDownload, RecordingDownloadParams, Stream } from '../types.js';

export interface WaitOptions {
  /** Give up after this long. Default 30 minutes. */
  timeoutMs?: number;
  /** Time between checks. Default 10 s. */
  intervalMs?: number;
  signal?: AbortSignal;
}

/** Recording states that will not turn into `ready` by waiting. */
const FINAL_NOT_READY = new Set(['failed', 'deleting', 'deleted', 'not_recorded', 'none', 'legacy']);

export class Recordings {
  constructor(private readonly core: Core) {}

  /** A signed link to the MP4 on the CDN (default 1 h). Downloading counts as delivery. 409 `recording_not_ready` until it is. */
  download(streamId: string, params: RecordingDownloadParams = {}, opts?: RequestOptions): Promise<RecordingDownload> {
    return this.core.request(
      { method: 'POST', path: `/v1/streams/${seg(streamId)}/recording/download`, body: params, retrySafe: true },
      opts,
    );
  }

  /** Deletes the MP4 now, or as soon as it exists. Returns the stream. */
  delete(streamId: string, opts?: RequestOptions): Promise<Stream> {
    return this.core.request({ method: 'DELETE', path: `/v1/streams/${seg(streamId)}/recording` }, opts);
  }

  /**
   * Polls the stream until its recording is `ready` and returns the stream.
   * Throws if the recording ends up failed, deleted or not made at all, or on timeout.
   * The MP4 is usually ready a few minutes after the stream ends.
   */
  async waitUntilReady(streamId: string, opts: WaitOptions = {}): Promise<Stream> {
    const timeoutMs = opts.timeoutMs ?? 30 * 60_000;
    const intervalMs = opts.intervalMs ?? 10_000;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const stream = await this.core.request<Stream>(
        { method: 'GET', path: `/v1/streams/${seg(streamId)}` },
        opts.signal ? { signal: opts.signal } : {},
      );
      const status = stream.recording?.status;
      if (status === 'ready') return stream;
      if (status !== undefined && FINAL_NOT_READY.has(status)) {
        throw new JustOnAirError(`Recording of ${streamId} will not be ready: status is "${status}".`);
      }
      if (Date.now() + intervalMs > deadline) {
        throw new JustOnAirError(`Recording of ${streamId} not ready after ${Math.round(timeoutMs / 1000)} s (status "${status ?? 'pending'}").`);
      }
      await sleep(intervalMs, opts.signal);
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
