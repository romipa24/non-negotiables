// Sends the scheduled push notifications to the phone. Works in any time zone:
// the workflow runs every hour at :27, :42 and :57 (UTC), and this script works out
// the phone's local time from the time zone saved with the notification code.
//   :27 -> Monday 6:30  · weigh-in reminder
//   :42 -> every hour from 6:45 to 22:45 · one mindset phrase each (if MENTALIDAD is set)
//   :57 -> every day 20:00 · habits reminder
const webpush = require('web-push');

const sub = JSON.parse(process.env.PUSH_SUBSCRIPTION || 'null');
if (!sub || !sub.endpoint) { console.log('Todavía no hay PUSH_SUBSCRIPTION. Nada que enviar.'); process.exit(0); }
const tz = sub.tz || 'Europe/Madrid';
delete sub.tz;

// The time this run was scheduled for (GitHub can start it late), so a delay never changes the decision.
const minute = Number((process.env.SCHEDULE || '').split(' ')[0]);
const sched = new Date();
if (Number.isInteger(minute)) {
  if (sched.getUTCMinutes() < minute) sched.setUTCHours(sched.getUTCHours() - 1);
  sched.setUTCMinutes(minute, 0, 0);
}
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(sched).map(p => [p.type, p.value]));
const hour = Number(parts.hour);

let kind = process.env.KIND || '';
let n = null;
if (!kind) {
  if (minute === 27 && parts.weekday === 'Mon' && hour === 6) kind = 'weigh';
  else if (minute === 57 && hour === 19) kind = 'daily';
  else if (minute === 42 && hour >= 6 && hour <= 22) { kind = 'phrase'; n = hour - 6; }
}
console.log(`Hora local (${tz}): ${parts.weekday} ${parts.hour}:${parts.minute} -> ${kind || 'nada que enviar'}`);
if (!kind) process.exit(0);

let payload = { kind };
if (kind === 'phrase') {
  let phrases = [];
  try { phrases = JSON.parse(process.env.MENTALIDAD || '[]'); } catch (e) { console.error('MENTALIDAD no es una lista válida: ["frase 1", "frase 2"]'); process.exit(1); }
  if (process.env.PHRASE) n = Number(process.env.PHRASE) - 1;
  if (n === null) n = 0;
  if (!phrases.length || n < 0 || n >= phrases.length) { console.log('No hay frase para esta hora.'); process.exit(0); }
  payload = { kind, n: n + 1, title: process.env.PHRASE_TITLE || '🧠 MENTE MILLONARIA 💰', body: phrases[n] };
  console.log(`Frase ${n + 1} de ${phrases.length}`);
}

const [owner, repo] = (process.env.GITHUB_REPOSITORY || 'user/app').split('/');
webpush.setVapidDetails(`https://${owner}.github.io/${repo}/`, process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
webpush.sendNotification(sub, JSON.stringify(payload), { TTL: kind === 'phrase' ? 3000 : 3 * 3600, urgency: 'high' })
  .then(r => console.log('Enviado', kind, r.statusCode))
  .catch(e => {
    console.error('Error al enviar', e.statusCode, e.body || e.message);
    if (e.statusCode === 404 || e.statusCode === 410) console.error('El código del móvil ha caducado: vuelve a activar las notificaciones en la app y actualiza PUSH_SUBSCRIPTION.');
    if (e.statusCode === 403) console.error('Las claves no coinciden: VAPID_PUBLIC tiene que ser la misma clave que pusiste en config.js.');
    process.exit(1);
  });
