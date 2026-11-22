// The two things that happen to a saved quote request: it is posted to the
// GigFriend lead intake, and a notification email goes to the office inbox.
//
// The email goes out through the Google Workspace SMTP relay, signed in as a
// Workspace user with an app password.
//
// Environment:
//   LEAD_INTAKE_URL      full URL of gigfriend-server's /lead-intake
//   LEAD_INTAKE_SECRET   sent as the X-Lead-Token header
//   SMTP_USER            Workspace address the site signs in as
//   SMTP_PASS            app password for that address
//   SMTP_HOST            default smtp-relay.gmail.com
//   SMTP_PORT            default 587 (STARTTLS)
//   QUOTE_EMAIL_FROM     address the notification is sent from (the Workspace user or one of its aliases)
//   QUOTE_EMAIL_TO       inbox that receives the notification
import nodemailer from 'nodemailer';
import { quoteEmail } from './quote-email.js';

const MAX_ATTACH_BYTES = 9 * 1024 * 1024;

let cached;
/** The SMTP connection, made once. Throws when the relay is not configured. */
function relay() {
  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS || !process.env.QUOTE_EMAIL_TO || !process.env.QUOTE_EMAIL_FROM) throw new Error('notification email is not configured');
  cached ||= nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return cached;
}

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

/** The message for one request, in the shape nodemailer takes. */
export function quoteMessage(row, files, { from, to }) {
  const total = files.reduce((n, f) => n + f.bytes.length, 0);
  const attach = total <= MAX_ATTACH_BYTES ? files : [];
  const { subject, text, html, cids } = quoteEmail(row, files, attach.length === files.length);
  return {
    from: { name: 'Wedding Lighting Co website', address: from },
    to,
    replyTo: { name: row.name, address: row.email },
    subject,
    text,
    html,
    // A content id lets the body show each photo in place; mail apps still list them as attachments.
    attachments: attach.map((f, i) => ({ filename: f.filename, content: Buffer.from(f.bytes), contentType: f.mime, cid: cids[i] })),
  };
}

export async function sendEmail(row, files, transport) {
  const t = transport || relay();
  await t.sendMail(quoteMessage(row, files, { from: process.env.QUOTE_EMAIL_FROM, to: process.env.QUOTE_EMAIL_TO }));
}

export async function sendAlert(stuck, transport) {
  const t = transport || relay();
  const lines = stuck.map((s) => `#${s.id} ${s.name}: ${s.last_error || 'no error recorded'}`).join('\n');
  await t.sendMail({
    from: { name: 'Wedding Lighting Co website', address: process.env.QUOTE_EMAIL_FROM },
    to: process.env.QUOTE_EMAIL_TO,
    subject: `Website quote requests not delivered: ${stuck.length}`,
    text: `These quote requests are saved on the website but have not reached GigFriend or the inbox after an hour.\n\n${lines}\n\nThey are still being retried.`,
  });
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
