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
        system_prompt: ch.system_prompt || "",
        opener: ch.opener || "",
        opener_speaks_first: ch.opener_speaks_first !== false,
        scenario_a_script: ch.scenario_a_script || "",
        scenario_b_script: ch.scenario_b_script || "",
        closers: ch.closers || [],
        transfer_connecting_msg: ch.transfer_connecting_msg || "",
        transfer_retry_msg: ch.transfer_retry_msg || "",
        transfer_error_msg: ch.transfer_error_msg || "",
        business_hours: ch.business_hours || {},
        close_mode: ch.close_mode || "transfer",
        ghl_calendar_id: ch.ghl_calendar_id || "",
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

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const sql = getDb();

    const current = await sql`SELECT * FROM channels WHERE id = ${id}`;
    if (current.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const row = current[0];
    const newName = 'name' in fields ? fields.name : row.name;
    const newSystemPrompt = 'system_prompt' in fields ? fields.system_prompt : (row.system_prompt || '');
    const newOpener = 'opener' in fields ? fields.opener : (row.opener || '');
    const newOpenerSpeaksFirst = 'opener_speaks_first' in fields ? Boolean(fields.opener_speaks_first) : (row.opener_speaks_first !== false);
    const newScenarioA = 'scenario_a_script' in fields ? fields.scenario_a_script : (row.scenario_a_script || '');
    const newScenarioB = 'scenario_b_script' in fields ? fields.scenario_b_script : (row.scenario_b_script || '');
    const newClosers = 'closers' in fields ? JSON.stringify(fields.closers) : JSON.stringify(row.closers || []);
    const newConnectMsg = 'transfer_connecting_msg' in fields ? fields.transfer_connecting_msg : (row.transfer_connecting_msg || '');
    const newRetryMsg = 'transfer_retry_msg' in fields ? fields.transfer_retry_msg : (row.transfer_retry_msg || '');
    const newErrorMsg = 'transfer_error_msg' in fields ? fields.transfer_error_msg : (row.transfer_error_msg || '');
    const newBusinessHours = 'business_hours' in fields ? JSON.stringify(fields.business_hours) : JSON.stringify(row.business_hours || {});
    const newCloseMode = 'close_mode' in fields ? fields.close_mode : (row.close_mode || 'transfer');
    const newGhlCalendarId = 'ghl_calendar_id' in fields ? fields.ghl_calendar_id : (row.ghl_calendar_id || '');

    await sql`
      UPDATE channels SET
        name = ${newName},
        system_prompt = ${newSystemPrompt},
        opener = ${newOpener},
        opener_speaks_first = ${newOpenerSpeaksFirst},
        scenario_a_script = ${newScenarioA},
        scenario_b_script = ${newScenarioB},
        closers = ${newClosers}::jsonb,
        transfer_connecting_msg = ${newConnectMsg},
        transfer_retry_msg = ${newRetryMsg},
        transfer_error_msg = ${newErrorMsg},
        business_hours = ${newBusinessHours}::jsonb,
        close_mode = ${newCloseMode},
        ghl_calendar_id = ${newGhlCalendarId}
      WHERE id = ${id}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Channels PATCH error:", error);
    return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
  }
}
