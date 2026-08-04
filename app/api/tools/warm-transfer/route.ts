import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import twilio from "twilio";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

interface Closer {
  name: string;
  phone: string;
  priority: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { callSid, accountSid: bodyAccountSid } = body;

    console.log("warmTransfer called — callSid:", callSid, "accountSid:", bodyAccountSid);

    if (!callSid) {
      console.error("warmTransfer: missing callSid");
      return NextResponse.json({
        result: "error",
        message: "Transfer not available — no call SID provided.",
      });
    }

    const sql = getDb();
    const settings = await sql`
      SELECT twilio_sid, twilio_auth_token, twilio_phone, closers FROM settings WHERE id = 1
    `;

    if (settings.length === 0) {
      console.error("warmTransfer: no settings found");
      return NextResponse.json({
        result: "error",
        message: "Transfer configuration not found.",
      });
    }

    const { twilio_sid, twilio_auth_token, twilio_phone, closers, transfer_connecting_msg } = settings[0];

    // Use accountSid passed directly in the body (from Twilio webhook params),
    // falling back to what's stored in settings
    const accountSid = bodyAccountSid || twilio_sid || "";

    console.log("warmTransfer: accountSid resolved to:", accountSid ? accountSid.slice(0, 6) + "..." : "(empty)");
    console.log("warmTransfer: auth token present:", !!twilio_auth_token);

    if (!accountSid || !twilio_auth_token) {
      console.error("warmTransfer: missing credentials — accountSid:", !!accountSid, "authToken:", !!twilio_auth_token);
      return NextResponse.json({
        result: "error",
        message: `Transfer not configured — missing ${!accountSid ? "account SID" : "auth token"}.`,
      });
    }

    const client = twilio(accountSid, twilio_auth_token);
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

    // Update the live Twilio call to dial the closer.
    // This disconnects the Ultravox stream and connects the caller directly to the closer.
    // Use <Dial> with caller ID set to the Twilio number so the closer sees a real number.
    const connectMsg = transfer_connecting_msg || "Connecting you now.";
    const dialTwiml = twilio_phone
      ? `<Response><Say>${connectMsg}</Say><Dial callerId="${twilio_phone}" timeout="15" action="${APP_URL}/api/tools/warm-transfer/status"><Number>${closer.phone}</Number></Dial></Response>`
      : `<Response><Say>${connectMsg}</Say><Dial timeout="15" action="${APP_URL}/api/tools/warm-transfer/status"><Number>${closer.phone}</Number></Dial></Response>`;

    await client.calls(callSid).update({ twiml: dialTwiml });

    console.log("warmTransfer: Twilio call updated successfully");

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
