import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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

  if (summary.includes("callback") || summary.includes("text sent") || summary.includes("front of the line")) {
    return { outcome: "callback", outcomeSub: "Text sent" };
  }

  if (summary.includes("after hours") || summary.includes("tomorrow morning") || summary.includes("locked in")) {
    return { outcome: "after_hours", outcomeSub: "Morning callback" };
  }

  if (durationSeconds < 30) {
    return { outcome: "dropped", outcomeSub: `${durationSeconds}s` };
  }

  return { outcome: "dropped", outcomeSub: `${durationSeconds}s` };
}

export async function POST(req: NextRequest) {
  try {
    const sql = getDb();
    const settingsRows = await sql`SELECT ultravox_api_key FROM settings WHERE id = 1`;
    const apiKey = process.env.ULTRAVOX_API_KEY || settingsRows[0]?.ultravox_api_key || "";

    if (!apiKey) {
      return NextResponse.json({ error: "No Ultravox API key" }, { status: 500 });
    }

    // Get recent calls that have recordings (meaning we have a callId)
    const calls = await sql`SELECT id, recording_url, short_summary, duration_seconds, lead_name FROM calls ORDER BY id DESC LIMIT 10`;

    let updated = 0;

    for (const call of calls) {
      const recUrl = call.recording_url || "";
      const callIdMatch = recUrl.match(/\/api\/recording\/(.+)/);
      if (!callIdMatch) continue;

      const callId = callIdMatch[1];
      const messages = await fetchCallMessages(callId, apiKey);
      if (messages.length === 0) continue;

      const shortSummary = call.short_summary || "";
      const { outcome, outcomeSub } = detectOutcome(messages, "", call.duration_seconds || 0, shortSummary);

      let leadName = call.lead_name;
      if (!leadName || leadName === "Unknown") {
        leadName = extractNameFromTranscript(messages, shortSummary) || "Unknown";
      }

      const oneliner = shortSummary.slice(0, 80) || "";

      await sql`
        UPDATE calls
        SET outcome = ${outcome}, outcome_sub = ${outcomeSub}, lead_name = ${leadName}, oneliner = ${oneliner}
        WHERE id = ${call.id}
      `;
      updated++;
      console.log(`Reprocessed call ${call.id}: outcome=${outcome}, name=${leadName}`);
    }

    return NextResponse.json({ ok: true, updated });
  } catch (error) {
    console.error("Reprocess error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
