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

    // Booking settings
    await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS booking_intro_msg TEXT DEFAULT 'Great news — you qualify for our program! Let me check what appointment times we have available for you.'`;
    await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS booking_confirm_msg TEXT DEFAULT 'You''re all set! You''ll get a confirmation shortly. One of our advisors will speak with you at that time.'`;
    await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS booking_fail_msg TEXT DEFAULT 'Let me have someone confirm your time manually — we''ll reach out shortly to lock it in.'`;
    await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS booking_min_hours_ahead INTEGER DEFAULT 3`;

    // Structured call details
    await sql`ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_details JSONB`;

    console.log("DB migrations complete");
  } catch (err) {
    console.error("Migration error:", err);
    migrated = false; // retry on next request
  }
}
