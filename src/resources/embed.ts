import { seg, type Core, type RequestOptions } from '../core.js';
import type { Embed } from '../types.js';

export class EmbedResource {
  constructor(private readonly core: Core) {}

  /** The hosted player's public read: status and, while live, a signed URL. Needs no API key. */
  get(id: string, opts?: RequestOptions): Promise<Embed> {
    return this.core.request({ method: 'GET', path: `/v1/embed/${seg(id)}`, auth: false }, opts);
  }

  /** The iframe snippet for a stream's `embed_url`. */
  iframe(embedUrl: string, opts: { title?: string } = {}): string {
    const title = (opts.title ?? 'Live stream').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    const src = embedUrl.replace(/"/g, '%22');
    return `<iframe src="${src}" title="${title}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="aspect-ratio:16/9;width:100%;border:0"></iframe>`;
  }
}
