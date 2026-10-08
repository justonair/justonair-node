/**
 * Friendly names for the API's shapes. Everything here comes from the OpenAPI
 * spec (src/generated/openapi.ts, `npm run generate`), so the SDK cannot drift
 * from the API it talks to.
 */
import type { components, operations } from './generated/openapi.js';

type Schemas = components['schemas'];

export type Stream = Schemas['Stream'];
/** A stream plus its secrets (`stream_key`, `whip_url`). Only returned by create and key replacement. */
export type CreatedStream = Schemas['CreatedStream'];
export type StreamList = Schemas['StreamList'];
export type StreamStatus = Stream['status'];
export type StreamProfile = Stream['profile'];
export type PlayerSettings = Schemas['PlayerSettings'];
export type ThumbnailSettings = Schemas['ThumbnailSettings'];
export type Thumbnail = Schemas['Thumbnail'];
export type ChatSettings = Schemas['ChatSettings'];
export type ChatState = Schemas['ChatState'];
export type ViewerSession = Schemas['ViewerSession'];
export type ChatMessage = Schemas['ChatMessage'];
export type ChatRead = Schemas['ChatRead'];
export type ChatOwnerMessage = Schemas['ChatOwnerMessage'];
export type ChatFeed = Schemas['ChatFeed'];
export type ChatBan = Schemas['ChatBan'];
export type ChatBanList = Schemas['ChatBanList'];
export type ChatWords = Schemas['ChatWords'];
export type ChatModerator = Schemas['ChatModerator'];
export type ChatModeratorList = Schemas['ChatModeratorList'];
/** The reaction emoji: ❤️ 👏 😂 🔥 🎉 😮. */
export type Reaction = 'heart' | 'clap' | 'laugh' | 'fire' | 'party' | 'wow';
export type ReactionCounts = Partial<Record<Reaction, number>>;
export type Ingest = NonNullable<Schemas['Ingest']>;
export type Recording = NonNullable<Schemas['Recording']>;
export type RecordingStatus = Recording['status'];
export type StreamCost = Schemas['Cost'];
export type Viewers = Schemas['Viewers'];
export type ViewerSeries = Schemas['ViewerSeries'];
export type PlaybackToken = Schemas['PlaybackToken'];
export type RecordingDownload = Schemas['RecordingDownload'];
export type Embed = Schemas['Embed'];
export type EmbedStatus = Embed['status'];
export type Usage = Schemas['Usage'];
export type UsageDay = Usage['days'][number];
export type NotificationSettings = Schemas['NotificationSettings'];
export type WebhookEndpoint = Schemas['WebhookEndpoint'];
export type WebhookEndpointList = Schemas['WebhookEndpointList'];
export type WebhookDelivery = Schemas['WebhookDelivery'];
export type WebhookDeliveryList = Schemas['WebhookDeliveryList'];
export type WebhookEvent = Schemas['WebhookEvent'];
export type WebhookEventType = WebhookEvent['type'];
export type ApiErrorBody = Schemas['Error'];

type JsonBody<Op> = Op extends { requestBody?: { content: { 'application/json': infer B } } } ? B : never;
type Query<Op> = Op extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;

export type StreamCreateParams = Schemas['CreateStreamRequest'];
export type StreamUpdateParams = Schemas['UpdateStreamRequest'];
export type StreamListParams = Query<operations['listStreams']>;
export type PlaybackTokenParams = NonNullable<JsonBody<operations['createPlaybackToken']>>;
export type RecordingDownloadParams = NonNullable<JsonBody<operations['downloadRecording']>>;
export type UsageParams = Query<operations['getUsage']>;
export type NotificationSettingsUpdateParams = JsonBody<operations['updateNotificationSettings']>;
export type WebhookEndpointCreateParams = JsonBody<operations['createWebhookEndpoint']>;
export type WebhookEndpointUpdateParams = JsonBody<operations['updateWebhookEndpoint']>;
export type WebhookDeliveryListParams = Query<operations['listWebhookDeliveries']>;
export type ChatFeedParams = Query<operations['getChatFeed']>;
export type ChatPostParams = JsonBody<operations['postChatAsOwner']>;
export type ChatStateParams = JsonBody<operations['updateChatState']>;
export type ChatBanParams = JsonBody<operations['banChatViewer']>;
export type ChatModeratorParams = JsonBody<operations['createChatModerator']>;
export type ViewerPostParams = JsonBody<operations['postChatMessage']>;
