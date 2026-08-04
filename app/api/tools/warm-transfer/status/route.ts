import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

interface Closer {
  name: string;
  phone: string;
  priority: number;
}

export async function POST(req: NextRequest) {
  const formData = await req.text();
  const params = new URLSearchParams(formData);
  const dialCallStatus = params.get("DialCallStatus") || "";

  console.log("warmTransfer status callback — DialCallStatus:", dialCallStatus);

  if (dialCallStatus === "completed") {
    // Closer answered and finished — done
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  // Closer didn't pick up — try next closer or fall back to Scenario A
  console.log("warmTransfer: closer unavailable, checking for next closer or Scenario A");

  try {
    const sql = getDb();
    const rows = await sql`SELECT * FROM settings WHERE id = 1`;
    if (rows.length === 0) throw new Error("No settings");

    const s = rows[0];
    const apiKey = s.ultravox_api_key || "";
    const closers = (s.closers || []) as Closer[];
    const nextCloser = closers.sort((a: Closer, b: Closer) => a.priority - b.priority)[1]; // try #2 closer if exists

    // If there's a second closer, try them instead
    if (nextCloser && dialCallStatus === "no-answer") {
      console.log("warmTransfer: trying next closer:", nextCloser.name);
      const retryMsg = s.transfer_retry_msg || "Let me try another consultant for you.";
      const twimlPhone = s.twilio_phone || "";
      const callerIdAttr = twimlPhone ? ` callerId="${twimlPhone}"` : "";
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${retryMsg}</Say><Dial${callerIdAttr} timeout="15" action="${APP_URL}/api/tools/warm-transfer/status"><Number>${nextCloser.phone}</Number></Dial></Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // No more closers — fall back to Scenario A (callback text)
    const scenarioAScript = s.scenario_a_script ||
      "All our advisors are finishing up with other homeowners right now — which actually means they're in high demand. Here's what I'll do: I'm sending you a text right now so you stay at the front of the line. Just reply 'Hi' to confirm and an advisor will call you back within 15 minutes. Sound good?";

    const scenarioAPrompt = `You are the receptionist at Nova Structa. You are warm and friendly.

THE CALLER WAS JUST ON HOLD while you tried to connect them with an advisor, but no one was available. Do NOT re-qualify them — they are already qualified.

IMPORTANT: Start by apologizing briefly for the wait. Something like "Hey, sorry about that wait..." Then deliver the Scenario A script naturally.

Say this naturally in your own words: "${scenarioAScript}"

After they confirm, call the sendTextScenarioA tool. Then confirm the text is on its way. Always ask "Is there anything else before I let you go?" and wait for their response. Only use hangUp after they say goodbye or confirm they're good. Never hang up abruptly.

Use "..." to breathe between thoughts. Two sentences max per turn. One thing at a time. Every response ends with a question — no exceptions.`;

    // We need the caller's phone from the Twilio params
    const callerPhone = params.get("From") || params.get("Called") || "";

    const selectedTools = [
      {
        temporaryTool: {
          modelToolName: "sendTextScenarioA",
          description:
            "Send a callback text to the lead. This sends an SMS asking the lead to reply 'Hi' to confirm their callback spot.",
          dynamicParameters: [],
          staticParameters: [
            {
              name: "phone",
              location: "PARAMETER_LOCATION_BODY",
              value: callerPhone,
            },
            {
              name: "leadName",
              location: "PARAMETER_LOCATION_BODY",
              value: "",
            },
            {
              name: "contactId",
              location: "PARAMETER_LOCATION_BODY",
              value: "",
            },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/scenario-a`,
            httpMethod: "POST",
          },
        },
      },
      { toolName: "hangUp" },
      {
        temporaryTool: {
          modelToolName: "holdLine",
          description:
            "Put the call on hold when the caller asks for a moment. Ask how long they need, then call this tool with the seconds.",
          defaultReaction: "AGENT_REACTION_LISTENS",
          timeout: "120s",
          dynamicParameters: [
            {
              name: "waitSeconds",
              location: "PARAMETER_LOCATION_BODY",
              schema: {
                type: "string",
                description: "Seconds to wait. 'a minute' = 60, '30 seconds' = 30, 'a couple minutes' = 120.",
              },
              required: true,
            },
          ],
          staticParameters: [
            {
              name: "phone",
              location: "PARAMETER_LOCATION_BODY",
              value: callerPhone,
            },
            {
              name: "leadName",
              location: "PARAMETER_LOCATION_BODY",
              value: "",
            },
            {
              name: "contactId",
              location: "PARAMETER_LOCATION_BODY",
              value: "",
            },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/hold-line`,
            httpMethod: "POST",
          },
        },
      },
    ];

    const uvRes = await fetch("https://api.ultravox.ai/api/calls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        systemPrompt: scenarioAPrompt,
        model: "fixie-ai/ultravox-v0.7",
        voice: s.ultravox_voice_id || undefined,
        medium: { twilio: {} },
        // Let the caller speak first — the system prompt tells the AI what to say.
        // Starting with agent text during a Twilio stream handoff causes garbled audio.
        firstSpeakerSettings: { user: {} },
        inactivityMessages: [
          {
            duration: `${s.inactivity_1_seconds ?? 8}s`,
            message: s.inactivity_1_message || "Hey, are you still there?",
          },
          {
            duration: `${s.inactivity_2_seconds ?? 10}s`,
            message: s.inactivity_2_message || "I'm having a little trouble hearing you... are you there?",
            endBehavior: "END_BEHAVIOR_HANG_UP_SOFT",
          },
        ],
        experimentalSettings: {
          frameActivationThreshold: s.vad_sensitivity ?? 0.15,
        },
        maxDuration: "300s",
        selectedTools,
      }),
    });

    if (!uvRes.ok) {
      const err = await uvRes.text();
      console.error("Fallback Ultravox call failed:", err);
      throw new Error("Ultravox fallback failed");
    }

    const uvData = await uvRes.json();
    const joinUrl = uvData.joinUrl;

    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${joinUrl}" /></Connect></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );

  } catch (err) {
    console.error("Transfer fallback error:", err);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Our consultant is unavailable right now. We will have someone call you back shortly.</Say><Hangup/></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }
}
