import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

interface Closer {
  name: string;
  phone: string;
  priority: number;
}

// Telnyx sends call status webhooks as JSON
export async function POST(req: NextRequest) {
  try {
    const webhook = await req.json();
    const eventType = webhook?.data?.event_type;
    const payload = webhook?.data?.payload || {};

    console.log("warmTransfer status webhook — event:", eventType);

    // Transfer answered and completed
    if (eventType === "call.hangup" || eventType === "call.answered") {
      return NextResponse.json({ ok: true });
    }

    // Transfer failed (no answer, busy, etc.)
    if (eventType === "call.machine.detection.ended" ||
        eventType === "call.initiated" ||
        (eventType === "call.hangup" && payload.hangup_cause === "NO_ANSWER")) {

      console.log("warmTransfer: closer unavailable, checking for fallback");

      const sql = getDb();
      const rows = await sql`SELECT * FROM settings WHERE id = 1`;
      if (rows.length === 0) throw new Error("No settings");

      const s = rows[0];
      const ultravoxApiKey = process.env.ULTRAVOX_API_KEY || s.ultravox_api_key || "";
      const callControlId = payload.call_control_id || "";

      const scenarioAScript = s.scenario_a_script ||
        "All our advisors are finishing up with other homeowners right now. I'm sending you a text right now so you stay at the front of the line. Just reply 'Hi' to confirm.";

      const scenarioAPrompt = `You are the receptionist at Nova Structa. You are warm and friendly.

THE CALLER WAS JUST ON HOLD while you tried to connect them with an advisor, but no one was available. Do NOT re-qualify them — they are already qualified.

IMPORTANT: Start by apologizing briefly for the wait. Something like "Hey, sorry about that wait..." Then deliver the Scenario A script naturally.

Say this naturally in your own words: "${scenarioAScript}"

After they confirm, call the sendTextScenarioA tool. Then confirm the text is on its way. Always ask "Is there anything else before I let you go?" and wait for their response. Only use hangUp after they say goodbye or confirm they're good.

Use "..." to breathe between thoughts. Two sentences max per turn. One thing at a time. Every response ends with a question — no exceptions.`;

      const callerPhone = payload.from || "";

      const selectedTools = [
        {
          temporaryTool: {
            modelToolName: "sendTextScenarioA",
            description: "Send a callback text to the lead.",
            dynamicParameters: [],
            staticParameters: [
              { name: "phone", location: "PARAMETER_LOCATION_BODY", value: callerPhone },
              { name: "leadName", location: "PARAMETER_LOCATION_BODY", value: "" },
              { name: "contactId", location: "PARAMETER_LOCATION_BODY", value: "" },
            ],
            http: {
              baseUrlPattern: `${APP_URL}/api/tools/scenario-a`,
              httpMethod: "POST",
            },
          },
        },
        { toolName: "hangUp" },
      ];

      const uvRes = await fetch("https://api.ultravox.ai/api/calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": ultravoxApiKey,
        },
        body: JSON.stringify({
          systemPrompt: scenarioAPrompt,
          model: "fixie-ai/ultravox-v0.7",
          voice: s.ultravox_voice_id || undefined,
          medium: { serverWebSocket: {} },
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
        // Speak error and hang up via Telnyx
        const telnyxApiKey = process.env.TELNYX_API_KEY || "";
        if (callControlId) {
          await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${telnyxApiKey}` },
            body: JSON.stringify({
              payload: "Our consultant is unavailable right now. We will have someone call you back shortly.",
              language: "en-US",
              voice: "female",
            }),
          });
        }
        return NextResponse.json({ ok: true });
      }

      const uvData = await uvRes.json();
      const joinUrl = uvData.joinUrl;

      // Reconnect to Ultravox via Telnyx streaming
      if (callControlId) {
        const telnyxApiKey = process.env.TELNYX_API_KEY || "";
        await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/streaming_start`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${telnyxApiKey}` },
          body: JSON.stringify({
            stream_url: joinUrl,
            stream_track: "both_tracks",
          }),
        });
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Transfer status webhook error:", err);
    return NextResponse.json({ ok: true });
  }
}
