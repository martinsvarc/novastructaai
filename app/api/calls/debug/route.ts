import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const settingsRows = await sql`SELECT ultravox_api_key FROM settings WHERE id = 1`;
    const apiKey = process.env.ULTRAVOX_API_KEY || settingsRows[0]?.ultravox_api_key || "";
    const orKey = process.env.OPENROUTER_API_KEY || "";

    // Get first call with a recording
    const calls = await sql`SELECT id, recording_url FROM calls WHERE recording_url != '' ORDER BY id DESC LIMIT 1`;
    if (calls.length === 0) return NextResponse.json({ error: "No calls with recordings" });

    const recUrl = calls[0].recording_url;
    const callIdMatch = recUrl.match(/\/api\/recording\/(.+)/);
    if (!callIdMatch) return NextResponse.json({ error: "No callId in recording_url" });

    const callId = callIdMatch[1];

    // Fetch messages from Ultravox
    const res = await fetch(
      `https://api.ultravox.ai/api/calls/${callId}/messages`,
      { headers: { "X-API-Key": apiKey } }
    );
    const rawData = await res.json();
    const messages = rawData.results || rawData;

    // Show first 8 messages with their roles
    const sample = (messages as Record<string, unknown>[]).slice(0, 8).map((m) => ({
      role: m.role,
      text: ((m.text as string) || "").slice(0, 100),
      toolName: m.toolName || undefined,
    }));

    // Build transcript the same way extraction does
    const transcript = (messages as Record<string, unknown>[])
      .filter((m) => ((m.role as string) === "agent" || (m.role as string) === "user" || (m.role as string) === "MESSAGE_ROLE_AGENT" || (m.role as string) === "MESSAGE_ROLE_USER") && m.text)
      .map((m) => {
        const role = (m.role as string).includes("AGENT") || (m.role as string) === "agent" ? "Agent" : "Caller";
        return `${role}: ${((m.text as string) || "").trim()}`;
      })
      .join("\n");

    // All unique roles in this call
    const allRoles = [...new Set((messages as Record<string, unknown>[]).map((m) => m.role as string))];

    return NextResponse.json({
      callId,
      totalMessages: (messages as unknown[]).length,
      allRoles,
      sampleMessages: sample,
      transcriptLength: transcript.length,
      transcriptPreview: transcript.slice(0, 500),
      hasUltravoxKey: !!apiKey,
      hasOpenRouterKey: !!orKey,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) });
  }
}
