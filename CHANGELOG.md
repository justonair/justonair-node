# Changelog

## 0.4.0 (2026-10-09)

`chat.inviteModerator(id, { name, active_days })`: choose how long a moderator stays one after opening their link (1-30 days, default 30). Moderators carry `active_days` and `active_until`. Passing just a name still works. Types regenerated from the OpenAPI spec.

## 0.3.0 (2026-10-08)

Chat moderators: `chat.inviteModerator` (a single-use link), `chat.listModerators`, `chat.removeModerator`. `player.allowed_domains` on streams (the sites allowed to embed the player and chat, and to post to chat). Chat messages and bans say who acted (`deleted_by`, `created_by`, owner or moderator). Types regenerated from the OpenAPI spec.

## 0.2.0 (2026-10-08)

Viewer chat and reactions (beta): `joa.chat` with `feed`, `watch` (an async iterator over new messages), `post` (Host or Moderator badge), `deleteMessage`, `update` (slow mode, pause, pin), `clear`, `ban`, `unban`, `listBans`, `getWords`, `setWords`; `chat` settings on `streams.create` and `streams.update`. Public calls for your own chat UI, no key needed: `embed.session`, `embed.chat`, `embed.postMessage`, `embed.react`. Types regenerated from the OpenAPI spec, which also brings the thumbnail settings (`thumbnail` on streams, `poster_url` on the embed read).

## 0.1.0 (2026-09-30)

First release: streams (create with automatic idempotency, get, list, listAll, update, end, replaceKey, playbackToken, viewers), recordings (download, delete, waitUntilReady), webhook endpoints and deliveries, webhook verification (Standard Webhooks, Web Crypto), usage, notification settings, the public embed read and the iframe snippet. Typed from the OpenAPI spec. Retries with backoff for network errors, 5xx and `rate_limited`; typed errors with the API's stable codes.
