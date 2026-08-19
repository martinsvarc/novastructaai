import { getDb } from "./db";

let migrated = false;

/**
 * Run pending DB migrations (safe to call multiple times — runs once per cold start)
 */
export async function runMigrations() {
  if (migrated) return;
  migrated = true;

  try {
    const sql = getDb();

    // GHL OAuth columns on settings
    await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS ghl_access_token TEXT DEFAULT ''`;
    await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS ghl_refresh_token TEXT DEFAULT ''`;
    await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS ghl_token_expires_at TIMESTAMPTZ`;
    await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS ghl_location_id TEXT DEFAULT ''`;

    // Per-channel booking mode
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS close_mode TEXT DEFAULT 'transfer'`;
    await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS ghl_calendar_id TEXT DEFAULT ''`;

    console.log("DB migrations complete");
  } catch (err) {
    console.error("Migration error:", err);
    migrated = false; // retry on next request
  }
}
