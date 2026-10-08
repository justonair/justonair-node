import { describe, expect, it } from 'vitest';
import JustOnAir, { ConflictError, RateLimitError } from '../src/index.js';
import { apiError, json, mockFetch } from './helpers.js';

const KEY = 'joa_live_test';
const ID = 'str_e1bzk3dxw9z9allei6n7';

const message = (seq: number, over: Record<string, unknown> = {}) => ({
  id: `msg_${String(seq).padStart(20, '0')}`,
  seq,
  nickname: 'Ayşe',
  text: `message ${seq}`,
  role: null,
  created_at: '2026-10-08T12:00:00.000Z',
  session_id: 'vsn_k2m9x0q4b7c1d8e3',
  fingerprint: 'a3f9c1',
  network: '85.105.12.0/24',
  country: 'TR',
  asn: 'Turk Telekom',
  deleted_at: null,
  filtered: false,
  shadow: false,
  cleared: false,
  visible: true,
  ...over,
});

const feed = (messages: ReturnType<typeof message>[], nextAfter: number, hasMore = false) => ({
  object: 'chat_feed',
  stream_id: ID,
  state: 'open',
  slow_mode_seconds: 0,
  effective_slow_mode_seconds: 0,
  slow_mode_auto: false,
  paused: false,
  pinned_message_id: null,
  cleared_at: null,
  moderation_group: null,
  busy: false,
  messages,
  deleted_ids: [],
  next_after: nextAfter,
  has_more: hasMore,
  reactions: { recent: {}, total: {} },
  totals: { messages_posted: messages.length, messages_shown: messages.length },
});

describe('chat (owner)', () => {
  it('feed: GET with the cursor and the key', async () => {
    const { fetch, calls } = mockFetch(json(200, feed([message(1)], 1)));
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    const f = await joa.chat.feed(ID, { after: 0, limit: 50 });
    expect(f.messages[0]!.fingerprint).toBe('a3f9c1');
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url.toString()).toBe(`https://api.justonair.com/v1/streams/${ID}/chat?after=0&limit=50`);
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it('watch: yields each message once, follows next_after, keeps polling', async () => {
    const { fetch, calls } = mockFetch(
      json(200, feed([message(1), message(2)], 2, true)),
      json(200, feed([message(3)], 3)),
      json(200, feed([], 3)),
      json(200, feed([message(4)], 4)),
    );
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    const seen: number[] = [];
    for await (const m of joa.chat.watch(ID, { intervalSeconds: 0 })) {
      seen.push(m.seq);
      if (m.seq === 4) break;
    }
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(calls.map((c) => c.url.searchParams.get('after'))).toEqual(['0', '2', '3', '3']);
  });

  it('watch: stops when the signal aborts', async () => {
    const ctl = new AbortController();
    const { fetch } = mockFetch(json(200, feed([message(1)], 1)));
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    const seen: number[] = [];
    for await (const m of joa.chat.watch(ID, { signal: ctl.signal, intervalSeconds: 60 })) {
      seen.push(m.seq);
      ctl.abort();
    }
    expect(seen).toEqual([1]);
  });

  it('post, delete, update, clear, ban, unban, words: the right method, path and body', async () => {
    const { fetch, calls } = mockFetch(
      json(201, { object: 'chat_message', ...message(5, { role: 'host', nickname: 'Host', session_id: null }) }),
      json(200, message(1, { deleted_at: '2026-10-08T12:01:00.000Z', visible: false })),
      json(200, feed([], 5)),
      json(200, feed([], 5)),
      json(201, { object: 'chat_ban', id: 'ban_1', scope: 'stream', moderation_group: null, session_id: 'vsn_x', fingerprint: 'a3f9c1', nickname: 'Troll', created_at: '2026-10-08T12:00:00.000Z' }),
      json(200, { object: 'chat_ban', id: 'ban_1', deleted: true }),
      json(200, { object: 'chat_words', scope: 'stream', moderation_group: null, words: ['spoiler'], builtin_word_filter: true }),
    );
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    expect((await joa.chat.post(ID, { text: 'Welcome!', role: 'host' })).role).toBe('host');
    await joa.chat.deleteMessage(ID, 'msg_1');
    await joa.chat.update(ID, { slow_mode_seconds: 10, pinned_message_id: null });
    await joa.chat.clear(ID);
    await joa.chat.ban(ID, { message_id: 'msg_1', delete_messages: true });
    await joa.chat.unban(ID, 'ban_1');
    expect((await joa.chat.setWords(ID, ['spoiler'])).words).toEqual(['spoiler']);
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      `POST /v1/streams/${ID}/chat/messages`,
      `DELETE /v1/streams/${ID}/chat/messages/msg_1`,
      `PATCH /v1/streams/${ID}/chat`,
      `POST /v1/streams/${ID}/chat/clear`,
      `POST /v1/streams/${ID}/chat/bans`,
      `DELETE /v1/streams/${ID}/chat/bans/ban_1`,
      `PUT /v1/streams/${ID}/chat/words`,
    ]);
    expect(calls.map((c) => c.body)).toEqual([
      { text: 'Welcome!', role: 'host' },
      undefined,
      { slow_mode_seconds: 10, pinned_message_id: null },
      undefined,
      { message_id: 'msg_1', delete_messages: true },
      undefined,
      { words: ['spoiler'] },
    ]);
  });

  it('moderators: invite, list, remove', async () => {
    const mod = { object: 'chat_moderator', id: 'mod_1', name: 'Mert', scope: 'stream', moderation_group: null, status: 'invited', invite_expires_at: '2026-10-15T12:00:00.000Z', redeemed_at: null, revoked_at: null, last_seen_at: null, created_at: '2026-10-08T12:00:00.000Z' };
    const { fetch, calls } = mockFetch(
      json(201, { ...mod, invite_url: `https://play.joacdn.com/${ID}/chat#mod=inv_x` }),
      json(200, { object: 'list', data: [mod], has_more: false }),
      json(200, { ...mod, status: 'revoked' }),
    );
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    expect((await joa.chat.inviteModerator(ID, 'Mert')).invite_url).toContain('#mod=');
    expect((await joa.chat.listModerators(ID)).data[0]!.name).toBe('Mert');
    expect((await joa.chat.removeModerator(ID, 'mod_1')).status).toBe('revoked');
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      `POST /v1/streams/${ID}/chat/moderators`,
      `GET /v1/streams/${ID}/chat/moderators`,
      `DELETE /v1/streams/${ID}/chat/moderators/mod_1`,
    ]);
    expect(calls[0]!.body).toEqual({ name: 'Mert' });
  });

  it('chat_not_enabled is a ConflictError', async () => {
    const { fetch } = mockFetch(apiError(409, 'chat_not_enabled', 'Chat was never turned on'));
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    const err = await joa.chat.clear(ID).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe('chat_not_enabled');
  });

  it('streams.create passes chat settings through', async () => {
    const { fetch, calls } = mockFetch(json(201, { id: ID }));
    const joa = new JustOnAir({ apiKey: KEY, fetch });
    await joa.streams.create({ chat: { enabled: true, reactions: true, moderation_group: 'host-42' } });
    expect(calls[0]!.body).toEqual({ chat: { enabled: true, reactions: true, moderation_group: 'host-42' } });
  });
});

describe('chat (public, no key)', () => {
  it('session, read and post send no key', async () => {
    const { fetch, calls } = mockFetch(
      json(201, { object: 'viewer_session', token: 'vs1.x', session_id: 'vsn_x', u: 0.42, expires_at: '2026-10-09T12:00:00.000Z' }),
      json(200, { object: 'chat', stream_id: ID, state: 'open', messages: [] }),
      json(201, { object: 'chat_message', id: 'msg_1', nickname: 'Ayşe', text: 'hi', role: null, created_at: '2026-10-08T12:00:00.000Z' }),
    );
    const joa = new JustOnAir({ apiKey: undefined, fetch });
    const s = await joa.embed.session(ID);
    await joa.embed.chat(ID);
    await joa.embed.postMessage(ID, { token: s.token, nickname: 'Ayşe', text: 'hi' });
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      `POST /v1/embed/${ID}/session`,
      `GET /v1/embed/${ID}/chat`,
      `POST /v1/embed/${ID}/chat/messages`,
    ]);
    for (const c of calls) expect(c.headers.authorization).toBeUndefined();
    expect(calls[2]!.body).toEqual({ token: 'vs1.x', nickname: 'Ayşe', text: 'hi' });
  });

  it('react: one batch in the query, counts capped at 10, nothing sent for nothing', async () => {
    const { fetch, calls } = mockFetch(new Response(null, { status: 204 }));
    const joa = new JustOnAir({ apiKey: undefined, fetch });
    await joa.embed.react(ID, 'vs1.x', { heart: 3, fire: 25, wow: 0 });
    await joa.embed.react(ID, 'vs1.x', {});
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.searchParams.get('t')).toBe('vs1.x');
    expect(calls[0]!.url.searchParams.get('r')).toBe('heart:3,fire:10');
  });

  it('slow mode is a RateLimitError with retry_after_seconds, and is not retried', async () => {
    const { fetch, calls } = mockFetch(apiError(429, 'chat_slow_mode', 'Slow mode: wait 7 s', { retry_after_seconds: 7 }));
    const joa = new JustOnAir({ apiKey: undefined, fetch });
    const err = await joa.embed.postMessage(ID, { token: 'vs1.x', nickname: 'Ayşe', text: 'again' }).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.details).toEqual({ retry_after_seconds: 7 });
    expect(calls).toHaveLength(1);
  });
});
