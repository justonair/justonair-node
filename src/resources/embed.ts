import { seg, type Core, type RequestOptions } from '../core.js';
import type { ChatMessage, ChatRead, Embed, ReactionCounts, ViewerPostParams, ViewerSession } from '../types.js';

export class EmbedResource {
  constructor(private readonly core: Core) {}

  /** The hosted player's public read: status and, while live, a signed URL. Needs no API key. */
  get(id: string, opts?: RequestOptions): Promise<Embed> {
    return this.core.request({ method: 'GET', path: `/v1/embed/${seg(id)}`, auth: false }, opts);
  }

  /**
   * A signed viewer session for chat and reactions (and viewer beats). Once
   * per browser and stream; keep it until `expires_at`. Needs no API key.
   */
  session(id: string, opts?: RequestOptions): Promise<ViewerSession> {
    return this.core.request({ method: 'POST', path: `/v1/embed/${seg(id)}/session`, auth: false, retrySafe: true }, opts);
  }

  /**
   * The public chat read (the same answer for every viewer for 2 s). In a
   * browser, read it through the CDN instead:
   * `https://play.joacdn.com/api/embed/{id}/chat`. Needs no API key.
   */
  chat(id: string, opts?: RequestOptions): Promise<ChatRead> {
    return this.core.request({ method: 'GET', path: `/v1/embed/${seg(id)}/chat`, auth: false }, opts);
  }

  /** Post as a viewer with a session token. Banned or filtered messages get the same answer (shadow). Needs no API key. */
  postMessage(id: string, params: ViewerPostParams, opts?: RequestOptions): Promise<ChatMessage> {
    return this.core.request({ method: 'POST', path: `/v1/embed/${seg(id)}/chat/messages`, body: params, auth: false }, opts);
  }

  /**
   * Send a batch of reactions (counts since the last batch, at most 10 each).
   * Send at most every `reaction_sampling.interval_seconds`, and only while
   * the session's `u` is below `reaction_sampling.rate`. Needs no API key.
   */
  async react(id: string, token: string, counts: ReactionCounts, opts?: RequestOptions): Promise<void> {
    const r = Object.entries(counts)
      .filter(([, n]) => typeof n === 'number' && n > 0)
      .map(([k, n]) => `${k}:${Math.min(Math.floor(n as number), 10)}`)
      .join(',');
    if (!r) return;
    await this.core.request({ method: 'POST', path: `/v1/embed/${seg(id)}/chat/reactions`, query: { t: token, r }, auth: false }, opts);
  }

  /** The iframe snippet for a stream's `embed_url`. */
  iframe(embedUrl: string, opts: { title?: string } = {}): string {
    const title = (opts.title ?? 'Live stream').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    const src = embedUrl.replace(/"/g, '%22');
    return `<iframe src="${src}" title="${title}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="aspect-ratio:16/9;width:100%;border:0"></iframe>`;
  }
}
