import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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

async function extractCallDetails(messages: UltravoxMessage[]): Promise<CallDetails> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return {};

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
        model: "google/gemini-2.0-flash-lite-001",
        messages: [
          { role: "system", content: EXTRACT_PROMPT },
          { role: "user", content: transcript },
        ],
        temperature: 0,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("OpenRouter extraction error:", res.status, errBody);
      return {};
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    console.log("LLM extraction raw:", content.slice(0, 200));
    const jsonStr = content.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    return JSON.parse(jsonStr) as CallDetails;
  } catch (err) {
    console.error("Call details extraction error:", err);
    return {};
  }
}

function extractNameFromTranscript(
  messages: UltravoxMessage[],
  shortSummary: string
): string {
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    if ((msg.role === "agent" || msg.role === "MESSAGE_ROLE_AGENT") && msg.text) {
      const lower = msg.text.toLowerCase();
      if (
        lower.includes("your name") ||
        lower.includes("who am i speaking") ||
        lower.includes("can i get your name") ||
        lower.includes("may i have your name") ||
        lower.includes("what should i call you")
      ) {
        const reply = messages[i + 1];
        if (reply && (reply.role === "user" || reply.role === "MESSAGE_ROLE_USER") && reply.text) {
          const cleaned = reply.text
            .replace(/^(my name is|i'm|it's|this is|i am|yeah|yes|hey|hi|sure)\s*/i, "")
            .replace(/[.,!?]+$/, "")
            .trim();
          const words = cleaned.split(/\s+/);
          if (words.length >= 1 && words.length <= 4 && cleaned.length > 1 && cleaned.length < 40) {
            return words
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
              .join(" ");
          }
        }
      }
    }
  }

  const nameMatch = shortSummary.match(
    /(?:caller|lead|customer|user|homeowner|person)\s+(?:named?\s+|is\s+|was\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/
  );
  if (nameMatch) return nameMatch[1];

  const startMatch = shortSummary.match(/^([A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,15})?)\s+(?:qualified|called|asked|wanted|inquired|expressed|is\s+interested|was\s+interested|said|mentioned|confirmed|agreed|requested)/);
  if (startMatch) return startMatch[1];

  for (const msg of messages) {
    if ((msg.role === "agent" || msg.role === "MESSAGE_ROLE_AGENT") && msg.text) {
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

function detectOutcome(
  messages: UltravoxMessage[],
  endReason: string,
  durationSeconds: number,
  shortSummary: string
): { outcome: string; outcomeSub: string } {
  const allToolNames = messages
    .map((m) => m.toolName || "")
    .filter(Boolean);

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
    return { outcome: "booked", outcomeSub: "" };
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

  const summary = shortSummary.toLowerCase();

  if (
    summary.includes("callback") ||
    summary.includes("text sent") ||
    summary.includes("reply hi") ||
    summary.includes("front of the line") ||
    summary.includes("advisor unavailability")
  ) {
    return { outcome: "callback", outcomeSub: "Text sent" };
  }

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
    summary.includes("after hours") ||
    summary.includes("tomorrow morning") ||
    summary.includes("locked in") ||
    summary.includes("advisors are off")
  ) {
    return { outcome: "after_hours", outcomeSub: "Morning callback" };
  }

  const agentText = messages
    .filter((m) => (m.role === "agent" || m.role === "MESSAGE_ROLE_AGENT") && m.text)
    .map((m) => m.text!.toLowerCase())
    .join(" ");

  if (
    agentText.includes("not a homeowner") ||
    agentText.includes("renter") ||
    summary.includes("renter") ||
    summary.includes("not a homeowner")
  ) {
    return { outcome: "disqualified", outcomeSub: "Renter" };
  }

  if (durationSeconds < 30) {
    return { outcome: "dropped", outcomeSub: `${durationSeconds}s` };
  }

  return { outcome: "dropped", outcomeSub: `${durationSeconds}s` };
}

function buildOneliner(details: CallDetails, fallback: string): string {
  const parts: string[] = [];
  if (details.location) parts.push(details.location);
  if (details.dwelling) parts.push(details.dwelling);
  if (details.bill) parts.push(details.bill);
  if (details.credit) parts.push("Credit " + details.credit);
  if (parts.length >= 2) return parts.join(" · ").slice(0, 100);
  return fallback.slice(0, 80);
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");

    const sql = getDb();
    const settingsRows = await sql`SELECT ultravox_api_key FROM settings WHERE id = 1`;
    const apiKey = process.env.ULTRAVOX_API_KEY || settingsRows[0]?.ultravox_api_key || "";

    if (!apiKey) {
      return NextResponse.json({ error: "No Ultravox API key" }, { status: 500 });
    }

    // Get calls that have recordings (optionally limited)
    const calls = limitParam
      ? await sql`SELECT id, recording_url, short_summary, duration_seconds, lead_name, call_details FROM calls WHERE recording_url != '' ORDER BY id DESC LIMIT ${parseInt(limitParam)}`
      : await sql`SELECT id, recording_url, short_summary, duration_seconds, lead_name, call_details FROM calls ORDER BY id DESC`;

    let updated = 0;
    let skipped = 0;
    const results: { id: number; fields: number; name: string }[] = [];

    for (const call of calls) {
      const recUrl = call.recording_url || "";
      const callIdMatch = recUrl.match(/\/api\/recording\/(.+)/);
      if (!callIdMatch) { skipped++; continue; }

      const callId = callIdMatch[1];
      const messages = await fetchCallMessages(callId, apiKey);
      if (messages.length === 0) { skipped++; continue; }

      const shortSummary = call.short_summary || "";
      const { outcome, outcomeSub } = detectOutcome(messages, "", call.duration_seconds || 0, shortSummary);

      let leadName = call.lead_name;
      if (!leadName || leadName === "Unknown") {
        leadName = extractNameFromTranscript(messages, shortSummary) || "Unknown";
      }

      // LLM-based extraction
      const callDetails = await extractCallDetails(messages);
      const fieldCount = Object.keys(callDetails).length;
      const callDetailsJson = fieldCount > 0 ? JSON.stringify(callDetails) : null;
      const oneliner = callDetailsJson ? buildOneliner(callDetails, shortSummary) : shortSummary.slice(0, 80) || "";

      await sql`
        UPDATE calls
        SET outcome = ${outcome}, outcome_sub = ${outcomeSub}, lead_name = ${leadName}, oneliner = ${oneliner}, call_details = ${callDetailsJson}::jsonb
        WHERE id = ${call.id}
      `;
      updated++;
      results.push({ id: call.id, fields: fieldCount, name: leadName });
      console.log(`Reprocessed call ${call.id}: outcome=${outcome}, name=${leadName}, details=${fieldCount} fields`);
    }

    return NextResponse.json({ ok: true, updated, skipped, results });
  } catch (error) {
    console.error("Reprocess error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
