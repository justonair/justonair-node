// Checks the built SDK against the real API with a real key. Costs nothing: the
// stream it creates never goes live and is cancelled at the end.
//   JOA_API_KEY=joa_live_… node scripts/live-check.mjs      (after npm run build)
import JustOnAir, { NotFoundError } from '../dist/index.js';

const joa = new JustOnAir();
let failed = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` - ${extra}` : ''}`);
  if (!ok) failed++;
};

const s = await joa.streams.create({ name: 'SDK live check', profile: 'passthrough', record: false });
check('create', s.status === 'pending' && s.stream_key.startsWith(`${s.id}?key=`) && s.whip_url.includes('direction=whip'), s.id);
try {
  const again = await joa.streams.get(s.id);
  check('get', again.id === s.id && again.cost !== undefined, `cost ${again.cost?.total_usd}`);
  const renamed = await joa.streams.update(s.id, { name: 'SDK live check (renamed)', player: { max_height: 480 } });
  check('update', renamed.name === 'SDK live check (renamed)' && renamed.player.max_height === 480);
  const token = await joa.streams.playbackToken(s.id, { expires_in: 120 });
  check('playbackToken', token.playback_url.includes(s.id));
  const embed = await new JustOnAir({ apiKey: undefined }).embed.get(s.id).catch((e) => e);
  check('embed (no key)', embed.status === 'pending' && embed.max_height === 480, embed.status ?? embed.message);
  const page = await joa.streams.list({ limit: 5 });
  check('list', page.data.some((x) => x.id === s.id));
  const viewers = await joa.streams.viewers(s.id);
  check('viewers', viewers.stream_id === s.id);
  const missing = await joa.streams.get('str_00000000000000000000').catch((e) => e);
  check('NotFoundError', missing instanceof NotFoundError && missing.code === 'not_found');
  const usage = await joa.usage.get({ days: 2 });
  check('usage', typeof usage.available_usd === 'string' && Array.isArray(usage.days), `available ${usage.available_usd}`);
  const notif = await joa.account.notifications.get();
  check('notifications', typeof notif.low_balance_email === 'boolean');
  const hooks = await joa.webhooks.endpoints.list();
  check('webhooks.endpoints.list', Array.isArray(hooks.event_types) && hooks.event_types.includes('stream.live'));
} finally {
  const ended = await joa.streams.end(s.id);
  check('end (cancel)', ended.status === 'cancelled', ended.status);
}
console.log(failed ? `${failed} FAILED` : 'ALL OK');
process.exit(failed ? 1 : 0);
