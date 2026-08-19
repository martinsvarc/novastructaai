import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function maskCred(val: string): string {
  if (!val || val.length < 4) return val ? "****" : "";
  return "****" + val.slice(-4);
}

export async function GET() {
  try {
  const sql = getDb();
  const rows = await sql`SELECT * FROM settings WHERE id = 1`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "No settings found" }, { status: 404 });
  }

  const s = rows[0];
  return NextResponse.json({
    system_prompt: s.system_prompt,
    opener: s.opener || "hey there",
    opener_speaks_first: s.opener_speaks_first !== false,
    transfer_enabled: s.transfer_enabled,
    closers: s.closers,
    telnyx_phone: s.telnyx_phone || "",
    ultravox_api_key: maskCred(s.ultravox_api_key),
    ultravox_agent_id: s.ultravox_agent_id,
    ultravox_voice_id: s.ultravox_voice_id,
    ghl_calendar_id: s.ghl_calendar_id,
    booking_intro_msg: s.booking_intro_msg || "Great news — you qualify for our program! Let me check what appointment times we have available for you.",
    booking_confirm_msg: s.booking_confirm_msg || "You're all set! You'll get a confirmation shortly. One of our advisors will speak with you at that time.",
    booking_fail_msg: s.booking_fail_msg || "Let me have someone confirm your time manually — we'll reach out shortly to lock it in.",
    booking_min_hours_ahead: s.booking_min_hours_ahead ?? 3,
    scenario_a_script: s.scenario_a_script || "",
    scenario_b_script: s.scenario_b_script || "",
    transfer_connecting_msg: s.transfer_connecting_msg || "Connecting you now.",
    transfer_retry_msg: s.transfer_retry_msg || "Let me try another consultant for you.",
    scenario_a_opener: s.scenario_a_opener || "Hey, I'm sorry about the wait. All our advisors are finishing up with other homeowners right now — which actually means they're in high demand. Here's what I'll do...",
    transfer_error_msg: s.transfer_error_msg || "Our consultant is unavailable right now. We will have someone call you back shortly.",
    inactivity_1_seconds: s.inactivity_1_seconds ?? 8,
    inactivity_1_message: s.inactivity_1_message || "Hey, are you still there?",
    inactivity_2_seconds: s.inactivity_2_seconds ?? 10,
    inactivity_2_message: s.inactivity_2_message || "I'm having a little trouble hearing you... are you there?",
    vad_sensitivity: s.vad_sensitivity ?? 0.15,
    business_hours: s.business_hours || {
      monday: { enabled: true, open: "09:00", close: "18:00" },
      tuesday: { enabled: true, open: "09:00", close: "18:00" },
      wednesday: { enabled: true, open: "09:00", close: "18:00" },
      thursday: { enabled: true, open: "09:00", close: "18:00" },
      friday: { enabled: true, open: "09:00", close: "18:00" },
      saturday: { enabled: true, open: "09:00", close: "14:00" },
      sunday: { enabled: false, open: "", close: "" },
    },
  });
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const sql = getDb();

  // Full-row update using tagged template
  const current = await sql`SELECT * FROM settings WHERE id = 1`;
  if (current.length === 0) {
    return NextResponse.json({ error: "No settings found" }, { status: 404 });
  }

  const row = current[0];

  const newSystemPrompt =
    "system_prompt" in body ? body.system_prompt : row.system_prompt;
  const newOpener =
    "opener" in body ? body.opener : (row.opener || "hey there");
  const newOpenerSpeaksFirst =
    "opener_speaks_first" in body
      ? Boolean(body.opener_speaks_first)
      : row.opener_speaks_first !== false;
  const newTransferEnabled =
    "transfer_enabled" in body
      ? Boolean(body.transfer_enabled)
      : row.transfer_enabled;
  const newClosers =
    "closers" in body ? JSON.stringify(body.closers) : JSON.stringify(row.closers);
  const newTelnyxPhone =
    "telnyx_phone" in body ? body.telnyx_phone : (row.telnyx_phone || "");
  const newUltravoxKey =
    "ultravox_api_key" in body &&
    !String(body.ultravox_api_key).startsWith("****")
      ? body.ultravox_api_key
      : row.ultravox_api_key;
  const newUltravoxAgentId =
    "ultravox_agent_id" in body
      ? body.ultravox_agent_id
      : row.ultravox_agent_id;
  const newUltravoxVoiceId =
    "ultravox_voice_id" in body
      ? body.ultravox_voice_id
      : row.ultravox_voice_id;
  const newGhlCalendarId =
    "ghl_calendar_id" in body ? body.ghl_calendar_id : row.ghl_calendar_id;
  const newBusinessHours =
    "business_hours" in body
      ? JSON.stringify(body.business_hours)
      : JSON.stringify(row.business_hours || {});
  const newScenarioAScript =
    "scenario_a_script" in body ? body.scenario_a_script : (row.scenario_a_script || "");
  const newScenarioBScript =
    "scenario_b_script" in body ? body.scenario_b_script : (row.scenario_b_script || "");
  const newTransferConnectingMsg =
    "transfer_connecting_msg" in body ? body.transfer_connecting_msg : (row.transfer_connecting_msg || "Connecting you now.");
  const newTransferRetryMsg =
    "transfer_retry_msg" in body ? body.transfer_retry_msg : (row.transfer_retry_msg || "Let me try another consultant for you.");
  const newScenarioAOpener =
    "scenario_a_opener" in body ? body.scenario_a_opener : (row.scenario_a_opener || "");
  const newTransferErrorMsg =
    "transfer_error_msg" in body ? body.transfer_error_msg : (row.transfer_error_msg || "Our consultant is unavailable right now. We will have someone call you back shortly.");
  const newInactivity1Seconds =
    "inactivity_1_seconds" in body ? Number(body.inactivity_1_seconds) : (row.inactivity_1_seconds ?? 8);
  const newInactivity1Message =
    "inactivity_1_message" in body ? body.inactivity_1_message : (row.inactivity_1_message || "Hey, are you still there?");
  const newInactivity2Seconds =
    "inactivity_2_seconds" in body ? Number(body.inactivity_2_seconds) : (row.inactivity_2_seconds ?? 10);
  const newInactivity2Message =
    "inactivity_2_message" in body ? body.inactivity_2_message : (row.inactivity_2_message || "I'm having a little trouble hearing you... are you there?");
  const newVadSensitivity =
    "vad_sensitivity" in body ? Number(body.vad_sensitivity) : (row.vad_sensitivity ?? 0.15);
  const newBookingIntroMsg =
    "booking_intro_msg" in body ? body.booking_intro_msg : (row.booking_intro_msg || "Great news — you qualify for our program! Let me check what appointment times we have available for you.");
  const newBookingConfirmMsg =
    "booking_confirm_msg" in body ? body.booking_confirm_msg : (row.booking_confirm_msg || "You're all set! You'll get a confirmation shortly. One of our advisors will speak with you at that time.");
  const newBookingFailMsg =
    "booking_fail_msg" in body ? body.booking_fail_msg : (row.booking_fail_msg || "Let me have someone confirm your time manually — we'll reach out shortly to lock it in.");
  const newBookingMinHoursAhead =
    "booking_min_hours_ahead" in body ? Number(body.booking_min_hours_ahead) : (row.booking_min_hours_ahead ?? 3);

  await sql`
    UPDATE settings SET
      system_prompt = ${newSystemPrompt},
      opener = ${newOpener},
      opener_speaks_first = ${newOpenerSpeaksFirst},
      transfer_enabled = ${newTransferEnabled},
      closers = ${newClosers}::jsonb,
      telnyx_phone = ${newTelnyxPhone},
      ultravox_api_key = ${newUltravoxKey},
      ultravox_agent_id = ${newUltravoxAgentId},
      ultravox_voice_id = ${newUltravoxVoiceId},
      ghl_calendar_id = ${newGhlCalendarId},
      business_hours = ${newBusinessHours}::jsonb,
      scenario_a_script = ${newScenarioAScript},
      scenario_b_script = ${newScenarioBScript},
      transfer_connecting_msg = ${newTransferConnectingMsg},
      transfer_retry_msg = ${newTransferRetryMsg},
      scenario_a_opener = ${newScenarioAOpener},
      transfer_error_msg = ${newTransferErrorMsg},
      inactivity_1_seconds = ${newInactivity1Seconds},
      inactivity_1_message = ${newInactivity1Message},
      inactivity_2_seconds = ${newInactivity2Seconds},
      inactivity_2_message = ${newInactivity2Message},
      vad_sensitivity = ${newVadSensitivity},
      booking_intro_msg = ${newBookingIntroMsg},
      booking_confirm_msg = ${newBookingConfirmMsg},
      booking_fail_msg = ${newBookingFailMsg},
      booking_min_hours_ahead = ${newBookingMinHoursAhead},
      updated_at = NOW()
    WHERE id = 1
  `;

  return NextResponse.json({ ok: true });
}
