import type { Core, RequestOptions } from '../core.js';
import type { NotificationSettings, NotificationSettingsUpdateParams, Usage, UsageParams } from '../types.js';

export class UsageResource {
  constructor(private readonly core: Core) {}

  /** Balance, rates, and usage per UTC day (default the last 7 days, up to 90). */
  get(params: UsageParams = {}, opts?: RequestOptions): Promise<Usage> {
    return this.core.request({ method: 'GET', path: '/v1/usage', query: params }, opts);
  }
}

export class Notifications {
  constructor(private readonly core: Core) {}

  /** Which emails the account gets about its credit. */
  get(opts?: RequestOptions): Promise<NotificationSettings> {
    return this.core.request({ method: 'GET', path: '/v1/account/notifications' }, opts);
  }

  /** Send only the fields to change. */
  update(params: NotificationSettingsUpdateParams, opts?: RequestOptions): Promise<NotificationSettings> {
    return this.core.request({ method: 'PATCH', path: '/v1/account/notifications', body: params }, opts);
  }
}

export class Account {
  readonly notifications: Notifications;
  constructor(core: Core) {
    this.notifications = new Notifications(core);
  }
}
