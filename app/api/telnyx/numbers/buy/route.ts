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

    // Step 1: Get the TeXML Application ID.
    // First check DB, then env/hardcoded, then look up existing app, then create if needed.
    const TEXML_APP_ID = process.env.TELNYX_TEXML_APP_ID || "3027126994623006149";
    const settingsRows = await sql`SELECT telnyx_app_id FROM settings WHERE id = 1`;
    let telnyxAppId = settingsRows[0]?.telnyx_app_id || TEXML_APP_ID;

    if (!telnyxAppId) {
      // Look up existing TeXML app by name
      const listRes = await fetch("https://api.telnyx.com/v2/texml_applications?page[size]=50", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        const existing = (listData.data || []).find(
          (a: { friendly_name?: string }) =>
            a.friendly_name === "Call House" || a.friendly_name === "Nova Structa AI"
        );
        if (existing) {
          telnyxAppId = existing.id;
          console.log(`Found existing TeXML app "${existing.friendly_name}": ${telnyxAppId}`);
        }
      }
    }

    if (!telnyxAppId) {
      // Create a new TeXML Application
      const appRes = await fetch("https://api.telnyx.com/v2/texml_applications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          friendly_name: "Call House",
          voice_url: `${appUrl}/api/telnyx/inbound`,
          voice_method: "POST",
          status_callback: `${appUrl}/api/telnyx/status`,
          status_callback_method: "POST",
          active: true,
        }),
      });

      if (!appRes.ok) {
        const errText = await appRes.text();
        return NextResponse.json(
          { error: `Failed to create TeXML Application: ${errText}` },
          { status: 500 }
        );
      }

      const appData = await appRes.json();
      telnyxAppId = appData.data?.id || "";

      if (!telnyxAppId) {
        return NextResponse.json(
          { error: "TeXML Application created but no ID returned" },
          { status: 500 }
        );
      }
      console.log(`Created TeXML Application "Call House": ${telnyxAppId}`);
    }

    // Cache the app ID in settings so we don't look it up every time
    if (telnyxAppId && !settingsRows[0]?.telnyx_app_id) {
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

    // Step 3: Look up the phone number resource ID — retry a couple times
    // since provisioning after order can take a moment.
    let telnyxPhoneId = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
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
      if (lookupRes.ok) {
        const lookupData = await lookupRes.json();
        telnyxPhoneId = lookupData.data?.[0]?.id || "";
        if (telnyxPhoneId) break;
      }
    }

    // Step 3b: Assign the number to the TeXML Application
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
        console.error(`Failed to assign number to TeXML app: ${errText}`);
      } else {
        console.log(`Assigned ${phoneNumber} to TeXML app ${telnyxAppId}`);
      }
    } else {
      console.error(`Could not find phone number ${phoneNumber} after ordering — manual TeXML assignment needed`);
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
