// Sends a scheduled push notification to the phone.
// The workflow passes the cron line that fired (SCHEDULE); each line maps to one kind of notification.
// Times in the workflow are UTC for the phone's time zone (America/Costa_Rica, UTC-6, no DST).
const webpush = require('web-push');

const sub = JSON.parse(process.env.PUSH_SUBSCRIPTION || 'null');
if (!sub || !sub.endpoint) { console.log('No PUSH_SUBSCRIPTION secret yet. Nothing to send.'); process.exit(0); }
const tz = sub.tz || 'America/Costa_Rica';
delete sub.tz;

const KINDS = {
  '27 12 * * 1': 'weigh',               // Monday 6:30
  '57 1 * * *': 'daily',                // every day 20:00
  '42 0-4,12-23 * * *': 'phrase',       // every hour 6:45 .. 22:45, one phrase each
};
let kind = process.env.KIND || KINDS[process.env.SCHEDULE] || '';

const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date()).map(p => [p.type, p.value]));
const hour = Number(parts.hour), minute = Number(parts.minute);
console.log(`Local time in ${tz}: ${parts.weekday} ${parts.hour}:${parts.minute} | schedule "${process.env.SCHEDULE || 'manual'}" -> ${kind || 'nothing'}`);
if (!kind) process.exit(0);

let payload = { kind };
if (kind === 'phrase') {
  const phrases = JSON.parse(process.env.MENTALIDAD || '[]');
  if (!phrases.length) { console.log('No MENTALIDAD secret. Nothing to send.'); process.exit(0); }
  // Slot n is planned for (6+n):45. A run that GitHub delays past the hour still belongs to the previous slot.
  let n = (minute >= 35 ? hour : hour - 1) - 6;
  if (process.env.PHRASE) n = Number(process.env.PHRASE) - 1;
  if (n < 0 || n >= phrases.length) { console.log('Outside the phrase hours. Nothing to send.'); process.exit(0); }
  payload = { kind, n: n + 1, title: '', body: phrases[n] };
  console.log(`Phrase ${n + 1} of ${phrases.length}`);
}

webpush.setVapidDetails('https://romipa24.github.io/non-negotiables/', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
webpush.sendNotification(sub, JSON.stringify(payload), { TTL: kind === 'phrase' ? 3000 : 3 * 3600, urgency: 'high' })
  .then(r => console.log('Sent', kind, r.statusCode))
  .catch(e => {
    console.error('Push failed', e.statusCode, e.body || e.message);
    if (e.statusCode === 404 || e.statusCode === 410) console.error('The phone subscription has expired: re-enable notifications in the app and update the PUSH_SUBSCRIPTION secret.');
    process.exit(1);
  });
