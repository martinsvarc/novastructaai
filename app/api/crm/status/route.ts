import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`SELECT ghl_access_token, ghl_location_id, ghl_token_expires_at FROM settings WHERE id = 1`;
    if (rows.length === 0) return NextResponse.json({ connected: false });

    const { ghl_access_token, ghl_location_id, ghl_token_expires_at } = rows[0];
    const connected = !!ghl_access_token && !!ghl_location_id;

    return NextResponse.json({
      connected,
      locationId: connected ? ghl_location_id : null,
      expiresAt: connected ? ghl_token_expires_at : null,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

export async function DELETE() {
  try {
    const sql = getDb();
    await sql`
      UPDATE settings SET
        ghl_access_token = '',
        ghl_refresh_token = '',
        ghl_token_expires_at = NULL,
        ghl_location_id = '',
        updated_at = NOW()
      WHERE id = 1
    `;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
