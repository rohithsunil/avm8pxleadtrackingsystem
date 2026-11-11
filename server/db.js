import pg from 'pg';

// Return numbers as JS numbers and dates as 'YYYY-MM-DD' strings.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // bigint (count)
pg.types.setTypeParser(1082, (v) => v); // date

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    // Kept small: each warm function instance holds at most two connections.
    // Use Neon's pooled connection string (host contains "-pooler").
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, idleTimeoutMillis: 10_000 });
  }
  return pool;
}

export async function query(text, params = []) {
  const result = await getPool().query(text, params);
  return result.rows;
}

export async function one(text, params = []) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}

export async function transaction(fn) {
  const client = await getPool().connect();
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
  }
}
