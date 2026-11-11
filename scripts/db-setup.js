// Creates the tables. Schema changes use Neon's direct (unpooled) connection,
// as the Neon Postgres skill recommends; it falls back to DATABASE_URL.
// Uses Neon's serverless driver over a WebSocket (port 443), so it also works
// on networks that block Postgres's usual port 5432.
// Usage: npm run db:setup   (reads .env.local, written by `neon deploy`, then .env)
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { Pool } from '@neondatabase/serverless';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('No database URL. Run `neon deploy` (writes .env.local) or set DATABASE_URL.');
  process.exit(1);
}

const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const pool = new Pool({ connectionString: url });
await pool.query(sql);
await pool.end();
console.log('Database is ready.');
