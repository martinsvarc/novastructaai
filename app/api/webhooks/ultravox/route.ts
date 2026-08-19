import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || "";

interface UltravoxMessage {
  role: string;
  toolName?: string;
  text?: string;
}

interface CallDetails {
  homeowner?: string;
  location?: string;
  dwelling?: string;
  bill?: string;
  credit?: string;
  roof?: string;
  shade?: string;
  decision_makers?: string;
  address?: string;
  appointment?: string;
  disqualify_reason?: string;
}

const EXTRACT_PROMPT = `Extract qualification details from this solar sales call transcript. Return ONLY a JSON object with these fields (omit any that weren't discussed):

- homeowner: Did they confirm they own the home? (e.g. "Yes, owns the home" or "Renter")
- location: City and state (e.g. "Tampa, FL")
- dwelling: Property type (e.g. "Single family home", "Duplex", "Townhome")
- bill: Monthly electric bill (e.g. "$700/mo")
- credit: Credit score range (e.g. "650-700")
- roof: Roof age and condition (e.g. "10 years old, good shape")
- shade: Sun exposure (e.g. "Mostly sunny, some trees need trimming")
- decision_makers: Who decides? (e.g. "Solo decision maker" or "Spouse needs to be present")
- address: Property address if given
- appointment: Booked appointment time if any
- disqualify_reason: If disqualified, why (e.g. "Renter", "Credit below 650", "Out of service area")

Keep values short and clean. Return valid JSON only, no markdown.`;

/**
 * Use LLM to extract structured call details from transcript.
 */
async function extractCallDetails(messages: UltravoxMessage[]): Promise<CallDetails> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return {};

  // Build a clean transcript string
  const transcript = messages
    .filter((m) => (m.role === "agent" || m.role === "user" || m.role === "MESSAGE_ROLE_AGENT" || m.role === "MESSAGE_ROLE_USER") && m.text)
    .map((m) => {
      const role = m.role.includes("AGENT") || m.role === "agent" ? "Agent" : "Caller";
      return `${role}: ${m.text!.trim()}`;
    })
    .join("\n");

  if (transcript.length < 50) return {};

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        messages: [
          { role: "system", content: EXTRACT_PROMPT },
          { role: "user", content: transcript },
        ],
        temperature: 0,
      }),
    });

    if (!res.ok) {
      console.error("OpenRouter extraction error:", res.status);
      return {};
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    // Strip markdown code fences if present
    const jsonStr = content.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const parsed = JSON.parse(jsonStr);
    return parsed as CallDetails;
  } catch (err) {
    console.error("Call details extraction error:", err);
    return {};
  }
}

/**
 * Build a concise oneliner from extracted call details.
 * e.g. "Tampa, FL · Duplex · $700/mo · Credit 650-700"
 */
function buildOneliner(details: CallDetails, fallback: string): string {
  const parts: string[] = [];
  if (details.location) parts.push(details.location.replace(/^\s+/, ""));
  if (details.dwelling) parts.push(details.dwelling.replace(/^\s+/, ""));
  if (details.bill) parts.push(details.bill.replace(/^\s+/, ""));
  if (details.credit) parts.push("Credit " + details.credit.replace(/^\s+/, ""));
  if (parts.length >= 2) return parts.join(" · ").slice(0, 100);
  return fallback.slice(0, 80);
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

    // Look up channel name from DB
    let channelName = "";
    if (channelPhone) {
      const chRows = await sql`SELECT name FROM channels WHERE phone = ${channelPhone} LIMIT 1`;
      channelName = chRows[0]?.name || "";
    }

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

    // Extract structured qualification details from transcript
    const callDetails = messages.length > 0 ? await extractCallDetails(messages) : null;
    const callDetailsJson = callDetails && Object.keys(callDetails).length > 0 ? JSON.stringify(callDetails) : null;

    const oneliner = metadata.oneliner || (callDetails ? buildOneliner(callDetails, shortSummary) : shortSummary.slice(0, 80)) || "";
    const ghlContactUrl =
      contactId && contactId !== "unknown"
        ? `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${contactId}`
        : "";

    const GHL_LOCATION = GHL_LOCATION_ID || "lmQk2oDHgL1OBDQdLRYC";

    const insertedRows = await sql`
      INSERT INTO calls (lead_name, phone, outcome, outcome_sub, oneliner, ghl_contact_url, duration_seconds, recording_url, short_summary, channel_phone, call_details, created_at)
      VALUES (${leadName}, ${leadPhone}, ${outcome}, ${outcomeSub}, ${oneliner}, ${ghlContactUrl}, ${durationSeconds}, ${recordingUrl}, ${shortSummary}, ${channelPhone}, ${callDetailsJson}::jsonb, NOW())
      RETURNING id
    `;
    const callRowId = insertedRows[0]?.id;

    // Send end-of-call data to N8N and wait for response with GHL contact ID
    const n8nPayload = {
      leadName,
      leadPhone,
      channelPhone,
      channelName,
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

    const n8nEndCallUrl = process.env.N8N_END_CALL_URL || "https://n8n.automatedsolarbiz.com/webhook/348bc6fe-ffed-4689-bd40-064bf723fda8";
    if (n8nEndCallUrl) {
      try {
        const n8nRes = await fetch(n8nEndCallUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(n8nPayload),
        });
        console.log("N8N end-of-call webhook response:", n8nRes.status);

        // If N8N responds with a GHL contact ID, update the call record
        if (n8nRes.ok && callRowId) {
          try {
            const n8nData = await n8nRes.json();
            const ghlId = n8nData.contactId || n8nData.contact_id || n8nData.ghlContactId || "";
            if (ghlId) {
              const ghlUrl = `https://app.gohighlevel.com/v2/location/${GHL_LOCATION}/contacts/detail/${ghlId}`;
              await sql`UPDATE calls SET ghl_contact_url = ${ghlUrl} WHERE id = ${callRowId}`;
              console.log(`Updated call ${callRowId} with GHL contact: ${ghlId}`);
            }
          } catch {
            // Response wasn't JSON or had no contact ID — that's fine
          }
        }
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
