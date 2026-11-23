// Data the website and the quote notification email must agree on. The build
// (src/lib/templates.js) and the server (server/lib/quote-email.js) both import
// this file, so it lives under server/: the runtime image only copies server/.

/** Colour group of each service: lights blue (li, the default), decor green, AV red, drapes magenta. */
export const SERVICE_GROUP = {
  Drapes: 'dr', 'Silk Florals & Trees': 'de', Decor: 'de', 'LED Dance Floor': 'de',
  Video: 'av', 'Live Audio': 'av', 'Special Effects': 'av',
};
export const serviceGroup = (name) => SERVICE_GROUP[name] || 'li';

/** Email-safe colours for each group: [full colour, pale tint for an unchosen tile]. */
export const GROUP_COLOUR = { li: ['#5E93FB', '#CFDFFE'], de: ['#2FBF71', '#C1ECD4'], av: ['#E5383B', '#F7C3C4'], dr: ['#D6249F', '#F3BDE2'] };

/**
 * The owner's "When to book" scale, wording supplied 22 November 2026.
 *   months      lower bound in months before the event, used by the email to place a request
 *   label       the row's wording on the quote page
 *   emailLabel  the row's wording in the notification email, where it differs from the page
 *   outlook     what to expect
 *   bars        bars lit out of six
 *
 * The page and the email disagree on two rows, kept as they were:
 * - The scale has no row for 1 to 2 months. The page says "2 to 3 months"; the email puts
 *   everything from 1 to 3 months in that row and says so. The owner has to decide which.
 * - The page says "< 1 Month", the email "Under 1 month".
 */
export const BOOKING_SCALE = [
  { months: 12, label: '12 months or more', outlook: 'Certain', bars: 6 },
  { months: 9, label: '9 to 12 months', outlook: 'Almost certain', bars: 5 },
  { months: 6, label: '6 to 9 months', outlook: 'Likely', bars: 4 },
  { months: 3, label: '3 to 6 months', outlook: 'No custom order, dates spotty', bars: 3 },
  { months: 1, label: '2 to 3 months', emailLabel: '1 to 3 months', outlook: 'Unlikely', bars: 2 },
  { months: 0, label: '< 1 Month', emailLabel: 'Under 1 month', outlook: 'Rarely available. Limited Options', bars: 1 },
];

/** Email sign-up form, used on /subscribe and the catalog page. Posts to /api/subscribe (not built yet). */
export const SUBSCRIBE_FORM = '<form class="quote subscribe" action="/api/subscribe" method="post"><p><label for="s-email">Email</label><input id="s-email" name="email" type="email" autocomplete="email" required></p><p class="trap" aria-hidden="true"><label for="s-extra">Leave this empty</label><input id="s-extra" name="qz_extra" tabindex="-1" autocomplete="off"></p><p><button class="btn solid" type="submit">Subscribe</button></p></form>';
