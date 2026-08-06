import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface Closer {
  name: string;
  phone: string;
  priority: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { callControlId } = body;

    console.log("warmTransfer called — callControlId:", callControlId);

    if (!callControlId) {
      console.error("warmTransfer: missing callControlId");
      return NextResponse.json({
        result: "error",
        message: "Transfer not available — no call control ID provided.",
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

    const { closers, telnyx_phone, transfer_connecting_msg } = settings[0];
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

    // Transfer the call — the AI already tells the caller it's connecting them
    const transferRes = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${telnyxApiKey}` },
      body: JSON.stringify({
        to: closer.phone,
        from: telnyx_phone || undefined,
        timeout_secs: 15,
      }),
    });

    if (!transferRes.ok) {
      const err = await transferRes.text();
      console.error("Telnyx transfer error:", transferRes.status, err);
      return NextResponse.json({
        result: "error",
        message: `Transfer failed: ${err}`,
      });
    }

    console.log("warmTransfer: Telnyx transfer initiated successfully");

    return NextResponse.json({
      result: "success",
      closerName: closer.name,
      message: `Transferring the call to ${closer.name} now. The caller will hear "Connecting you now" and be connected directly.`,
    });
  } catch (error) {
    console.error("warmTransfer error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      result: "error",
      message: `Transfer failed: ${errMsg}`,
    });
  }
}
