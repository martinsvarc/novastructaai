import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

const APP_URL_RAW =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const APP_URL = APP_URL_RAW.replace(/\/+$/, "");

interface Closer {
  name: string;
  phone: string;
  priority: number;
}

interface DayHours {
  enabled: boolean;
  open: string;
  close: string;
}

function xmlResponse(xml: string) {
  return new Response(xml, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function texmlError(message: string) {
  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${message}</Say></Response>`
  );
}

function populatePrompt(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

function getTimeSinceSubmission(submittedAt?: string): string {
  if (!submittedAt) return "recently";
  const diff = Date.now() - new Date(submittedAt).getTime();
  const minutes = diff / (1000 * 60);
  if (minutes < 3) return "just now, moments ago";
  if (minutes < 15) return "a few minutes ago";
  if (minutes < 60) return "within the last hour";
  const hours = diff / (1000 * 60 * 60);
  if (hours < 3) return "a couple hours ago";
  if (hours < 12) return "earlier today";
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 2) return "yesterday";
  if (days < 7) return "a few days ago";
  return "a while back";
}

function isBusinessHours(
  businessHours: Record<string, DayHours> | null
): boolean {
  if (!businessHours) return true;

  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")!.value.toLowerCase();
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value, 10);

  const day = businessHours[weekday];
  if (!day || !day.enabled) return false;

  const currentMinutes = hour * 60 + minute;
  const [openH, openM] = day.open.split(":").map(Number);
  const [closeH, closeM] = day.close.split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  console.log(
    `Business hours check: ${weekday} ${hour}:${minute.toString().padStart(2, "0")} ET — ` +
    `window ${day.open}-${day.close} — ${currentMinutes >= openMinutes && currentMinutes < closeMinutes ? "OPEN" : "CLOSED"}`
  );

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

interface LookupResult {
  found: boolean;
  name?: string;
  contactId?: string;
  billAmount?: string;
  creditRange?: string;
  homeowner?: boolean;
  email?: string;
  submittedAt?: string;
}

async function lookupContactBeforeCall(
  phone: string
): Promise<LookupResult | null> {
  const n8nUrl = process.env.N8N_LOOKUP_CONTACT_URL;
  if (!n8nUrl || !phone) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch(n8nUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.found) return null;
    return data as LookupResult;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// Parse incoming request — supports TeXML (form-encoded) and Call Control (JSON)
async function parseIncoming(req: NextRequest): Promise<{
  callerPhone: string;
  channelPhone: string;
  callSid: string;
  isInbound: boolean;
} | null> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    // TeXML format
    const formData = await req.formData();
    const direction = (formData.get("Direction") as string) || "";
    return {
      callerPhone: (formData.get("From") as string) || "",
      channelPhone: (formData.get("To") as string) || "",
      callSid: (formData.get("CallSid") as string) || "",
      isInbound: direction === "inbound",
    };
  }

  // JSON — could be Call Control or JSON-mode TeXML
  const body = await req.json();

  // Call Control format
  if (body?.data?.event_type) {
    if (body.data.event_type !== "call.initiated") return null;
    const payload = body.data.payload;
    return {
      callerPhone: payload.from || "",
      channelPhone: payload.to || "",
      callSid: payload.call_control_id || "",
      isInbound: payload.direction === "incoming",
    };
  }

  // JSON-mode TeXML
  if (body.From && body.To) {
    return {
      callerPhone: body.From,
      channelPhone: body.To,
      callSid: body.CallSid || "",
      isInbound: body.Direction === "inbound",
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const incoming = await parseIncoming(req);

    if (!incoming) {
      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
    }

    if (!incoming.isInbound) {
      console.log("Ignoring non-inbound call");
      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
    }

    const { callerPhone, channelPhone, callSid } = incoming;
    console.log("Telnyx inbound:", callerPhone, "→", channelPhone, "sid:", callSid);

    const sql = getDb();

    // Fetch settings
    const settingsRows = await sql`SELECT * FROM settings WHERE id = 1`;

    if (settingsRows.length === 0) {
      return texmlError("System not configured. Please try again later.");
    }

    const settings = settingsRows[0];

    // Check for channel-specific scripts
    const cleanChannelPhone = channelPhone.replace(/[^+\d]/g, "");
    const channelRows = await sql`SELECT * FROM channels WHERE phone = ${cleanChannelPhone} OR phone = ${channelPhone}`;
    const channel = channelRows.length > 0 ? channelRows[0] : null;
    if (channel) {
      console.log("Channel matched:", channel.name, channel.phone, "— using channel-specific script:", !!channel.system_prompt);
    } else {
      console.log("No channel match for", channelPhone, "— using global settings");
    }

    // Pre-call GHL lookup via N8N (2s timeout, fallback to empty strings)
    const lookup = await lookupContactBeforeCall(callerPhone);

    const contactId = lookup?.contactId || "unknown";
    const leadName = lookup?.name || "";

    const templateVars: Record<string, string> = {
      leadName,
      leadPhone: callerPhone,
      billAmount: lookup?.billAmount || "",
      creditRange: lookup?.creditRange || "",
      homeowner:
        lookup?.homeowner !== undefined
          ? lookup.homeowner
            ? "yes"
            : "no"
          : "",
      email: lookup?.email || "",
      timeSinceSubmission: getTimeSinceSubmission(lookup?.submittedAt),
    };

    // Use channel script if it exists, otherwise fall back to global settings
    let systemPrompt = populatePrompt(
      (channel?.system_prompt || settings.system_prompt || ""),
      templateVars
    );

    const closers = ((channel?.closers?.length ? channel.closers : settings.closers) || []) as Closer[];

    const channelBizHours = channel?.business_hours as Record<string, DayHours> | null;
    const duringBusinessHours = isBusinessHours(
      (channelBizHours && Object.keys(channelBizHours).length ? channelBizHours : settings.business_hours) as Record<string, DayHours> | null
    );

    // Per-channel close mode: "transfer" (default) or "booking"
    const closeMode = (channel?.close_mode as string) || "transfer";
    const channelCalendarId = (channel?.ghl_calendar_id as string) || settings.ghl_calendar_id || "";

    const scenarioAScript = channel?.scenario_a_script || settings.scenario_a_script ||
      "All our advisors are finishing up with other homeowners right now. I'm sending you a text right now so you stay at the front of the line. Just reply 'Hi' to confirm and an advisor will call you back within 15 minutes. Sound good?";
    const scenarioBScript = channel?.scenario_b_script || settings.scenario_b_script ||
      "Great news — you do qualify for the program. Our advisors are off for the evening, but I don't want you to lose your spot. I'm locking in your information right now, and first thing tomorrow morning one of our advisors will give you a personal call. What time works best for you — earlier in the morning or later in the afternoon?";

    // Booking phrases from settings
    const bookingIntroMsg = settings.booking_intro_msg || "Great news — you qualify for our program! Let me check what appointment times we have available for you.";
    const bookingConfirmMsg = settings.booking_confirm_msg || "You're all set! You'll get a confirmation shortly. One of our advisors will speak with you at that time.";
    const bookingFailMsg = settings.booking_fail_msg || "Let me have someone confirm your time manually — we'll reach out shortly to lock it in.";

    if (duringBusinessHours) {
      if (closeMode === "booking" && channelCalendarId) {
        // ── BOOKING MODE ──
        const directive = `THIS IS DURING BUSINESS HOURS — APPOINTMENT BOOKING MODE.

THE CLOSE — BOOK AN APPOINTMENT
Once all four gates are confirmed, say naturally: "${bookingIntroMsg}" Then call checkAvailability IMMEDIATELY — do NOT ask what day or time they prefer first. The system already knows what times are available and will give you the 2 soonest options.

Present both options naturally. For example: "I have today at 6 PM or tomorrow at 10 AM — which one works better for you?" Let them pick. Once they choose, call the bookAppointment tool with their selected time slot.

After booking confirms, say naturally: "${bookingConfirmMsg}" Do NOT ask for their address.

IF BOOKING FAILS:
Say naturally: "${bookingFailMsg}" Then wrap up warmly.

ENDING CALLS: Never hang up abruptly. After booking completes, always ask "Is there anything else before I let you go?" and wait for their response. Only use hangUp after they say goodbye or confirm they're good.
——————————————————————————\n\n`;

        systemPrompt = directive + systemPrompt + `\n\n——————————————————————————
REMINDER: Call checkAvailability right after qualifying — do NOT ask about day/time preferences first. Present the 2 options the tool gives you. Use bookAppointment with the lead's chosen slot. Never hang up without saying goodbye.`;
      } else {
        // ── TRANSFER MODE ──
        const closerNames = closers
          .sort((a, b) => a.priority - b.priority)
          .map((c) => c.name)
          .join(", ");

        const directive = `THIS IS DURING BUSINESS HOURS.

THE CLOSE — LIVE TRANSFER
Once all four gates are confirmed, say something like: "Great, you qualify for our program... please hold while I find an available advisor for you. Okay, I found one — I'm transferring you now." Then call the transferCall tool immediately. Do NOT ask for their address. Do NOT offer to schedule.
${closerNames ? `Available consultants: ${closerNames}.` : ""}

IF TRANSFER FAILS (you'll get an error response from transferCall):
Use the Scenario A approach — deliver this naturally in your own words: "${scenarioAScript}" Then call sendTextScenarioA after they confirm.

ENDING CALLS: Never hang up abruptly. After any scenario completes, always ask "Is there anything else before I let you go?" and wait for their response. Only use hangUp after they say goodbye or confirm they're good.
——————————————————————————\n\n`;

        systemPrompt = directive + systemPrompt + `\n\n——————————————————————————
REMINDER: Use transferCall the moment the lead qualifies. If transfer fails, fall back to sendTextScenarioA. Never hang up without saying goodbye and giving them a chance to respond.`;
      }
    } else {
      const directive = `AFTER HOURS MODE — SCENARIO B.

It is currently after business hours. Our advisors are not available right now.

THE CLOSE — AFTER HOURS LOCK-IN
Once all four gates are confirmed, deliver this naturally in your own words: "${scenarioBScript}"

After they give a preference, call the notifyScenarioB tool with their timePreference (e.g. "morning" or "afternoon"). Then confirm warmly that they're locked in.

ENDING CALLS: Never hang up abruptly. Always ask "Is there anything else before I let you go?" and wait for their response. Only use hangUp after they say goodbye or confirm they're good. Do NOT attempt to transfer. Do NOT ask for their address.
——————————————————————————\n\n`;

      systemPrompt = directive + systemPrompt;
    }

    // Build selectedTools
    const selectedTools: object[] = [
      {
        temporaryTool: {
          modelToolName: "lookupContact",
          description:
            "Look up information about the lead calling based on their phone number. Only use this if specific data is missing.",
          dynamicParameters: [],
          staticParameters: [
            { name: "phone", location: "PARAMETER_LOCATION_BODY", value: callerPhone },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/lookup-contact`,
            httpMethod: "POST",
          },
        },
      },
      { toolName: "hangUp" },
      {
        temporaryTool: {
          modelToolName: "holdLine",
          description:
            "Put the call on hold when the caller asks for a moment. If they said how long, use that duration. Only ask how long if they were vague.",
          defaultReaction: "AGENT_REACTION_LISTENS",
          timeout: "120s",
          dynamicParameters: [
            {
              name: "waitSeconds",
              location: "PARAMETER_LOCATION_BODY",
              schema: {
                type: "string",
                description: "Seconds to wait. 'a minute' = 60, '30 seconds' = 30.",
              },
              required: true,
            },
          ],
          staticParameters: [
            { name: "phone", location: "PARAMETER_LOCATION_BODY", value: callerPhone },
            { name: "leadName", location: "PARAMETER_LOCATION_BODY", value: leadName },
            { name: "contactId", location: "PARAMETER_LOCATION_BODY", value: contactId },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/hold-line`,
            httpMethod: "POST",
          },
        },
      },
    ];

    if (duringBusinessHours) {
      if (closeMode === "booking" && channelCalendarId) {
        // ── BOOKING TOOLS ──
        selectedTools.push({
          temporaryTool: {
            modelToolName: "checkAvailability",
            description:
              "Check available appointment times. Call this when the lead is qualified and ready to book.",
            dynamicParameters: [
              {
                name: "timezone",
                location: "PARAMETER_LOCATION_BODY",
                schema: {
                  type: "string",
                  description: "The lead's timezone, e.g. 'America/New_York'. Default to Eastern if unknown.",
                },
                required: false,
              },
            ],
            staticParameters: [
              { name: "calendarId", location: "PARAMETER_LOCATION_BODY", value: channelCalendarId },
            ],
            http: {
              baseUrlPattern: `${APP_URL}/api/tools/calendar-availability`,
              httpMethod: "POST",
            },
          },
        });

        selectedTools.push({
          temporaryTool: {
            modelToolName: "bookAppointment",
            description:
              "Book the appointment after the lead has chosen a time slot. Pass the exact ISO time string from the availability results.",
            dynamicParameters: [
              {
                name: "selectedSlot",
                location: "PARAMETER_LOCATION_BODY",
                schema: {
                  type: "string",
                  description: "The ISO datetime string of the slot the lead chose, from the rawSlots in the checkAvailability response.",
                },
                required: true,
              },
            ],
            staticParameters: [
              { name: "calendarId", location: "PARAMETER_LOCATION_BODY", value: channelCalendarId },
              { name: "contactId", location: "PARAMETER_LOCATION_BODY", value: contactId },
              { name: "leadName", location: "PARAMETER_LOCATION_BODY", value: leadName },
              { name: "phone", location: "PARAMETER_LOCATION_BODY", value: callerPhone },
            ],
            http: {
              baseUrlPattern: `${APP_URL}/api/tools/book-appointment`,
              httpMethod: "POST",
            },
          },
        });
      } else {
        // ── TRANSFER TOOLS ──
        selectedTools.push({
          temporaryTool: {
            modelToolName: "transferCall",
            description:
              "Transfer this call to a live consultant. Call this tool the moment the lead is qualified.",
            defaultReaction: "AGENT_REACTION_SPEAKS",
            dynamicParameters: [],
            staticParameters: [
              { name: "callControlId", location: "PARAMETER_LOCATION_BODY", value: callSid },
              { name: "contactId", location: "PARAMETER_LOCATION_BODY", value: contactId },
            ],
            automaticParameters: [
              { name: "ultravoxCallId", location: "PARAMETER_LOCATION_BODY", knownValue: "KNOWN_PARAM_CALL_ID" },
            ],
            http: {
              baseUrlPattern: `${APP_URL}/api/tools/warm-transfer`,
              httpMethod: "POST",
            },
          },
        });

        selectedTools.push({
          temporaryTool: {
            modelToolName: "sendTextScenarioA",
            description:
              "Send a callback text to the lead when all advisors are busy. Only use this if transferCall failed.",
            dynamicParameters: [],
            staticParameters: [
              { name: "phone", location: "PARAMETER_LOCATION_BODY", value: callerPhone },
              { name: "leadName", location: "PARAMETER_LOCATION_BODY", value: leadName },
              { name: "contactId", location: "PARAMETER_LOCATION_BODY", value: contactId },
            ],
            http: {
              baseUrlPattern: `${APP_URL}/api/tools/scenario-a`,
              httpMethod: "POST",
            },
          },
        });
      }
    } else {
      selectedTools.push({
        temporaryTool: {
          modelToolName: "notifyScenarioB",
          description:
            "Lock in the lead's information for a morning callback. Use this after hours when the lead is qualified.",
          dynamicParameters: [
            {
              name: "timePreference",
              location: "PARAMETER_LOCATION_BODY",
              schema: {
                type: "string",
                description: "The lead's preferred callback time — 'morning' or 'afternoon'",
              },
              required: true,
            },
          ],
          staticParameters: [
            { name: "phone", location: "PARAMETER_LOCATION_BODY", value: callerPhone },
            { name: "leadName", location: "PARAMETER_LOCATION_BODY", value: leadName },
            { name: "contactId", location: "PARAMETER_LOCATION_BODY", value: contactId },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/scenario-b`,
            httpMethod: "POST",
          },
        },
      });
    }

    // Use ULTRAVOX_API_KEY env var (set in Vercel), fall back to DB setting
    const ultravoxApiKey = process.env.ULTRAVOX_API_KEY || settings.ultravox_api_key || "";

    // Create Ultravox call with Telnyx medium (empty — audio bridged via TeXML Stream)
    const ultravoxRes = await fetch("https://api.ultravox.ai/api/calls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ultravoxApiKey,
      },
      body: JSON.stringify({
        systemPrompt,
        model: "fixie-ai/ultravox-v0.7",
        voice: settings.ultravox_voice_id || undefined,
        medium: { telnyx: {} },
        callbacks: { ended: { url: `${APP_URL}/api/webhooks/ultravox` } },
        firstSpeakerSettings: (channel?.opener_speaks_first !== undefined ? channel.opener_speaks_first !== false : settings.opener_speaks_first !== false)
          ? { agent: { text: channel?.opener || settings.opener || "hey there" } }
          : { user: {} },
        recordingEnabled: true,
        selectedTools,
        inactivityMessages: [
          {
            duration: `${settings.inactivity_1_seconds ?? 8}s`,
            message: settings.inactivity_1_message || "Hey, are you still there?",
          },
          {
            duration: `${settings.inactivity_2_seconds ?? 10}s`,
            message: settings.inactivity_2_message || "I'm having a little trouble hearing you... are you there?",
            endBehavior: "END_BEHAVIOR_HANG_UP_SOFT",
          },
        ],
        experimentalSettings: {
          turnEndpointDelay: 384,
          frameActivationThreshold: settings.vad_sensitivity ?? 0.15,
        },
        maxDuration: "600s",
        timeExceededMessage: "We've been on for a while. I'll have someone follow up with you. Have a great day!",
        metadata: {
          contactId,
          leadPhone: callerPhone,
          leadName,
          channelPhone,
        },
      }),
    });

    if (!ultravoxRes.ok) {
      const err = await ultravoxRes.text();
      console.error("Ultravox API error:", ultravoxRes.status, err);
      return texmlError("We are experiencing technical difficulties. Please try again later.");
    }

    const ultravoxData = await ultravoxRes.json();
    const joinUrl = ultravoxData.joinUrl;

    console.log("Ultravox call created:", ultravoxData.callId, "joinUrl:", joinUrl ? "OK" : "MISSING");

    if (!joinUrl) {
      console.error("No joinUrl in Ultravox response:", JSON.stringify(ultravoxData));
      return texmlError("We are experiencing technical difficulties. Please try again later.");
    }

    // Return TeXML — Connect + Stream bridges audio bidirectionally to Ultravox
    const texml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${joinUrl}" bidirectionalMode="rtp" codec="L16" bidirectionalCodec="L16" bidirectionalSamplingRate="16000"/>
  </Connect>
</Response>`;

    console.log("Returning TeXML Stream response");
    return xmlResponse(texml);
  } catch (error) {
    console.error("Telnyx inbound error:", error);
    return texmlError("We are experiencing technical difficulties. Please try again later.");
  }
}
