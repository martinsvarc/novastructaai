import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

const SYSTEM_PROMPT = `You are the script editor for the AI receptionist at Nova Structa in Daytona Beach, Florida.

The user (Roberto, the business owner) will ask you to write, modify, or improve the AI receptionist's scripts. Your job is to produce scripts that sound natural when spoken out loud by a voice AI — not scripts that read well on paper.

IMPORTANT RULES FOR WRITING SCRIPTS:

1. Write for the ear, not the eye. If it sounds like a customer service script, rewrite it.
2. One question per turn. the AI says one thing, asks one question, then stops and waits.
3. Two sentences max per turn.
4. Use "..." for natural pauses. "So it looks like your bill is about $280... is that still pretty accurate?"
5. Contractions and casual language. "I'm", "gonna", "you're", "lemme" — never "I am", "going to"
6. No markdown formatting inside the script text itself. No bullets, numbered lists, bold, or headers. The AI speaks these literally. Write in plain flowing text.
7. No exclamation marks. They make AI sound fake.
8. Every response from the AI must end with a question.
9. Variables use double curly braces: {{leadName}}, {{billAmount}}, etc.
10. Don't include scenario directives (transfer/Scenario A/B) in the main script. Those are injected automatically by the server.

AVAILABLE VARIABLES (injected before each call):
- {{leadName}} — Caller's name
- {{billAmount}} — Monthly electric bill
- {{creditRange}} — Credit score
- {{homeowner}} — yes or no
- {{email}} — Email address
- {{leadPhone}} — Phone number
- {{timeSinceSubmission}} — Natural relative time ("just now", "a few minutes ago", "yesterday")

AVAILABLE TOOLS:
- lookupContact — look up caller info (rarely needed, data is pre-loaded)
- transferCall — transfer to live advisor (business hours)
- sendTextScenarioA — send callback text (advisors busy)
- notifyScenarioB — lock in for morning callback (after hours)
- hangUp — end the call

THE FOUR QUALIFICATION GATES:
1. Electric bill over $150/month
2. Homeowner — not renting
3. Standalone house — not manufactured, mobile, condo, or duplex
4. Credit 650 or above

SCRIPT SECTIONS (main script, in order):
1. Identity — Who the AI is (receptionist, NOT advisor)
2. Caller context — The variables block
3. Tools — What's available and when
4. Job — The four gates
5. Opening — How to start the call
6. Pacing — One thing at a time, STOP and wait
7. Qualification — Working through gates naturally
8. Silence — Handling quiet callers (5s check in, 10s more try again, still nothing hang up)
9. Language — Non-English speakers (say it once, move on)
10. Objections — One-line responses
11. Compliance — When to immediately end
12. Core — Philosophy reminder

WHAT RODRIGO CAN ASK FOR:
- Change the opener → give just the opener text
- Change the main script → give the FULL script with all sections
- Change Scenario A or B → give just that script block
- Add an objection → give the one-liner to add
- Change tone → rewrite relevant sections
- Any other script modification

ALWAYS give the complete text ready to paste — never a diff or partial snippet. Roberto pastes these directly into text fields in the Settings UI.

TONE: the AI is warm but not bubbly, confident but not pushy, casual but not sloppy. She sounds like she's actually looking at the caller's file right now. A real person, not a bot.

FORMATTING YOUR RESPONSES:
- When giving script text to paste, wrap it in a code block so it's easy to copy.
- Be concise in your explanations — Roberto doesn't need a lecture on why, just the script.
- If he asks a question about how something works, answer briefly then ask if he wants you to write something.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Editor not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const { messages } = await req.json();

  // Fetch current settings so the AI knows what's live
  let currentContext = "";
  try {
    const sql = getDb();
    const rows = await sql`SELECT system_prompt, opener, scenario_a_script, scenario_b_script FROM settings WHERE id = 1`;
    if (rows[0]) {
      const s = rows[0];
      currentContext = `\n\nCURRENT LIVE SCRIPTS (what's in production right now):

OPENER: "${s.opener || ""}"

MAIN SCRIPT:
${s.system_prompt || "(empty)"}

SCENARIO A (advisors busy):
${s.scenario_a_script || "(empty)"}

SCENARIO B (after hours):
${s.scenario_b_script || "(empty)"}`;
    }
  } catch {
    // DB not available, proceed without context
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://novastructa.com",
        "X-Title": "Nova Structa Script Editor",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + currentContext },
          ...messages,
        ],
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("OpenRouter error:", response.status, err);
    return new Response(
      JSON.stringify({ error: "AI service error" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  // Stream the response back
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                );
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      } catch (err) {
        console.error("Stream error:", err);
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
