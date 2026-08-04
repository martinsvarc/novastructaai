import { NextRequest, NextResponse } from "next/server";

const SCENARIO_B_WEBHOOK = process.env.N8N_SCENARIO_B_URL || "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, leadName, contactId, timePreference } = body;

    console.log("scenarioB: after-hours lock-in for", leadName, phone, "pref:", timePreference);

    // Fire webhook to N8N — must await so Vercel doesn't kill the process
    try {
      const webhookRes = await fetch(SCENARIO_B_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          leadName,
          contactId,
          timePreference: timePreference || "",
          scenario: "B",
          reason: "after_hours",
          timestamp: new Date().toISOString(),
        }),
      });
      console.log("scenarioB webhook response:", webhookRes.status);
    } catch (err) {
      console.error("Scenario B webhook error:", err);
    }

    return NextResponse.json({
      result: "success",
      message:
        "The lead's information has been locked in. Confirm that an advisor will call them back at their preferred time tomorrow morning. Then say a warm goodbye like 'Alright, you're all set! Is there anything else before I let you go?' Wait for their response. If they say no or say goodbye, wish them a great day and THEN use hangUp.",
    });
  } catch (error) {
    console.error("scenarioB error:", error);
    return NextResponse.json({
      result: "error",
      message: "Could not lock in their information. Apologize and assure them someone will reach out first thing tomorrow.",
    });
  }
}
