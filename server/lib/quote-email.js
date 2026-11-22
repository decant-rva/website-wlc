// The notification the office receives for each quote request. Subject and
// field labels match the email the previous site sent, so inbox filters and
// the Gmail lead parser keep working.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function quoteEmail(row, files = [], attached = true) {
  const fields = [
    ['Name', row.name], ['Email', row.email], ['Referral Source', row.referral], ['Event Date', row.event_date],
    ['Venue', row.venue], ['Vision', row.details],
  ];
  if (row.services) fields.push(['Services', row.services]);
  if (files.length) fields.push(['Files', files.map((f) => f.filename).join(', ') + (attached ? '' : ' (too large to attach, saved on the website)')]);
  const subject = `New RFQ: ${row.name} filled out Get a Quote Form`;
  const text = fields.map(([k, v]) => `${k}: ${v || ''}`).join('\n');
  const html = `<table cellpadding="0" cellspacing="0" style="font:15px/1.5 Arial,sans-serif;color:#141C40">${fields.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;vertical-align:top;font-weight:bold;white-space:nowrap">${esc(k)}:</td><td style="padding:4px 0;white-space:pre-wrap">${esc(v || '')}</td></tr>`).join('')}</table>`;
  return { subject, text, html };
}
