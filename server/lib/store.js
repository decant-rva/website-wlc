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
  };
}
