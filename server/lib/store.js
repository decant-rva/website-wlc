// Postgres storage for quote submissions. Takes anything with a pg-style
// query(text, params) method, so tests can pass an in-memory database. A request
// and its photos are saved in one transaction (see inTransaction).
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(import.meta.dirname, '..', '..', 'migrations');

/** How long a delivery may run before another worker may take the request over. */
export const LEASE_MS = 10 * 60 * 1000;

/**
 * Applies each file in migrations/ once, in name order, and records it in schema_migrations.
 * 001 was applied on every start before this table existed; it is written to be safe to repeat.
 */
export async function migrate(db) {
  // Two machines starting together take turns. (The in-memory test database has no advisory locks.)
  const locked = await db.query('SELECT pg_advisory_lock(7239001)').then(() => true, () => false);
  try {
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      await db.query(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [file]);
    }
  } finally {
    if (locked) await db.query('SELECT pg_advisory_unlock(7239001)').catch(() => {});
  }
}

export function quoteStore(db) {
  /**
   * Runs fn inside BEGIN/COMMIT. A pg Pool lends one of its connections for it; a single
   * connection (pg Client, the in-memory test database) is used as it is. Neon's HTTP driver
   * (tools/db-check.js --http) has no session to hold a transaction, so there fn runs as is.
   */
  async function inTransaction(fn) {
    const pool = 'totalCount' in db;
    if (!pool && !('connection' in db)) return fn(db);
    const client = pool ? await db.connect() : db;
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (pool) client.release();
    }
  }

  return {
    /**
     * Saves a request and its photos together. The row starts out leased for LEASE_MS, so the
     * retry worker leaves it alone while the request's own first delivery runs.
     */
    async save(s, files, now = new Date()) {
      return inTransaction(async (c) => {
        const { rows } = await c.query(
          `INSERT INTO quote_submissions (submitted_on, name, email, event_date, referral, venue, details, services, ip, next_try_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [s.submittedAt, s.name, s.email, s.eventDate, s.howDidYouFindUs, s.venue, s.details, s.services.join(', '), s.ip,
            new Date(now.getTime() + LEASE_MS)],
        );
        const id = rows[0].id;
        for (const f of files) {
          await c.query('INSERT INTO quote_files (submission_id, filename, mime, bytes) VALUES ($1,$2,$3,$4)', [id, f.filename, f.mime, f.bytes]);
        }
        return id;
      });
    },
    async load(id) {
      const { rows } = await db.query('SELECT * FROM quote_submissions WHERE id = $1', [id]);
      if (!rows[0]) return null;
      const files = await db.query('SELECT filename, mime, bytes FROM quote_files WHERE submission_id = $1 ORDER BY id', [id]);
      return { row: rows[0], files: files.rows };
    },
    /** Submissions with a delivery still owed and due for another try. */
    async due(now = new Date()) {
      const { rows } = await db.query(
        `SELECT id FROM quote_submissions
         WHERE (intake_state <> 'sent' OR email_state <> 'sent') AND next_try_at <= $1 ORDER BY id LIMIT 20`, [now]);
      return rows.map((r) => r.id);
    },
    /**
     * Takes the lease on one due submission. Only one caller can win: the update re-checks
     * next_try_at under the row lock, so a second machine or an overlapping pass gets false.
     */
    async claim(id, now = new Date()) {
      const { rows } = await db.query(
        `UPDATE quote_submissions SET next_try_at = $3
         WHERE id = $1 AND next_try_at <= $2 AND (intake_state <> 'sent' OR email_state <> 'sent') RETURNING id`,
        [id, now, new Date(now.getTime() + LEASE_MS)]);
      return rows.length === 1;
    },
    /** Records one step as done, the moment it is done, without touching the other step. */
    async markSent(id, step) {
      const column = step === 'intake' ? 'intake_state' : 'email_state';
      await db.query(`UPDATE quote_submissions SET ${column} = 'sent' WHERE id = $1`, [id]);
    },
    /** Records the outcome of an attempt that left something undelivered, and when to try again. */
    async recordFailure(id, { intake, email, error, nextTryAt }) {
      await db.query(
        `UPDATE quote_submissions SET
           intake_state = CASE WHEN intake_state = 'sent' THEN 'sent' ELSE $2 END,
           email_state = CASE WHEN email_state = 'sent' THEN 'sent' ELSE $3 END,
           last_error = $4, attempts = attempts + 1, next_try_at = $5 WHERE id = $1`,
        [id, intake, email, error || '', nextTryAt]);
    },
    /** Counts an attempt that delivered everything still owed. */
    async recordSuccess(id) {
      await db.query("UPDATE quote_submissions SET attempts = attempts + 1, last_error = '' WHERE id = $1", [id]);
    },
    /** Submissions still undelivered an hour after they came in, not yet reported. */
    async stuck(now = new Date()) {
      const { rows } = await db.query(
        `SELECT id, name, last_error FROM quote_submissions
         WHERE (intake_state <> 'sent' OR email_state <> 'sent') AND alerted = false AND created_at <= $1`,
        [new Date(now.getTime() - 60 * 60 * 1000)]);
      return rows;
    },
    async markAlerted(ids) {
      for (const id of ids) await db.query('UPDATE quote_submissions SET alerted = true WHERE id = $1', [id]);
    },
    /** Every submission with a delivery still owed, oldest first, for the daily summary. */
    async undelivered() {
      const { rows } = await db.query(
        `SELECT id, name, created_at, intake_state, email_state, last_error FROM quote_submissions
         WHERE intake_state <> 'sent' OR email_state <> 'sent' ORDER BY id`);
      return rows;
    },
    /** Counts for the delivery status endpoint. */
    async status(now = new Date()) {
      const { rows } = await db.query(
        `SELECT id, created_at, intake_state, email_state FROM quote_submissions
         WHERE intake_state <> 'sent' OR email_state <> 'sent'`);
      const oldest = rows.reduce((m, r) => Math.min(m, new Date(r.created_at).getTime()), Infinity);
      return {
        pending: rows.length,
        failed: rows.filter((r) => r.intake_state === 'failed' || r.email_state === 'failed').length,
        oldestPendingMinutes: rows.length ? Math.max(0, Math.floor((now.getTime() - oldest) / 60000)) : null,
      };
    },
    /**
     * The id of a request from the same person, saved in the last two minutes, with the same
     * name, event date, details and services: a double click or a resubmitted page.
     */
    async findRepeat(s, now = new Date()) {
      const { rows } = await db.query(
        'SELECT id, name, event_date, details, services FROM quote_submissions WHERE email = $1 AND created_at >= $2 ORDER BY id DESC',
        [s.email, new Date(now.getTime() - 2 * 60 * 1000)]);
      const services = s.services.join(', ');
      const same = rows.find((r) => r.name === s.name && r.event_date === s.eventDate && r.details === s.details && r.services === services);
      return same ? same.id : null;
    },
    /** True for the first caller on a given day; later callers (a restart, a second machine) get false. */
    async claimDailySummary(day) {
      // A plain insert: the primary key refuses a second row for the same day.
      try {
        await db.query('INSERT INTO quote_daily_summary (day) VALUES ($1)', [day]);
        return true;
      } catch (e) {
        if (e.code === '23505' || /duplicate|unique/i.test(e.message)) return false;
        throw e;
      }
    },
    /** Gives the day back when the summary could not be sent, so the next pass tries again. */
    async releaseDailySummary(day) {
      await db.query('DELETE FROM quote_daily_summary WHERE day = $1', [day]);
    },
    /**
     * Retention. Only requests delivered both ways are touched; anything still owed is kept.
     * photoDays: drop the stored photos and the visitor's IP address once a request is that old.
     * keepDays: delete the request entirely once it is that old.
     * Returns how many requests each step changed.
     */
    async prune({ photoDays, keepDays }, now = new Date()) {
      const before = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const delivered = "intake_state = 'sent' AND email_state = 'sent' AND created_at < $1";
      const out = { photos: 0, deleted: 0 };
      if (photoDays > 0) {
        const { rows } = await db.query(`SELECT id FROM quote_submissions WHERE ${delivered} AND (ip <> '' OR id IN (SELECT submission_id FROM quote_files))`, [before(photoDays)]);
        for (const { id } of rows) {
          await db.query('DELETE FROM quote_files WHERE submission_id = $1', [id]);
          await db.query("UPDATE quote_submissions SET ip = '' WHERE id = $1", [id]);
        }
        out.photos = rows.length;
      }
      if (keepDays > 0) {
        const { rows } = await db.query(`DELETE FROM quote_submissions WHERE ${delivered} RETURNING id`, [before(keepDays)]);
        out.deleted = rows.length;
      }
      return out;
    },
  };
}
