// The notification the office receives for each quote request, laid out like
// the request form on the website: how far off the event is, the service tiles
// with the chosen ones lit, each answer in its own box, then the photos.
//
// Subject and field labels match the email the previous site sent, so inbox
// filters and the Gmail lead parser keep working. The plain-text part is the
// same label-and-value list as before.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAVY = '#141C40';
const AMBER = '#FFB627';
const MIST = '#EEF2FB';
const SLATE = '#4A5578';
const LINE = '#141C40';
const F = 'font-family:Arial,Helvetica,sans-serif;';

// Every service on the form, in form order. Set at start-up from the built quote page.
let ALL_SERVICES = [];
export const setServiceList = (list) => { ALL_SERVICES = list; };

const label = (t) => `<span style="${F}display:block;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;color:${SLATE}">${esc(t)}</span>`;
// html: ready-made markup for the value, used where the plain text needs its own link styling.
const cell = (k, v, right, html) => `<td width="50%" style="width:50%;vertical-align:top;padding:12px 14px 14px;border-bottom:2px solid ${LINE};${right ? `border-left:1px solid ${LINE};` : ''}">${label(k)}<span style="${F}display:block;padding-top:6px;font-size:16px;line-height:1.5;color:${NAVY};word-break:break-word">${html || esc(v) || '&nbsp;'}</span></td>`;
// Two answers side by side. The pair stays side by side on a phone; long values wrap.
const pair = (a, b) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>${cell(a[0], a[1], false, a[2])}${cell(b[0], b[1], true, b[2])}</tr></table>`;
// Mail apps turn a bare address into a blue link. Giving it our own link keeps it navy like the other answers.
const addressLink = (email) => `<a href="mailto:${esc(email)}" style="color:${NAVY};text-decoration:none">${esc(email)}</a>`;
const box = (k, v) => `<div style="padding:12px 14px 14px;border-bottom:2px solid ${LINE}">${label(k)}<span style="${F}display:block;padding-top:6px;font-size:16px;line-height:1.5;color:${NAVY};white-space:pre-wrap">${esc(v) || '&nbsp;'}</span></div>`;

// Each service belongs to a group with its own colour, the same ones the website uses:
// lights blue, decor green, AV red, drapes magenta. [full colour, pale tint for an unchosen tile]
const GROUP_COLOUR = { li: ['#5E93FB', '#CFDFFE'], de: ['#2FBF71', '#C1ECD4'], av: ['#E5383B', '#F7C3C4'], dr: ['#D6249F', '#F3BDE2'] };
const GROUP = { Drapes: 'dr', 'Silk Florals & Trees': 'de', Decor: 'de', 'LED Dance Floor': 'de', Video: 'av', 'Live Audio': 'av', 'Special Effects': 'av' };
const colourOf = (name) => GROUP_COLOUR[GROUP[name] || 'li'];

function tiles(chosen) {
  const names = [...new Set([...ALL_SERVICES, ...chosen])];
  if (!names.length) return '';
  // Four tiles to a row on a computer, three on a phone, each row filling the width:
  // a quarter of the row wide, but never narrower than 100px.
  const cell = (n) => {
    const on = chosen.includes(n);
    const [full, pale] = colourOf(n);
    // Every tile is the same height, tall enough for a two-line name, with the name centred in it.
    const look = on
      ? `background:#ffffff;color:${NAVY};border:2px solid ${NAVY};border-top:6px solid ${full}`
      : `background:${MIST};color:#8A93AE;border:2px solid ${MIST};border-top:6px solid ${pale}`;
    return `<span style="display:inline-block;vertical-align:top;width:25%;min-width:100px"><span style="display:block;margin:3px"><span style="display:table;width:100%;height:58px;table-layout:fixed;border-collapse:separate"><span style="${F}display:table-cell;height:58px;padding:0 4px;vertical-align:middle;text-align:center;font-size:12px;line-height:15px;font-weight:bold;box-sizing:border-box;${look}">${esc(n)}</span></span></span></span>`;
  };
  return `<div style="padding:14px 14px 11px;border-bottom:2px solid ${LINE}">${label(`Services (${chosen.length} chosen)`)}<div style="margin:5px -3px 0;font-size:0">${names.map(cell).join('')}</div></div>`;
}

// The owner's "When to book" scale: months before the event, what to expect, bars lit out of six.
// The scale has no entry for 1 to 2 months; that range is shown as "Unlikely".
const WINDOWS = [[12, '12 months or more', 'Certain', 6], [9, '9 to 12 months', 'Almost certain', 5], [6, '6 to 9 months', 'Likely', 4],
  [3, '3 to 6 months', 'No custom order, dates spotty', 3], [1, '1 to 3 months', 'Unlikely', 2], [0, 'Under 1 month', 'Rarely available. Limited Options', 1]];
const BAR = ['#E5383B', '#D6249F', '#FFB627', '#5E93FB', '#2FBF71', '#2FBF71'];

/** Days from the day the request came in (New York date) to the event. null when there is no usable date. */
export function daysUntil(eventDate, from) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(from || '')) return null;
  return Math.round((Date.parse(`${eventDate}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function tracker(row) {
  const days = daysUntil(row.event_date, row.submitted_on);
  const wrap = (inner) => `<div style="background:${NAVY};padding:14px 14px 16px">${inner}</div>`;
  const line = (t) => `<span style="${F}display:block;font-size:14px;line-height:1.4;color:#C9D3EE">${t}</span>`;
  if (days === null || Number.isNaN(days)) return wrap(line('No event date given'));
  if (days < 0) return wrap(line('The event date given has already passed'));
  const [, range, outlook, lit] = WINDOWS.find(([m]) => days / 30.44 >= m);
  const bars = [0, 1, 2, 3, 4, 5].map((k) => `<span style="display:inline-block;width:26px;height:10px;margin-right:3px;background:${k < lit ? BAR[lit - 1] : '#3A4780'};font-size:0;line-height:0">&nbsp;</span>`).join('');
  const left = `<span style="${F}font-size:30px;line-height:1;font-weight:bold;color:${AMBER}">${days}</span><span style="${F}font-size:15px;color:#ffffff"> ${days === 1 ? 'day' : 'days'} until the event</span>${line(`${range}: ${esc(outlook)}`)}<div style="padding-top:8px;font-size:0">${bars}</div>`;
  // The year of the event stands on the right, so next year's and the year after's requests are easy to tell apart.
  const year = row.event_date.slice(0, 4);
  return wrap(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle">${left}</td><td style="vertical-align:middle;text-align:right;white-space:nowrap;padding-left:12px"><span style="${F}font-size:34px;line-height:1;font-weight:bold;color:#ffffff">${year}</span></td></tr></table>`);
}

/**
 * files: [{ filename, mime, bytes }]. inline: the photos are attached and shown in the body by content id.
 * Returns { subject, text, html, cids } where cids[i] is the content id of files[i].
 */
export function quoteEmail(row, files = [], inline = true) {
  const chosen = String(row.services || '').split(',').map((x) => x.trim()).filter(Boolean);
  const fields = [
    ['Name', row.name], ['Email', row.email], ['Referral Source', row.referral], ['Event Date', row.event_date],
    ['Venue', row.venue], ['Vision', row.details],
  ];
  if (chosen.length) fields.push(['Services', chosen.join(', ')]);
  if (files.length) fields.push(['Photos', `${files.length}${inline ? '' : ' (too large to attach, saved on the website)'}`]);
  const subject = `New RFQ: ${row.name} filled out Get a Quote Form`;
  // One "Label: value" line per field, as the Gmail lead parser expects. Later lines of a
  // multi-line answer are indented, so text typed into Vision cannot pose as a label of its own.
  const text = fields.map(([k, v]) => `${k}: ${String(v || '').split(/\r?\n/).join('\n  ')}`).join('\n');
  const cids = files.map((_, i) => `photo${i + 1}@quote`);
  const photos = files.length && inline
    ? `<div style="padding:14px 14px 4px">${label(`Photos (${files.length})`)}${files.map((f, i) => `<img src="cid:${cids[i]}" alt="Photo ${i + 1} from ${esc(row.name)}" width="570" style="display:block;width:100%;max-width:570px;height:auto;margin:10px 0 0;border:0">`).join('')}</div>`
    : (files.length ? `<div style="padding:14px">${label('Photos')}<span style="${F}font-size:14px;color:${NAVY}">${files.length} too large to attach. They are saved on the website.</span></div>` : '');
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:2px solid ${LINE}"><tr><td>`
    + tracker(row)
    + `<div style="padding:16px 14px 14px;border-bottom:2px solid ${LINE}"><span style="${F}display:block;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;color:${SLATE}">Quote request</span><span style="${F}display:block;padding-top:4px;font-size:26px;line-height:1.15;font-weight:bold;color:${NAVY}">${esc(row.name)}</span><span style="display:block;width:56px;height:5px;margin-top:10px;background:${AMBER};font-size:0;line-height:0">&nbsp;</span></div>`
    + tiles(chosen)
    + pair(['Name', row.name], ['Email', row.email, addressLink(row.email)]) + pair(['Event Date', row.event_date], ['Venue', row.venue]) + box('Vision', row.details) + box('Referral Source', row.referral)
    + photos
    + `<div style="padding:16px 14px 18px;background:${MIST}"><a href="mailto:${esc(row.email)}" style="${F}display:inline-block;padding:13px 24px;background:${AMBER};color:${NAVY};font-size:15px;font-weight:bold;text-decoration:none">Reply to ${esc(String(row.name).split(' ')[0])}</a></div>`
    + '</td></tr></table>';
  return { subject, text, html, cids };
}
