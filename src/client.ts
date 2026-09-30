import { Core, type ClientOptions } from './core.js';
import { Account, UsageResource } from './resources/account.js';
import { EmbedResource } from './resources/embed.js';
import { Recordings } from './resources/recordings.js';
import { Streams } from './resources/streams.js';
import { Webhooks } from './resources/webhooks.js';

/**
 * The JustOnAir API client.
 *
 * ```ts
 * import JustOnAir from 'justonair';
 * const joa = new JustOnAir(); // reads JOA_API_KEY
 * const stream = await joa.streams.create({ name: 'Town hall' });
 * ```
 */
export class JustOnAir {
  readonly streams: Streams;
  readonly recordings: Recordings;
  readonly webhooks: Webhooks;
  readonly usage: UsageResource;
  readonly account: Account;
  readonly embed: EmbedResource;

  constructor(opts: ClientOptions = {}) {
    const core = new Core(opts);
    this.streams = new Streams(core);
    this.recordings = new Recordings(core);
    this.webhooks = new Webhooks(core);
    this.usage = new UsageResource(core);
    this.account = new Account(core);
    this.embed = new EmbedResource(core);
  }
}
