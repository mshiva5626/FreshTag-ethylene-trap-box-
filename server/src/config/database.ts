import pg from 'pg';
import { newDb } from 'pg-mem';
import dotenv from 'dotenv';

dotenv.config();

let pool: any = null;

export async function getDbPool() {
  if (pool) return pool;

  const forcePgMem = process.env.USE_PG_MEM === 'true';

  if (!forcePgMem && process.env.DATABASE_URL) {
    try {
      const realPool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 2500,
      });
      // Quick test query
      await realPool.query('SELECT 1');
      console.log('[Database] Connected to external PostgreSQL instance.');
      pool = realPool;
      return pool;
    } catch (err: any) {
      console.warn('[Database] External PostgreSQL unavailable. Falling back to embedded pg-mem engine.', err.message);
    }
  }

  console.log('[Database] Initializing in-memory PostgreSQL engine (pg-mem)...');
  const db = newDb();

  // Register common PostgreSQL utility functions if required
  db.public.registerFunction({
    name: 'version',
    args: [],
    returns: db.public.getType('text'),
    implementation: () => 'PostgreSQL 16.0 (pg-mem)',
  });

  const MemPg = db.adapters.createPg();
  pool = new MemPg.Pool();
  return pool;
}

export async function query(text: string, params: any[] = []) {
  const p = await getDbPool();
  return p.query(text, params);
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
