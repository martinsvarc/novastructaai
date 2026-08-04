import { NextRequest, NextResponse } from "next/server";

const SCENARIO_A_WEBHOOK = process.env.N8N_SCENARIO_A_URL || "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, leadName, contactId } = body;

    console.log("scenarioA: sending callback text for", leadName, phone);

    // Fire webhook to N8N — must await so Vercel doesn't kill the process
    try {
      const webhookRes = await fetch(SCENARIO_A_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          leadName,
          contactId,
          scenario: "A",
          reason: "advisors_busy",
          timestamp: new Date().toISOString(),
        }),
      });
      console.log("scenarioA webhook response:", webhookRes.status);
    } catch (err) {
      console.error("Scenario A webhook error:", err);
    }

    return NextResponse.json({
      result: "success",
      message:
        "Text message is being sent to the lead now. Let them know the text is on its way and to reply 'Hi' to confirm their spot. Then say a warm goodbye like 'Alright, you're all set! Is there anything else I can help you with before I let you go?' Wait for their response. If they say no or say goodbye, wish them a great day and THEN use hangUp.",
    });
  } catch (error) {
    console.error("scenarioA error:", error);
    return NextResponse.json({
      result: "error",
      message: "Could not send the callback text. Apologize and let them know someone will call them back shortly.",
    });
  }
}
