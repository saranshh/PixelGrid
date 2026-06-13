import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

// Load connection string from environment
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('WARNING: DATABASE_URL environment variable is not defined. PostgreSQL connection may fail.');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes('render.com') || connectionString?.includes('neon.tech') || connectionString?.includes('supabase')
    ? { rejectUnauthorized: false }
    : false // Auto-configure SSL for popular cloud hosts
});

export interface Block {
  x: number;
  y: number;
  ownerName: string | null;
  ownerColor: string | null;
  claimedAt?: Date;
}

// Initialize PostgreSQL schema
export async function initDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS blocks (
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        owner_name TEXT,
        owner_color TEXT,
        claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (x, y)
      );
    `);
    console.log('PostgreSQL database schema initialized.');
  } catch (error) {
    console.error('Failed to initialize PostgreSQL schema:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function getBlocks(): Promise<Block[]> {
  const res = await pool.query(`
    SELECT x, y, owner_name AS "ownerName", owner_color AS "ownerColor", claimed_at AS "claimedAt"
    FROM blocks
  `);
  return res.rows as Block[];
}

export async function claimBlock(x: number, y: number, ownerName: string, ownerColor: string): Promise<void> {
  await pool.query(`
    INSERT INTO blocks (x, y, owner_name, owner_color, claimed_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    ON CONFLICT(x, y) DO UPDATE SET
      owner_name = EXCLUDED.owner_name,
      owner_color = EXCLUDED.owner_color,
      claimed_at = CURRENT_TIMESTAMP
  `, [x, y, ownerName, ownerColor]);
}

export async function clearAllBlocks(): Promise<void> {
  await pool.query('DELETE FROM blocks');
}
