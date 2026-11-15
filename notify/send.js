// Sends the scheduled push notification to the phone.
// The workflow runs at several UTC times so it covers both summer and winter time;
// this script only sends when the phone's local time is inside the right window.
const webpush = require('web-push');

const sub = JSON.parse(process.env.PUSH_SUBSCRIPTION || 'null');
if (!sub || !sub.endpoint) { console.log('No PUSH_SUBSCRIPTION secret yet. Nothing to send.'); process.exit(0); }
const tz = sub.tz || 'Europe/Madrid';
delete sub.tz;

const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date()).map(p => [p.type, p.value]));
const mins = Number(parts.hour) * 60 + Number(parts.minute);
const between = (a, b) => mins >= a && mins <= b;

let kind = process.env.KIND || '';
if (!kind) {
  if (parts.weekday === 'Mon' && between(6 * 60 + 25, 7 * 60 + 20)) kind = 'weigh';   // aim 6:30
  else if (between(19 * 60 + 55, 20 * 60 + 50)) kind = 'daily';                        // aim 20:00
}
console.log(`Local time in ${tz}: ${parts.weekday} ${parts.hour}:${parts.minute} -> ${kind || 'nothing to send'}`);
if (!kind) process.exit(0);

webpush.setVapidDetails('https://romipa24.github.io/non-negotiables/', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
webpush.sendNotification(sub, JSON.stringify({ kind }), { TTL: 3 * 3600, urgency: 'high' })
  .then(r => console.log('Sent', kind, r.statusCode))
  .catch(e => {
    console.error('Push failed', e.statusCode, e.body || e.message);
    if (e.statusCode === 404 || e.statusCode === 410) console.error('The phone subscription has expired: re-enable notifications in the app and update the PUSH_SUBSCRIPTION secret.');
    process.exit(1);
  });
