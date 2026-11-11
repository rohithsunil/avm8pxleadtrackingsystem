// Creates the tables in the database named by DATABASE_URL.
// Usage: DATABASE_URL=... npm run db:setup   (or put it in .env)
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Add it to .env or the environment.');
  process.exit(1);
}

const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(sql);
await client.end();
console.log('Database is ready.');
