import pg from 'pg';
import { env } from '../config/env.js';

export const masterPool = new pg.Pool({
  connectionString: env.MASTER_DATABASE_URL,
  ssl: env.MASTER_DATABASE_URL.includes('localhost') ? undefined : { rejectUnauthorized: true },
  max: 5
});
