import { NextRequest, NextResponse } from "next/server";

const HOLD_LINE_WEBHOOK = process.env.N8N_HOLD_LINE_URL || "";

// Allow up to 5 minutes on Vercel Pro
export const maxDuration = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, leadName, contactId, waitSeconds } = body;

    // Parse and cap the wait time (min 10s, max 240s / 4 minutes)
    // Cap at 110s to stay under Ultravox's 120s tool timeout
    const requestedSeconds = Math.max(10, Math.min(110, Number(waitSeconds) || 30));

    console.log("holdLine: caller asked for", requestedSeconds, "seconds —", leadName, phone);

    // Notify N8N with the wait time
    fetch(HOLD_LINE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        leadName,
        contactId,
        waitSeconds: requestedSeconds,
        reason: "caller_requested_hold",
        timestamp: new Date().toISOString(),
      }),
    }).catch((err) => console.error("holdLine webhook error:", err));

    // Block for the requested duration — pauses inactivity timer
    await sleep(requestedSeconds * 1000);

    console.log("holdLine: wait complete after", requestedSeconds, "seconds");

    return NextResponse.json({
      result: "success",
      message:
        "The hold time is up. Re-engage the caller warmly. Say something like 'Hey, I'm back! Are you all set?' or 'Alright, hope that was enough time... ready to pick up where we left off?' If the caller said something while waiting, respond to that instead. Do NOT re-introduce yourself or restart the conversation.",
    });
  } catch (error) {
    console.error("holdLine error:", error);
    return NextResponse.json({
      result: "success",
      message: "Gently check in with the caller and continue the conversation.",
    });
  }
}
