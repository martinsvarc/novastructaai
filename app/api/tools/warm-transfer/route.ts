import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface Closer {
  name: string;
  phone: string;
  priority: number;
}

const TELNYX_API_BASE = "https://api.telnyx.com/v2";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { callControlId } = body;

    console.log("warmTransfer called — callSid:", callControlId);

    if (!callControlId) {
      console.error("warmTransfer: missing callSid/callControlId");
      return NextResponse.json({
        result: "error",
        message: "Transfer not available — no call ID provided.",
      });
    }

    const sql = getDb();
    const settings = await sql`
      SELECT closers, telnyx_phone, transfer_connecting_msg FROM settings WHERE id = 1
    `;

    if (settings.length === 0) {
      console.error("warmTransfer: no settings found");
      return NextResponse.json({
        result: "error",
        message: "Transfer configuration not found.",
      });
    }

    const { closers, telnyx_phone } = settings[0];
    const telnyxApiKey = process.env.TELNYX_API_KEY || "";

    if (!telnyxApiKey) {
      console.error("warmTransfer: missing TELNYX_API_KEY");
      return NextResponse.json({
        result: "error",
        message: "Transfer not configured — missing API key.",
      });
    }

    const sortedClosers = ((closers || []) as Closer[]).sort(
      (a, b) => a.priority - b.priority
    );

    if (sortedClosers.length === 0) {
      console.error("warmTransfer: no closers configured");
      return NextResponse.json({
        result: "error",
        message: "No closers available.",
      });
    }

    const closer = sortedClosers[0];
    console.log("warmTransfer: transferring to", closer.name, closer.phone);

    // Strategy 1: Try TeXML Update — redirect the call to <Dial> the closer
    // This works on TeXML calls and drops the Stream, connecting caller to closer
    const dialTexml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${telnyx_phone || ""}" timeout="20">
    <Number>${closer.phone}</Number>
  </Dial>
  <Say>The advisor was not available. Please call back shortly.</Say>
  <Hangup/>
</Response>`;

    const texmlUpdateRes = await fetch(
      `${TELNYX_API_BASE}/texml/calls/${callControlId}/update`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${telnyxApiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Texml: dialTexml }).toString(),
      }
    );

    if (texmlUpdateRes.ok) {
      console.log("warmTransfer: TeXML update successful — dialing closer");
      return NextResponse.json({
        result: "success",
        closerName: closer.name,
        message: `Transferring the call to ${closer.name} now. Let the caller know they are being connected.`,
      });
    }

    const texmlErr = await texmlUpdateRes.text();
    console.error("TeXML update failed:", texmlUpdateRes.status, texmlErr);

    // Strategy 2: Try Call Control transfer (in case the call has a call_control_id)
    const ccTransferRes = await fetch(
      `${TELNYX_API_BASE}/calls/${callControlId}/actions/transfer`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${telnyxApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: closer.phone,
          from: telnyx_phone || undefined,
          timeout_secs: 20,
        }),
      }
    );

    if (ccTransferRes.ok) {
      console.log("warmTransfer: Call Control transfer successful");
      return NextResponse.json({
        result: "success",
        closerName: closer.name,
        message: `Transferring the call to ${closer.name} now. Let the caller know they are being connected.`,
      });
    }

    const ccErr = await ccTransferRes.text();
    console.error("Call Control transfer also failed:", ccTransferRes.status, ccErr);

    return NextResponse.json({
      result: "error",
      message: `Transfer failed. All advisors may be unavailable. Use sendTextScenarioA to send a callback text instead.`,
    });
  } catch (error) {
    console.error("warmTransfer error:", error);
    return NextResponse.json({
      result: "error",
      message: "Transfer failed. Use sendTextScenarioA to send a callback text instead.",
    });
  }
}
