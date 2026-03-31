import { pool } from './db';

/**
 * Run safe migrations — adds columns that exist in the schema but may be missing in the DB.
 * Uses ADD COLUMN IF NOT EXISTS so it's idempotent.
 */
export async function runMigrations() {
  const migrations = [
    // site_reports table columns added over time
    `ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS labor_count INTEGER DEFAULT 0`,
    `ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS labor_details TEXT`,
    `ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS sqft_covered TEXT`,
    `ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS labor_data JSONB`,
    `ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS materials_used TEXT`,
    `ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS location_lat TEXT`,
    `ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS location_lng TEXT`,
    `ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS email_recipients TEXT`,
    `ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`,
    // Time Entries
    `ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS key_step TEXT`,
    // Daily Plans
    `CREATE TABLE IF NOT EXISTS daily_plans (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id VARCHAR NOT NULL,
      date TEXT NOT NULL,
      submitted_at TIMESTAMP DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS plan_tasks (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id VARCHAR NOT NULL,
      task_id VARCHAR NOT NULL,
      project_name TEXT,
      task_name TEXT NOT NULL,
      is_deviation BOOLEAN DEFAULT false,
      deviation_reason TEXT,
      status TEXT DEFAULT 'approved'
    )`,
  ];

  for (const sql of migrations) {
    try {
      await pool.query(sql);
      console.log(`[MIGRATE] ✅ ${sql.substring(0, 60)}...`);
    } catch (err: any) {
      console.error(`[MIGRATE] ❌ Failed: ${sql.substring(0, 60)}...`, err.message);
    }
  }
  console.log('[MIGRATE] Database migration complete.');
}
