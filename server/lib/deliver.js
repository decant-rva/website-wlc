// The two things that happen to a saved quote request: it is posted to the
// GigFriend lead intake, and a notification email goes to the office inbox.
//
// Environment:
//   LEAD_INTAKE_URL      full URL of gigfriend-server's /lead-intake
//   LEAD_INTAKE_SECRET   sent as the X-Lead-Token header
//   POSTMARK_TOKEN       Postmark server token
//   QUOTE_EMAIL_TO       inbox that receives the notification
//   QUOTE_EMAIL_FROM     verified sender address
import { quoteEmail } from './quote-email.js';

const MAX_ATTACH_BYTES = 9 * 1024 * 1024;

export async function postIntake(row, fetchFn = fetch) {
  const url = process.env.LEAD_INTAKE_URL;
  const secret = process.env.LEAD_INTAKE_SECRET;
  if (!url || !secret) throw new Error('lead intake is not configured');
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Lead-Token': secret },
    // The field names gigfriend-server already accepts.
    body: JSON.stringify({
      name: row.name, email: row.email, howDidYouFindUs: row.referral, eventDate: row.event_date,
      venue: row.venue, details: row.details, submittedAt: row.submitted_on,
    }),
  });
  if (!res.ok) throw new Error(`lead intake answered ${res.status}`);
}

export async function sendEmail(row, files, fetchFn = fetch) {
  const token = process.env.POSTMARK_TOKEN;
  const to = process.env.QUOTE_EMAIL_TO;
  const from = process.env.QUOTE_EMAIL_FROM;
  if (!token || !to || !from) throw new Error('notification email is not configured');
  const total = files.reduce((n, f) => n + f.bytes.length, 0);
  const attach = total <= MAX_ATTACH_BYTES ? files : [];
  const { subject, text, html } = quoteEmail(row, files, attach.length === files.length);
  const res = await fetchFn('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'X-Postmark-Server-Token': token },
    body: JSON.stringify({
      From: from, To: to, ReplyTo: row.email, Subject: subject, TextBody: text, HtmlBody: html, MessageStream: 'outbound',
      Attachments: attach.map((f) => ({ Name: f.filename, Content: Buffer.from(f.bytes).toString('base64'), ContentType: f.mime })),
    }),
  });
  if (!res.ok) throw new Error(`email provider answered ${res.status}`);
}

export async function sendAlert(stuck, fetchFn = fetch) {
  const token = process.env.POSTMARK_TOKEN;
  const to = process.env.QUOTE_EMAIL_TO;
  const from = process.env.QUOTE_EMAIL_FROM;
  if (!token || !to || !from) throw new Error('notification email is not configured');
  const lines = stuck.map((s) => `#${s.id} ${s.name}: ${s.last_error || 'no error recorded'}`).join('\n');
  const res = await fetchFn('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'X-Postmark-Server-Token': token },
    body: JSON.stringify({
      From: from, To: to, MessageStream: 'outbound',
      Subject: `Website quote requests not delivered: ${stuck.length}`,
      TextBody: `These quote requests are saved on the website but have not reached GigFriend or the inbox after an hour.\n\n${lines}\n\nThey are still being retried.`,
    }),
  });
  if (!res.ok) throw new Error(`email provider answered ${res.status}`);
}

// Wait before try n: 1, 2, 4, 8 ... minutes, capped at an hour.
export const backoff = (attempts) => Math.min(60, 2 ** attempts) * 60 * 1000;

/** Runs whatever is still owed for one submission and records the outcome. */
export async function deliver(store, id, { intake = postIntake, email = sendEmail, now = () => new Date() } = {}) {
  const found = await store.load(id);
  if (!found) return;
  const { row, files } = found;
  let intakeState = row.intake_state;
  let emailState = row.email_state;
  const errors = [];
  if (intakeState !== 'sent') {
    try { await intake(row); intakeState = 'sent'; } catch (e) { intakeState = 'failed'; errors.push(`intake: ${e.message}`); }
  }
  if (emailState !== 'sent') {
    try { await email(row, files); emailState = 'sent'; } catch (e) { emailState = 'failed'; errors.push(`email: ${e.message}`); }
  }
  await store.record(id, { intake: intakeState, email: emailState, error: errors.join('; '), nextTryAt: new Date(now().getTime() + backoff(row.attempts)) });
}

/** One pass of the retry worker. */
export async function retryPass(store, opts = {}) {
  const now = (opts.now || (() => new Date()))();
  for (const id of await store.due(now)) await deliver(store, id, opts);
  const stuck = await store.stuck(now);
  if (stuck.length) {
    try { await (opts.alert || sendAlert)(stuck); await store.markAlerted(stuck.map((s) => s.id)); } catch { /* tried again on the next pass */ }
  }
}
