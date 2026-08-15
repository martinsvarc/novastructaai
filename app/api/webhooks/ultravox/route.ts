import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || "";

interface UltravoxMessage {
  role: string;
  toolName?: string;
  text?: string;
}

async function fetchCallMessages(
  callId: string,
  apiKey: string
): Promise<UltravoxMessage[]> {
  try {
    const res = await fetch(
      `https://api.ultravox.ai/api/calls/${callId}/messages`,
      { headers: { "X-API-Key": apiKey } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || data) as UltravoxMessage[];
  } catch {
    return [];
  }
}

function detectOutcome(
  messages: UltravoxMessage[],
  endReason: string,
  durationSeconds: number,
  shortSummary: string
): { outcome: string; outcomeSub: string } {
  // Primary signal: tool usage (check all roles since Ultravox may vary)
  const allToolNames = messages
    .map((m) => m.toolName || "")
    .filter(Boolean);

  console.log("detectOutcome — toolNames:", allToolNames, "endReason:", endReason);

  // Check callback/scenario tools BEFORE transfer — if transfer failed and
  // scenarioA was used, the real outcome is callback, not transferred.
  if (allToolNames.includes("sendTextScenarioA")) {
    return { outcome: "callback", outcomeSub: "Text sent — awaiting reply" };
  }

  if (
    allToolNames.includes("transferCall") ||
    allToolNames.includes("warmTransfer") ||
    endReason === "transferred"
  ) {
    const transferResult = messages.find(
      (m) => m.toolName === "transferCall" || m.toolName === "warmTransfer"
    );
    let sub = "→ Closer";
    if (transferResult?.text) {
      try {
        const r = JSON.parse(transferResult.text);
        if (r.closerName) sub = `→ ${r.closerName}`;
      } catch { /* use default */ }
    }
    return { outcome: "transferred", outcomeSub: sub };
  }

  if (allToolNames.includes("bookAppointment")) {
    const bookResult = messages.find((m) => m.toolName === "bookAppointment");
    let sub = "";
    if (bookResult?.text) {
      try {
        const r = JSON.parse(bookResult.text);
        sub = r.appointmentTime || r.time || "";
      } catch {
        sub = bookResult.text.slice(0, 60);
      }
    }
    return { outcome: "booked", outcomeSub: sub };
  }

  if (allToolNames.includes("notifyScenarioB")) {
    const scenarioBResult = messages.find((m) => m.toolName === "notifyScenarioB");
    let sub = "Morning callback";
    if (scenarioBResult?.text) {
      try {
        const r = JSON.parse(scenarioBResult.text);
        if (r.timePreference) sub = `${r.timePreference} callback`;
      } catch { /* use default */ }
    }
    return { outcome: "after_hours", outcomeSub: sub };
  }

  // Fallback: use the short summary text
  const summary = shortSummary.toLowerCase();

  if (
    summary.includes("transferred") ||
    summary.includes("transfer") ||
    summary.includes("connecting") ||
    summary.includes("connected to")
  ) {
    return { outcome: "transferred", outcomeSub: "→ Closer" };
  }

  if (
    summary.includes("booked") ||
    summary.includes("scheduled") ||
    summary.includes("appointment") ||
    summary.includes("consultation")
  ) {
    return { outcome: "booked", outcomeSub: "" };
  }

  if (
    summary.includes("callback") ||
    summary.includes("text sent") ||
    summary.includes("reply hi") ||
    summary.includes("front of the line")
  ) {
    return { outcome: "callback", outcomeSub: "Text sent" };
  }

  if (
    summary.includes("after hours") ||
    summary.includes("tomorrow morning") ||
    summary.includes("locked in") ||
    summary.includes("advisors are off")
  ) {
    return { outcome: "after_hours", outcomeSub: "Morning callback" };
  }

  // Check agent transcript for disqualification
  const agentText = messages
    .filter((m) => m.role === "agent" && m.text)
    .map((m) => m.text!.toLowerCase())
    .join(" ");

  if (
    agentText.includes("not a homeowner") ||
    agentText.includes("renter") ||
    agentText.includes("only work with homeowner") ||
    summary.includes("renter") ||
    summary.includes("not a homeowner")
  ) {
    return { outcome: "disqualified", outcomeSub: "Renter" };
  }
  if (
    (agentText.includes("credit") || summary.includes("credit")) &&
    (agentText.includes("below") || agentText.includes("building") || summary.includes("below"))
  ) {
    return { outcome: "disqualified", outcomeSub: "Bad credit" };
  }

  if (durationSeconds < 30) {
    return { outcome: "dropped", outcomeSub: `${durationSeconds}s` };
  }

  return { outcome: "dropped", outcomeSub: `${durationSeconds}s` };
}

function extractNameFromTranscript(
  messages: UltravoxMessage[],
  shortSummary: string
): string {
  // Strategy 1: Look for the user's response right after the agent asks for their name
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    if (msg.role === "agent" && msg.text) {
      const lower = msg.text.toLowerCase();
      if (
        lower.includes("your name") ||
        lower.includes("who am i speaking") ||
        lower.includes("can i get your name") ||
        lower.includes("may i have your name") ||
        lower.includes("what should i call you")
      ) {
        // Next user message likely contains the name
        const reply = messages[i + 1];
        if (reply?.role === "user" && reply.text) {
          const cleaned = reply.text
            .replace(/^(my name is|i'm|it's|this is|i am|yeah|yes|hey|hi|sure)\s*/i, "")
            .replace(/[.,!?]+$/, "")
            .trim();
          // Validate: 1-3 words, starts with uppercase or is short enough to be a name
          const words = cleaned.split(/\s+/);
          if (words.length >= 1 && words.length <= 4 && cleaned.length > 1 && cleaned.length < 40) {
            // Title-case the result
            return words
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
              .join(" ");
          }
        }
      }
    }
  }

  // Strategy 2: Extract from the short summary (Ultravox often includes the name)
  const nameMatch = shortSummary.match(
    /(?:caller|lead|customer|user|homeowner|person)\s+(?:named?\s+|is\s+|was\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/
  );
  if (nameMatch) return nameMatch[1];

  // Strategy 2b: Name at the very start of the summary (e.g. "Morin qualified for...")
  const startMatch = shortSummary.match(/^([A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,15})?)\s+(?:qualified|called|asked|wanted|inquired|expressed|is\s+interested|was\s+interested|said|mentioned|confirmed|agreed|requested)/);
  if (startMatch) return startMatch[1];

  // Strategy 3: Check if agent addresses someone by name in the conversation
  for (const msg of messages) {
    if (msg.role === "agent" && msg.text) {
      const match = msg.text.match(
        /(?:thank you|thanks|great|okay|alright|nice to meet you|good to hear),?\s+([A-Z][a-z]{1,15})/
      );
      if (match && !["Sir", "Ma", "Man", "Mam", "There", "So", "Well", "Now", "Sure"].includes(match[1])) {
        return match[1];
      }
    }
  }

  return "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.event !== "call.ended") {
      return NextResponse.json({ ok: true });
    }

    const call = body.call || {};
    const metadata = call.metadata || {};
    const contactId = metadata.contactId || "unknown";
    const leadPhone = metadata.leadPhone || "";
    let leadName = metadata.leadName || "";
    const channelPhone = metadata.channelPhone || "";

    // Calculate duration
    let durationSeconds = 0;
    if (call.created && call.ended) {
      durationSeconds = Math.round(
        (new Date(call.ended).getTime() - new Date(call.created).getTime()) /
          1000
      );
    }

    const sql = getDb();
    const settingsRows = await sql`SELECT ultravox_api_key FROM settings WHERE id = 1`;
    const apiKey = process.env.ULTRAVOX_API_KEY || settingsRows[0]?.ultravox_api_key || "";

    // Fetch recording URL — store the proxy path, not the direct Ultravox URL
    let recordingUrl = "";
    if (call.callId && apiKey) {
      try {
        const recRes = await fetch(
          `https://api.ultravox.ai/api/calls/${call.callId}/recording`,
          { headers: { "X-API-Key": apiKey } }
        );
        if (recRes.ok) {
          recordingUrl = `/api/recording/${call.callId}`;
        }
      } catch {
        // Recording not available
      }
    }

    // Fetch call messages to determine outcome from actual tool usage
    let messages: UltravoxMessage[] = [];
    if (call.callId && apiKey) {
      messages = await fetchCallMessages(call.callId, apiKey);
    }

    const endReason = call.endReason || "";
    const shortSummary = call.shortSummary || "";

    // Extract lead name from transcript if not provided by pre-call lookup
    if (!leadName) {
      leadName = extractNameFromTranscript(messages, shortSummary) || "Unknown";
      console.log("Extracted name from transcript:", leadName);
    }
    const { outcome, outcomeSub } = detectOutcome(
      messages,
      endReason,
      durationSeconds,
      shortSummary
    );

    const oneliner = metadata.oneliner || shortSummary.slice(0, 80) || "";
    const ghlContactUrl =
      contactId && contactId !== "unknown"
        ? `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${contactId}`
        : "";

    await sql`
      INSERT INTO calls (lead_name, phone, outcome, outcome_sub, oneliner, ghl_contact_url, duration_seconds, recording_url, short_summary, channel_phone, created_at)
      VALUES (${leadName}, ${leadPhone}, ${outcome}, ${outcomeSub}, ${oneliner}, ${ghlContactUrl}, ${durationSeconds}, ${recordingUrl}, ${shortSummary}, ${channelPhone}, NOW())
    `;

    // Fire end-of-call summary to N8N (non-blocking)
    const n8nPayload = {
      leadName,
      leadPhone,
      contactId,
      outcome,
      outcomeSub,
      oneliner,
      shortSummary,
      durationSeconds,
      recordingUrl: recordingUrl
        ? `${process.env.NEXT_PUBLIC_APP_URL || ""}${recordingUrl}`
        : "",
      ghlContactUrl,
      callId: call.callId || "",
      endReason,
      createdAt: new Date().toISOString(),
    };

    const n8nEndCallUrl = process.env.N8N_END_CALL_URL || "";
    if (n8nEndCallUrl) {
      try {
        const n8nRes = await fetch(n8nEndCallUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(n8nPayload),
        });
        console.log("N8N end-of-call webhook response:", n8nRes.status);
      } catch (err) {
        console.error("N8N end-of-call webhook error:", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Ultravox webhook error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
