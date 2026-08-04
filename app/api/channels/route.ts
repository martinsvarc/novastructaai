import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();

    // Get all channels
    const channels = await sql`SELECT * FROM channels ORDER BY created_at ASC`;

    // Get call stats per channel phone number (last 30 days)
    const stats = await sql`
      SELECT
        channel_phone,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE outcome = 'transferred') as transferred,
        COUNT(*) FILTER (WHERE outcome = 'callback') as callbacks,
        COUNT(*) FILTER (WHERE outcome = 'booked') as booked,
        COUNT(*) FILTER (WHERE outcome = 'after_hours') as after_hours,
        COUNT(*) FILTER (WHERE outcome = 'disqualified') as disqualified,
        COUNT(*) FILTER (WHERE outcome = 'dropped') as dropped
      FROM calls
      WHERE created_at >= NOW() - INTERVAL '30 days'
        AND channel_phone IS NOT NULL
      GROUP BY channel_phone
    `;

    // Merge stats into channels
    const statsMap = new Map(stats.map((s: Record<string, unknown>) => [s.channel_phone, s]));
    const merged = channels.map((ch: Record<string, unknown>) => {
      const s = statsMap.get(ch.phone) || {
        total_calls: 0, transferred: 0, callbacks: 0, booked: 0,
        after_hours: 0, disqualified: 0, dropped: 0,
      };
      const total = Number(s.total_calls) || 0;
      const connected = Number(s.transferred) + Number(s.callbacks) + Number(s.booked) + Number(s.after_hours);
      return {
        ...ch,
        total_calls: total,
        transferred: Number(s.transferred) || 0,
        callbacks: Number(s.callbacks) || 0,
        booked: Number(s.booked) || 0,
        after_hours: Number(s.after_hours) || 0,
        disqualified: Number(s.disqualified) || 0,
        dropped: Number(s.dropped) || 0,
        connected_pct: total > 0 ? Math.round((connected / total) * 100) : 0,
      };
    });

    return NextResponse.json(merged);
  } catch (error) {
    console.error("Channels GET error:", error);
    return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, phone, color } = await req.json();
    if (!name || !phone) {
      return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
    }

    const sql = getDb();
    const result = await sql`
      INSERT INTO channels (name, phone, color)
      VALUES (${name}, ${phone}, ${color || '#60A5FA'})
      RETURNING *
    `;

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("Channels POST error:", error);
    return NextResponse.json({ error: "Failed to create channel" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const sql = getDb();
    await sql`DELETE FROM channels WHERE id = ${id}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Channels DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete channel" }, { status: 500 });
  }
}
