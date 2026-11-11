// Postgres on Neon, using Neon's serverless driver (recommended for Netlify):
// - one-shot queries go over HTTP, which suits short-lived functions;
// - the one multi-statement transaction uses a WebSocket Pool.
// DATABASE_URL is Neon's pooled connection string (written by `neon deploy`).
import { neon, Pool, types } from '@neondatabase/serverless';

// Return numbers as JS numbers and dates as 'YYYY-MM-DD' strings.
const PARSERS = {
  1700: (v) => parseFloat(v), // numeric
  20: (v) => parseInt(v, 10), // bigint (count)
  1082: (v) => v, // date
};
const customTypes = {
  getTypeParser: (oid, format) => PARSERS[oid] ?? types.getTypeParser(oid, format),
};

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}

let sql;

export async function query(text, params = []) {
  sql ??= neon(connectionString());
  // The HTTP path reads `types` per query, not from neon()'s options.
  return sql.query(text, params, { types: customTypes });
}

export async function one(text, params = []) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}

export async function transaction(fn) {
  // A fresh pool per transaction: Netlify functions don't keep sockets warm.
  const pool = new Pool({ connectionString: connectionString(), types: customTypes });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn((text, params = []) => client.query(text, params).then((r) => r.rows));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
