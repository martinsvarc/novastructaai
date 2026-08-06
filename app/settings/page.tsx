"use client";

import { useEffect, useState } from "react";
import { SettingsClient } from "./settings-client";

function maskCred(val: string): string {
  if (!val || val.length < 4) return val ? "****" : "";
  return "****" + val.slice(-4);
}

const DEFAULTS = {
  system_prompt: "",
  opener: "hey there",
  opener_speaks_first: true,
  transfer_enabled: true,
  closers: [] as { name: string; phone: string; priority: number }[],
  telnyx_phone: "",
  ultravox_api_key: "",
  ultravox_agent_id: "",
  ultravox_voice_id: "",
  ghl_calendar_id: "",
  scenario_a_script: "",
  scenario_b_script: "",
  transfer_connecting_msg: "Connecting you now.",
  transfer_retry_msg: "Let me try another consultant for you.",
  scenario_a_opener: "Hey, sorry about that wait.",
  transfer_error_msg: "Our consultant is unavailable right now. We will have someone call you back shortly.",
  inactivity_1_seconds: 8,
  inactivity_1_message: "Hey, are you still there?",
  inactivity_2_seconds: 10,
  inactivity_2_message: "I'm having a little trouble hearing you... are you there?",
  vad_sensitivity: 0.15,
  business_hours: {
    monday: { enabled: true, open: "09:00", close: "18:00" },
    tuesday: { enabled: true, open: "09:00", close: "18:00" },
    wednesday: { enabled: true, open: "09:00", close: "18:00" },
    thursday: { enabled: true, open: "09:00", close: "18:00" },
    friday: { enabled: true, open: "09:00", close: "18:00" },
    saturday: { enabled: true, open: "09:00", close: "14:00" },
    sunday: { enabled: false, open: "", close: "" },
  },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<typeof DEFAULTS | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((data) => {
        setSettings({
          system_prompt: data.system_prompt || "",
          opener: data.opener || "hey there",
          opener_speaks_first: data.opener_speaks_first !== false,
          transfer_enabled: !!data.transfer_enabled,
          closers: data.closers || [],
          telnyx_phone: data.telnyx_phone || "",
          ultravox_api_key: data.ultravox_api_key || "",
          ultravox_agent_id: data.ultravox_agent_id || "",
          ultravox_voice_id: data.ultravox_voice_id || "",
          ghl_calendar_id: data.ghl_calendar_id || "",
          scenario_a_script: data.scenario_a_script || "",
          scenario_b_script: data.scenario_b_script || "",
          transfer_connecting_msg: data.transfer_connecting_msg || DEFAULTS.transfer_connecting_msg,
          transfer_retry_msg: data.transfer_retry_msg || DEFAULTS.transfer_retry_msg,
          scenario_a_opener: data.scenario_a_opener || DEFAULTS.scenario_a_opener,
          transfer_error_msg: data.transfer_error_msg || DEFAULTS.transfer_error_msg,
          inactivity_1_seconds: data.inactivity_1_seconds ?? 8,
          inactivity_1_message: data.inactivity_1_message || DEFAULTS.inactivity_1_message,
          inactivity_2_seconds: data.inactivity_2_seconds ?? 10,
          inactivity_2_message: data.inactivity_2_message || DEFAULTS.inactivity_2_message,
          vad_sensitivity: data.vad_sensitivity ?? 0.15,
          business_hours: data.business_hours || DEFAULTS.business_hours,
        });
      })
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div>
        <div className="page-header">
          <div className="page-tag">Configuration</div>
          <h2>Settings</h2>
          <p>Could not load settings. Please refresh the page.</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div>
        <div className="page-header">
          <div className="page-tag">Configuration</div>
          <h2>Settings</h2>
          <p>Loading...</p>
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="card"
            style={{ height: "120px", opacity: 0.4 }}
          >
            <div
              style={{
                height: "14px",
                width: "30%",
                background: "var(--border)",
                borderRadius: "4px",
                marginBottom: "16px",
              }}
            />
            <div
              style={{
                height: "10px",
                width: "60%",
                background: "var(--border)",
                borderRadius: "4px",
                opacity: 0.5,
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  return <SettingsClient initialSettings={settings} />;
}
