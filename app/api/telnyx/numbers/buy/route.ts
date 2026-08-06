import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const CHANNEL_COLORS = [
  "#f3880e",
  "#4A90D9",
  "#6FC08A",
  "#9B7DD4",
  "#E07555",
  "#4ECDC4",
  "#F59E0B",
  "#64b5f6",
];

export async function POST(req: NextRequest) {
  try {
    const { phoneNumber } = await req.json();
    if (!phoneNumber) {
      return NextResponse.json({ error: "phoneNumber is required" }, { status: 400 });
    }

    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "TELNYX_API_KEY not configured" }, { status: 500 });
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
    const sql = getDb();

    // Step 1: Check settings for telnyx_app_id. Create Call Control App if missing.
    const settingsRows = await sql`SELECT telnyx_app_id FROM settings WHERE id = 1`;
    let telnyxAppId = settingsRows[0]?.telnyx_app_id || "";

    if (!telnyxAppId) {
      const appRes = await fetch("https://api.telnyx.com/v2/call_control_applications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          application_name: "Nova Structa AI",
          webhook_event_url: `${appUrl}/api/telnyx/inbound`,
          webhook_event_failover_url: "",
          active: true,
        }),
      });

      if (!appRes.ok) {
        const errText = await appRes.text();
        return NextResponse.json(
          { error: `Failed to create Telnyx Call Control App: ${errText}` },
          { status: 500 }
        );
      }

      const appData = await appRes.json();
      telnyxAppId = appData.data?.id || "";

      if (!telnyxAppId) {
        return NextResponse.json(
          { error: "Telnyx Call Control App created but no ID returned" },
          { status: 500 }
        );
      }

      await sql`UPDATE settings SET telnyx_app_id = ${telnyxAppId}, updated_at = NOW() WHERE id = 1`;
    }

    // Step 2: Order the number
    const orderRes = await fetch("https://api.telnyx.com/v2/number_orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_numbers: [{ phone_number: phoneNumber }],
      }),
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      return NextResponse.json(
        { error: `Failed to order phone number: ${errText}` },
        { status: 500 }
      );
    }

    // Step 3: Look up the phone number resource ID via GET /v2/phone_numbers
    const lookupParams = new URLSearchParams({ "filter[phone_number]": phoneNumber });
    const lookupRes = await fetch(
      `https://api.telnyx.com/v2/phone_numbers?${lookupParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    let telnyxPhoneId = "";
    if (lookupRes.ok) {
      const lookupData = await lookupRes.json();
      telnyxPhoneId = lookupData.data?.[0]?.id || "";
    }

    // Step 3b: Configure the number with the Call Control App
    if (telnyxPhoneId) {
      const patchRes = await fetch(
        `https://api.telnyx.com/v2/phone_numbers/${telnyxPhoneId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ connection_id: telnyxAppId }),
        }
      );

      if (!patchRes.ok) {
        const errText = await patchRes.text();
        console.error(`Failed to configure phone number connection: ${errText}`);
        // Non-fatal — proceed to insert into DB
      }
    }

    // Step 4: Pick a color based on current channel count, insert into channels
    const countRows = await sql`SELECT COUNT(*) as cnt FROM channels`;
    const count = Number(countRows[0]?.cnt || 0);
    const color = CHANNEL_COLORS[count % CHANNEL_COLORS.length];

    const inserted = await sql`
      INSERT INTO channels (name, phone, color, telnyx_id)
      VALUES (${phoneNumber}, ${phoneNumber}, ${color}, ${telnyxPhoneId})
      RETURNING *
    `;

    return NextResponse.json({ success: true, channel: inserted[0] });
  } catch (error) {
    console.error("Telnyx buy number error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to buy number" },
      { status: 500 }
    );
  }
}
