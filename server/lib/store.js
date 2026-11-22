// Postgres storage for quote submissions. Takes anything with a pg-style
// query(text, params) method, so tests can pass an in-memory database.
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(import.meta.dirname, '..', '..', 'migrations');

export async function migrate(db) {
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
}

export function quoteStore(db) {
  return {
    async save(s, files) {
      const { rows } = await db.query(
        `INSERT INTO quote_submissions (submitted_on, name, email, event_date, referral, venue, details, services, ip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [s.submittedAt, s.name, s.email, s.eventDate, s.howDidYouFindUs, s.venue, s.details, s.services.join(', '), s.ip],
      );
      const id = rows[0].id;
      for (const f of files) {
        await db.query('INSERT INTO quote_files (submission_id, filename, mime, bytes) VALUES ($1,$2,$3,$4)', [id, f.filename, f.mime, f.bytes]);
      }
      return id;
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
    async record(id, { intake, email, error, nextTryAt }) {
      await db.query(
        `UPDATE quote_submissions SET intake_state = $2, email_state = $3, last_error = $4,
           attempts = attempts + 1, next_try_at = $5 WHERE id = $1`,
        [id, intake, email, error || '', nextTryAt]);
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
