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

function extractNameFromTranscript(
  messages: UltravoxMessage[],
  shortSummary: string
): string {
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
        const reply = messages[i + 1];
        if (reply?.role === "user" && reply.text) {
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
    .filter((m) => m.role === "agent" && m.text)
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

function extractCallDetails(messages: UltravoxMessage[]): CallDetails {
  const details: CallDetails = {};

  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    if (msg.role !== "agent" || !msg.text) continue;
    const lower = msg.text.toLowerCase();

    let reply = "";
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j].role === "user" && messages[j].text) {
        reply = messages[j].text!.trim();
        break;
      }
      if (messages[j].role === "agent") break;
    }
    if (!reply) continue;

    if (!details.homeowner && (lower.includes("own the home") || lower.includes("own your home") || lower.includes("renting right now") || lower.includes("homeowner"))) {
      details.homeowner = reply;
    }
    if (!details.location && (lower.includes("whereabouts") || lower.includes("located") || lower.includes("city and state") || lower.includes("where are you"))) {
      details.location = reply;
    }
    if (!details.dwelling && (lower.includes("townhome") || lower.includes("condo") || lower.includes("single family") || lower.includes("type deal") || lower.includes("house or") || lower.includes("type of home"))) {
      details.dwelling = reply;
    }
    if (!details.bill && (lower.includes("electric bill") || lower.includes("bill runs") || lower.includes("bill run"))) {
      details.bill = reply;
    }
    if (!details.credit && lower.includes("credit") && (lower.includes("score") || lower.includes("looking like") || lower.includes("ballpark") || lower.includes("roughly"))) {
      details.credit = reply;
    }
    if (!details.roof && lower.includes("roof") && (lower.includes("old") || lower.includes("shape") || lower.includes("age") || lower.includes("decent"))) {
      details.roof = reply;
    }
    if (!details.shade && (lower.includes("shaded") || lower.includes("shade") || (lower.includes("sun") && lower.includes("roof")) || (lower.includes("tree") && lower.includes("roof")))) {
      details.shade = reply;
    }
    if (!details.decision_makers && (lower.includes("spouse") || lower.includes("decision") || lower.includes("co-owner") || lower.includes("anyone else"))) {
      details.decision_makers = reply;
    }
    if (!details.address && (lower.includes("address") || (lower.includes("property") && lower.includes("pull up")))) {
      details.address = reply;
    }
  }

  for (const msg of messages) {
    if (msg.role === "tool_result" && msg.toolName === "bookAppointment" && msg.text) {
      try {
        const r = JSON.parse(msg.text);
        if (r.appointmentTime) details.appointment = r.appointmentTime;
        else if (r.time) details.appointment = r.time;
      } catch { /* not json */ }
    }
  }

  return details;
}

function buildOneliner(details: CallDetails, fallback: string): string {
  const parts: string[] = [];
  if (details.location) parts.push(details.location.replace(/^\s+/, ""));
  if (details.dwelling) parts.push(details.dwelling.replace(/^\s+/, ""));
  if (details.bill) parts.push(details.bill.replace(/^\s+/, ""));
  if (details.credit) parts.push("Credit " + details.credit.replace(/^\s+/, ""));
  if (parts.length >= 2) return parts.join(" · ").slice(0, 100);
  return fallback.slice(0, 80);
}

export async function POST(req: NextRequest) {
  try {
    const sql = getDb();
    const settingsRows = await sql`SELECT ultravox_api_key FROM settings WHERE id = 1`;
    const apiKey = process.env.ULTRAVOX_API_KEY || settingsRows[0]?.ultravox_api_key || "";

    if (!apiKey) {
      return NextResponse.json({ error: "No Ultravox API key" }, { status: 500 });
    }

    // Get ALL calls that have recordings (callId embedded in recording_url)
    const calls = await sql`SELECT id, recording_url, short_summary, duration_seconds, lead_name, call_details FROM calls ORDER BY id DESC`;

    let updated = 0;
    let skipped = 0;

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

      // Extract structured call details
      const callDetails = extractCallDetails(messages);
      const callDetailsJson = Object.keys(callDetails).length > 0 ? JSON.stringify(callDetails) : null;
      const oneliner = callDetailsJson ? buildOneliner(callDetails, shortSummary) : shortSummary.slice(0, 80) || "";

      await sql`
        UPDATE calls
        SET outcome = ${outcome}, outcome_sub = ${outcomeSub}, lead_name = ${leadName}, oneliner = ${oneliner}, call_details = ${callDetailsJson}::jsonb
        WHERE id = ${call.id}
      `;
      updated++;
      console.log(`Reprocessed call ${call.id}: outcome=${outcome}, name=${leadName}, details=${Object.keys(callDetails).length} fields`);
    }

    return NextResponse.json({ ok: true, updated, skipped });
  } catch (error) {
    console.error("Reprocess error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
