import { seg, type Core, type RequestOptions } from '../core.js';
import type {
  ChatBan,
  ChatBanList,
  ChatBanParams,
  ChatFeed,
  ChatFeedParams,
  ChatModerator,
  ChatModeratorList,
  ChatOwnerMessage,
  ChatPostParams,
  ChatStateParams,
  ChatWords,
} from '../types.js';

export interface WatchOptions extends RequestOptions {
  /** Start after this `seq` (a previous feed's `next_after`). Default 0: from the first message. */
  after?: number;
  /** Seconds between polls while nothing new arrives. Default 2. */
  intervalSeconds?: number;
}

/**
 * Viewer chat and reactions on your streams (beta): the feed, posting as host
 * or moderator, and moderation. Turn chat on with `chat: { enabled: true }`
 * on `streams.create` or `streams.update`. See https://docs.justonair.com/chat.
 */
export class Chat {
  constructor(private readonly core: Core) {}

  /**
   * Every message after a cursor (deleted, filtered and shadow-banned ones
   * too, with what is known about the sender), the live state and reaction
   * totals. Pass the previous answer's `next_after` as `after`.
   */
  feed(streamId: string, params: ChatFeedParams = {}, opts?: RequestOptions): Promise<ChatFeed> {
    return this.core.request({ method: 'GET', path: `/v1/streams/${seg(streamId)}/chat`, query: params }, opts);
  }

  /**
   * Polls the feed and yields each message once, oldest first, until you
   * `break` or abort `opts.signal`:
   *
   * ```ts
   * for await (const m of joa.chat.watch(id)) console.log(m.nickname, m.text);
   * ```
   */
  async *watch(streamId: string, opts: WatchOptions = {}): AsyncGenerator<ChatOwnerMessage> {
    const { after: start = 0, intervalSeconds = 2, ...requestOpts } = opts;
    let after = start;
    while (!requestOpts.signal?.aborted) {
      const page = await this.feed(streamId, { after, limit: 500 }, requestOpts);
      for (const m of page.messages) yield m;
      after = page.next_after;
      if (!page.has_more) await sleep(intervalSeconds * 1000, requestOpts.signal);
    }
  }

  /** Post with a Host (default) or Moderator badge viewers cannot fake. Links allowed; works while paused. */
  post(streamId: string, params: ChatPostParams, opts?: RequestOptions): Promise<ChatOwnerMessage> {
    return this.core.request({ method: 'POST', path: `/v1/streams/${seg(streamId)}/chat/messages`, body: params }, opts);
  }

  /** Hide a message from everyone (within about 2 s). It stays in your feed with `deleted_at`. */
  deleteMessage(streamId: string, messageId: string, opts?: RequestOptions): Promise<ChatOwnerMessage> {
    return this.core.request(
      { method: 'DELETE', path: `/v1/streams/${seg(streamId)}/chat/messages/${seg(messageId)}` },
      opts,
    );
  }

  /** Slow mode (`slow_mode_seconds`, 0 = off), `paused`, and `pinned_message_id` (null unpins). */
  update(streamId: string, params: ChatStateParams, opts?: RequestOptions): Promise<ChatFeed> {
    return this.core.request({ method: 'PATCH', path: `/v1/streams/${seg(streamId)}/chat`, body: params }, opts);
  }

  /** Hide every message posted so far, and the pin. */
  clear(streamId: string, opts?: RequestOptions): Promise<ChatFeed> {
    return this.core.request({ method: 'POST', path: `/v1/streams/${seg(streamId)}/chat/clear`, retrySafe: true }, opts);
  }

  /**
   * Shadow-ban a viewer by one of their messages or their session: their
   * session and their address. Scope: the stream's moderation group, else the
   * stream. `delete_messages: true` also deletes what they posted on this stream.
   */
  ban(streamId: string, params: ChatBanParams, opts?: RequestOptions): Promise<ChatBan> {
    return this.core.request(
      { method: 'POST', path: `/v1/streams/${seg(streamId)}/chat/bans`, body: params, retrySafe: true },
      opts,
    );
  }

  unban(streamId: string, banId: string, opts?: RequestOptions): Promise<{ object: 'chat_ban'; id: string; deleted: true }> {
    return this.core.request({ method: 'DELETE', path: `/v1/streams/${seg(streamId)}/chat/bans/${seg(banId)}` }, opts);
  }

  listBans(streamId: string, opts?: RequestOptions): Promise<ChatBanList> {
    return this.core.request({ method: 'GET', path: `/v1/streams/${seg(streamId)}/chat/bans` }, opts);
  }

  /** Your word list (the moderation group's, when the stream has one). */
  getWords(streamId: string, opts?: RequestOptions): Promise<ChatWords> {
    return this.core.request({ method: 'GET', path: `/v1/streams/${seg(streamId)}/chat/words` }, opts);
  }

  /**
   * Invite a moderator: the answer's `invite_url` (shown only now) works once.
   * Whoever opens it moderates from the hosted chat page with a Moderator
   * badge: delete, ban, pin, slow mode, pause. No API key reaches them.
   */
  inviteModerator(streamId: string, name: string, opts?: RequestOptions): Promise<ChatModerator> {
    return this.core.request({ method: 'POST', path: `/v1/streams/${seg(streamId)}/chat/moderators`, body: { name } }, opts);
  }

  listModerators(streamId: string, opts?: RequestOptions): Promise<ChatModeratorList> {
    return this.core.request({ method: 'GET', path: `/v1/streams/${seg(streamId)}/chat/moderators` }, opts);
  }

  /** Their link and session stop working at once. */
  removeModerator(streamId: string, moderatorId: string, opts?: RequestOptions): Promise<ChatModerator> {
    return this.core.request({ method: 'DELETE', path: `/v1/streams/${seg(streamId)}/chat/moderators/${seg(moderatorId)}` }, opts);
  }

  /** Replace your word list: words and phrases, whole words, any case. Up to 500. */
  setWords(streamId: string, words: string[], opts?: RequestOptions): Promise<ChatWords> {
    return this.core.request({ method: 'PUT', path: `/v1/streams/${seg(streamId)}/chat/words`, body: { words } }, opts);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}
