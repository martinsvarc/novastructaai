"use client";

import { useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

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

interface Settings {
  system_prompt: string;
  opener: string;
  opener_speaks_first: boolean;
  transfer_enabled: boolean;
  closers: Closer[];
  telnyx_phone: string;
  ultravox_api_key: string;
  ultravox_agent_id: string;
  ultravox_voice_id: string;
  ghl_calendar_id: string;
  business_hours: Record<string, DayHours>;
  scenario_a_script: string;
  scenario_b_script: string;
  transfer_connecting_msg: string;
  transfer_retry_msg: string;
  scenario_a_opener: string;
  transfer_error_msg: string;
  inactivity_1_seconds: number;
  inactivity_1_message: string;
  inactivity_2_seconds: number;
  inactivity_2_message: string;
  vad_sensitivity: number;
  booking_intro_msg: string;
  booking_confirm_msg: string;
  booking_fail_msg: string;
  booking_min_hours_ahead: number;
}

interface GhlStatus {
  connected: boolean;
  locationId?: string;
}

function showToast(msg: string) {
  const t = document.getElementById("toast");
  const m = document.getElementById("toast-msg");
  if (t && m) {
    m.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2800);
  }
}

function Section({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: "8px" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "none",
          border: "none",
          borderBottom: "1px solid var(--border)",
          padding: "18px 0 14px",
          cursor: "pointer",
          color: "var(--text-primary)",
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div
            style={{
              fontFamily: "var(--serif)",
              fontSize: "1.1rem",
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              fontWeight: 300,
              marginTop: "4px",
            }}
          >
            {subtitle}
          </div>
        </div>
        <span
          style={{
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            transition: "transform 0.2s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
      </button>
      {open && <div style={{ paddingTop: "16px" }}>{children}</div>}
    </div>
  );
}

export function SettingsClient({
  initialSettings,
}: {
  initialSettings: Settings;
}) {
  const { t } = useI18n();
  const [transferEnabled, setTransferEnabled] = useState(
    initialSettings.transfer_enabled
  );
  const [closers, setClosers] = useState<Closer[]>(initialSettings.closers);
  const [opener, setOpener] = useState(initialSettings.opener);
  const [openerSpeaksFirst, setOpenerSpeaksFirst] = useState(
    initialSettings.opener_speaks_first
  );
  const [prompt, setPrompt] = useState(initialSettings.system_prompt);
  const [businessHours, setBusinessHours] = useState<Record<string, DayHours>>(
    initialSettings.business_hours
  );
  const [scenarioAScript, setScenarioAScript] = useState(
    initialSettings.scenario_a_script
  );
  const [scenarioBScript, setScenarioBScript] = useState(
    initialSettings.scenario_b_script
  );
  const [transferConnectingMsg, setTransferConnectingMsg] = useState(
    initialSettings.transfer_connecting_msg
  );
  const [transferRetryMsg, setTransferRetryMsg] = useState(
    initialSettings.transfer_retry_msg
  );
  const [scenarioAOpener, setScenarioAOpener] = useState(
    initialSettings.scenario_a_opener
  );
  const [transferErrorMsg, setTransferErrorMsg] = useState(
    initialSettings.transfer_error_msg
  );
  const [inactivity1Seconds, setInactivity1Seconds] = useState(initialSettings.inactivity_1_seconds);
  const [inactivity1Message, setInactivity1Message] = useState(initialSettings.inactivity_1_message);
  const [inactivity2Seconds, setInactivity2Seconds] = useState(initialSettings.inactivity_2_seconds);
  const [inactivity2Message, setInactivity2Message] = useState(initialSettings.inactivity_2_message);
  const [vadSensitivity, setVadSensitivity] = useState(initialSettings.vad_sensitivity);
  const [saving, setSaving] = useState(false);

  // Booking settings
  const [bookingIntroMsg, setBookingIntroMsg] = useState(initialSettings.booking_intro_msg);
  const [bookingConfirmMsg, setBookingConfirmMsg] = useState(initialSettings.booking_confirm_msg);
  const [bookingFailMsg, setBookingFailMsg] = useState(initialSettings.booking_fail_msg);
  const [bookingMinHoursAhead, setBookingMinHoursAhead] = useState(initialSettings.booking_min_hours_ahead);

  // Credentials
  const [telnyxPhone, setTelnyxPhone] = useState(
    initialSettings.telnyx_phone
  );
  const [ultravoxKey, setUltravoxKey] = useState(
    initialSettings.ultravox_api_key
  );
  const [ultravoxAgentId, setUltravoxAgentId] = useState(
    initialSettings.ultravox_agent_id
  );
  const [ultravoxVoiceId, setUltravoxVoiceId] = useState(
    initialSettings.ultravox_voice_id
  );
  const [ghlCalendarId, setGhlCalendarId] = useState(
    initialSettings.ghl_calendar_id
  );
  const [ghlStatus, setGhlStatus] = useState<GhlStatus>({ connected: false });
  const [ghlLoading, setGhlLoading] = useState(true);

  function addCloser() {
    setClosers([
      ...closers,
      { name: "", phone: "", priority: closers.length + 1 },
    ]);
  }

  function removeCloser(index: number) {
    const updated = closers
      .filter((_, i) => i !== index)
      .map((c, i) => ({ ...c, priority: i + 1 }));
    setClosers(updated);
  }

  function updateCloser(index: number, field: "name" | "phone", value: string) {
    const updated = [...closers];
    updated[index] = { ...updated[index], [field]: value };
    setClosers(updated);
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  const saveSettings = useCallback(async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        system_prompt: prompt,
        opener,
        opener_speaks_first: openerSpeaksFirst,
        transfer_enabled: transferEnabled,
        closers,
        business_hours: businessHours,
        scenario_a_script: scenarioAScript,
        scenario_b_script: scenarioBScript,
        transfer_connecting_msg: transferConnectingMsg,
        transfer_retry_msg: transferRetryMsg,
        scenario_a_opener: scenarioAOpener,
        transfer_error_msg: transferErrorMsg,
        inactivity_1_seconds: inactivity1Seconds,
        inactivity_1_message: inactivity1Message,
        inactivity_2_seconds: inactivity2Seconds,
        inactivity_2_message: inactivity2Message,
        vad_sensitivity: vadSensitivity,
        telnyx_phone: telnyxPhone,
        ultravox_agent_id: ultravoxAgentId,
        ultravox_voice_id: ultravoxVoiceId,
        ghl_calendar_id: ghlCalendarId,
        booking_intro_msg: bookingIntroMsg,
        booking_confirm_msg: bookingConfirmMsg,
        booking_fail_msg: bookingFailMsg,
        booking_min_hours_ahead: bookingMinHoursAhead,
      };

      if (!ultravoxKey.startsWith("****")) body.ultravox_api_key = ultravoxKey;

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to save");
      showToast(t.savedLive);
    } catch {
      showToast(t.errorSaving);
    } finally {
      setSaving(false);
    }
  }, [
    prompt, opener, openerSpeaksFirst, transferEnabled, closers, businessHours,
    scenarioAScript, scenarioBScript, transferConnectingMsg, transferRetryMsg,
    scenarioAOpener, transferErrorMsg, inactivity1Seconds, inactivity1Message,
    inactivity2Seconds, inactivity2Message, vadSensitivity, telnyxPhone, ultravoxAgentId,
    ultravoxVoiceId, ghlCalendarId, ultravoxKey, bookingIntroMsg, bookingConfirmMsg,
    bookingFailMsg, bookingMinHoursAhead,
  ]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSettings();
    }, 1000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [saveSettings]);

  // Check GHL connection status on mount and after OAuth redirect
  useEffect(() => {
    fetch("/api/crm/status")
      .then((res) => res.json())
      .then((data) => setGhlStatus(data))
      .catch(() => {})
      .finally(() => setGhlLoading(false));
  }, []);

  const autoSaveLabel = (
    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
      {saving ? t.saving : t.autoSaves}
    </span>
  );

  const fieldDesc = {
    fontSize: "0.78rem" as const,
    color: "var(--text-secondary)",
    fontWeight: 300 as const,
    marginBottom: "12px",
    lineHeight: 1.6,
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-tag">{t.configuration}</div>
        <h2>{t.settingsTitle}</h2>
        <p>
          {t.settingsDesc}{" "}
          {saving && (
            <span style={{ color: "var(--whiskey)" }}>{t.saving}</span>
          )}
        </p>
      </div>

      {/* ─────────────── SECTION 1: AI SCRIPT & VOICE ─────────────── */}
      <Section
        title={t.aiScripts}
        subtitle={t.aiScriptsDesc}
        defaultOpen={true}
      >
        {/* Opener */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.opener}</div>
          </div>
          <p style={{ ...fieldDesc, marginBottom: "16px" }}>{t.openerDesc}</p>
          <input
            type="text"
            className="cred-input"
            value={opener}
            onChange={(e) => setOpener(e.target.value)}
            placeholder="Hi, thanks for calling Nova Structa. Who am I speaking with?"
            style={{ width: "100%", fontSize: "0.95rem" }}
          />
          <div className="toggle-row" style={{ marginTop: "20px" }}>
            <div className="toggle-label">
              <strong>{t.aiSpeaksFirst}</strong>
              <span>{t.aiSpeaksFirstDesc}</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={openerSpeaksFirst}
                onChange={(e) => setOpenerSpeaksFirst(e.target.checked)}
              />
              <span className="toggle-track"></span>
            </label>
          </div>
        </div>

        {/* Main Script */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.mainScript}</div>
          </div>
          <p style={{ ...fieldDesc, marginBottom: "16px" }}>{t.mainScriptDesc}</p>
          <textarea
            className="prompt-textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="textarea-footer">
            <span className="char-count">
              {prompt.length.toLocaleString()} {t.characters}
            </span>
            {autoSaveLabel}
          </div>
        </div>

        {/* Business Hours */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.businessHours}</div>
            <span
              style={{
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                fontWeight: 400,
                letterSpacing: "0.04em",
              }}
            >
              {t.easternTime}
            </span>
          </div>
          <p style={{ ...fieldDesc, marginBottom: "20px" }}>{t.businessHoursDesc}</p>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              "monday",
              "tuesday",
              "wednesday",
              "thursday",
              "friday",
              "saturday",
              "sunday",
            ].map((day) => {
              const d = businessHours[day] || {
                enabled: false,
                open: "09:00",
                close: "18:00",
              };
              const dayKey = day.slice(0, 3) as "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
              const shortDay = t[dayKey];
              return (
                <div
                  key={day}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    opacity: d.enabled ? 1 : 0.35,
                    transition: "opacity 0.15s",
                  }}
                >
                  <label
                    className="toggle-switch"
                    style={{ transform: "scale(0.7)", flexShrink: 0 }}
                  >
                    <input
                      type="checkbox"
                      checked={d.enabled}
                      onChange={(e) =>
                        setBusinessHours({
                          ...businessHours,
                          [day]: { ...d, enabled: e.target.checked },
                        })
                      }
                    />
                    <span className="toggle-track"></span>
                  </label>
                  <span
                    style={{
                      width: "36px",
                      fontSize: "0.78rem",
                      fontWeight: 500,
                      flexShrink: 0,
                    }}
                  >
                    {shortDay}
                  </span>
                  <input
                    type="time"
                    value={d.open}
                    disabled={!d.enabled}
                    onChange={(e) =>
                      setBusinessHours({
                        ...businessHours,
                        [day]: { ...d, open: e.target.value },
                      })
                    }
                    className="cred-input"
                    style={{
                      width: "110px",
                      padding: "5px 8px",
                      fontSize: "0.78rem",
                      colorScheme: "dark",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    –
                  </span>
                  <input
                    type="time"
                    value={d.close}
                    disabled={!d.enabled}
                    onChange={(e) =>
                      setBusinessHours({
                        ...businessHours,
                        [day]: { ...d, close: e.target.value },
                      })
                    }
                    className="cred-input"
                    style={{
                      width: "110px",
                      padding: "5px 8px",
                      fontSize: "0.78rem",
                      colorScheme: "dark",
                      flexShrink: 0,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Silence Detection */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.silenceDetection}</div>
          </div>
          <p style={{ ...fieldDesc, marginBottom: "20px" }}>{t.silenceDetectionDesc}</p>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 500 }}>{t.firstCheckIn}</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>—</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{t.after}</span>
                <input
                  type="number"
                  value={inactivity1Seconds}
                  onChange={(e) => setInactivity1Seconds(Number(e.target.value))}
                  min={3}
                  max={30}
                  className="cred-input"
                  style={{ width: "60px", padding: "4px 8px", fontSize: "0.78rem", textAlign: "center" }}
                />
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{t.secondsOfSilence}</span>
              </div>
              <input
                type="text"
                className="cred-input"
                value={inactivity1Message}
                onChange={(e) => setInactivity1Message(e.target.value)}
                style={{ width: "100%", fontSize: "0.85rem" }}
              />
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 500 }}>{t.finalWarning}</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>—</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{t.after}</span>
                <input
                  type="number"
                  value={inactivity2Seconds}
                  onChange={(e) => setInactivity2Seconds(Number(e.target.value))}
                  min={3}
                  max={30}
                  className="cred-input"
                  style={{ width: "60px", padding: "4px 8px", fontSize: "0.78rem", textAlign: "center" }}
                />
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{t.moreSeconds}</span>
              </div>
              <input
                type="text"
                className="cred-input"
                value={inactivity2Message}
                onChange={(e) => setInactivity2Message(e.target.value)}
                style={{ width: "100%", fontSize: "0.85rem" }}
              />
              <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                {t.hangUpAfterThis}
              </span>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div>
                  <span style={{ fontSize: "0.78rem", fontWeight: 500 }}>{t.noiseSensitivity}</span>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginLeft: "8px" }}>
                    {vadSensitivity.toFixed(2)}
                  </span>
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "flex", gap: "12px" }}>
                  <span>{t.moreNoise}</span>
                  <span>{t.lessNoise}</span>
                </div>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.5"
                step="0.05"
                value={vadSensitivity}
                onChange={(e) => setVadSensitivity(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--whiskey)" }}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ─────────────── SECTION 2: LIVE TRANSFER ─────────────── */}
      <Section
        title={t.liveTransfer}
        subtitle={t.liveTransferDesc}
        defaultOpen={false}
      >
        {/* Closer Numbers */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.closerNumbers}</div>
          </div>
          <p style={{ ...fieldDesc, marginBottom: "20px" }}>{t.closerNumbersDesc}</p>

          <div className="closer-list">
            {closers.map((c, i) => (
              <div key={i} className="closer-item">
                <span className="closer-priority">#{i + 1}</span>
                <input
                  type="text"
                  value={c.name}
                  placeholder="Name"
                  onChange={(e) => updateCloser(i, "name", e.target.value)}
                />
                <input
                  type="text"
                  value={c.phone}
                  placeholder="Phone number"
                  onChange={(e) => updateCloser(i, "phone", e.target.value)}
                />
                <button
                  className="btn btn-danger"
                  onClick={() => removeCloser(i)}
                >
                  {t.remove}
                </button>
              </div>
            ))}
          </div>

          <div className="add-row">
            <button className="btn btn-ghost" onClick={addCloser}>
              {t.addCloser}
            </button>
          </div>
        </div>

        {/* Scenario A Script */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.scenarioATitle}</div>
          </div>
          <p style={{ ...fieldDesc, marginBottom: "16px" }}>{t.scenarioADesc}</p>
          <textarea
            className="prompt-textarea"
            value={scenarioAScript}
            onChange={(e) => setScenarioAScript(e.target.value)}
            style={{ minHeight: "120px" }}
          />
          <div className="textarea-footer">
            <span className="char-count">
              {scenarioAScript.length.toLocaleString()} {t.characters}
            </span>
            {autoSaveLabel}
          </div>
        </div>

        {/* Transfer Phrases */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.connectingMsg}</div>
          </div>
          <p style={fieldDesc}>{t.connectingMsgDesc}</p>
          <input
            type="text"
            className="cred-input"
            value={transferConnectingMsg}
            onChange={(e) => setTransferConnectingMsg(e.target.value)}
            style={{ width: "100%", fontSize: "0.9rem" }}
          />
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.retryMsg}</div>
          </div>
          <p style={fieldDesc}>{t.retryMsgDesc}</p>
          <input
            type="text"
            className="cred-input"
            value={transferRetryMsg}
            onChange={(e) => setTransferRetryMsg(e.target.value)}
            style={{ width: "100%", fontSize: "0.9rem" }}
          />
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.scenarioAOpener}</div>
          </div>
          <p style={fieldDesc}>{t.scenarioAOpenerDesc}</p>
          <input
            type="text"
            className="cred-input"
            value={scenarioAOpener}
            onChange={(e) => setScenarioAOpener(e.target.value)}
            style={{ width: "100%", fontSize: "0.9rem" }}
          />
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.errorFallback}</div>
          </div>
          <p style={fieldDesc}>{t.errorFallbackDesc}</p>
          <input
            type="text"
            className="cred-input"
            value={transferErrorMsg}
            onChange={(e) => setTransferErrorMsg(e.target.value)}
            style={{ width: "100%", fontSize: "0.9rem" }}
          />
        </div>
      </Section>

      {/* ─────────────── SECTION 3: APPOINTMENT BOOKING ─────────────── */}
      <Section
        title={t.appointmentBooking}
        subtitle={t.appointmentBookingDesc}
        defaultOpen={false}
      >
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.bookingIntroMsg}</div>
          </div>
          <p style={fieldDesc}>{t.bookingIntroMsgDesc}</p>
          <input
            type="text"
            className="cred-input"
            value={bookingIntroMsg}
            onChange={(e) => setBookingIntroMsg(e.target.value)}
            style={{ width: "100%", fontSize: "0.9rem" }}
          />
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.bookingConfirmMsg}</div>
          </div>
          <p style={fieldDesc}>{t.bookingConfirmMsgDesc}</p>
          <input
            type="text"
            className="cred-input"
            value={bookingConfirmMsg}
            onChange={(e) => setBookingConfirmMsg(e.target.value)}
            style={{ width: "100%", fontSize: "0.9rem" }}
          />
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.bookingFailMsg}</div>
          </div>
          <p style={fieldDesc}>{t.bookingFailMsgDesc}</p>
          <input
            type="text"
            className="cred-input"
            value={bookingFailMsg}
            onChange={(e) => setBookingFailMsg(e.target.value)}
            style={{ width: "100%", fontSize: "0.9rem" }}
          />
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.bookingMinHoursAhead}</div>
          </div>
          <p style={fieldDesc}>{t.bookingMinHoursAheadDesc}</p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="number"
              className="cred-input"
              value={bookingMinHoursAhead}
              onChange={(e) => setBookingMinHoursAhead(Number(e.target.value))}
              min={0}
              max={48}
              style={{ width: "80px", padding: "6px 10px", fontSize: "0.9rem", textAlign: "center" }}
            />
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>hours from now</span>
          </div>
        </div>
      </Section>

      {/* ─────────────── SECTION 4: AFTER HOURS ─────────────── */}
      <Section
        title={t.afterHoursSection}
        subtitle={t.afterHoursSectionDesc}
        defaultOpen={false}
      >
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t.scenarioBTitle}</div>
          </div>
          <p style={{ ...fieldDesc, marginBottom: "16px" }}>{t.scenarioBDesc}</p>
          <textarea
            className="prompt-textarea"
            value={scenarioBScript}
            onChange={(e) => setScenarioBScript(e.target.value)}
            style={{ minHeight: "120px" }}
          />
          <div className="textarea-footer">
            <span className="char-count">
              {scenarioBScript.length.toLocaleString()} {t.characters}
            </span>
            {autoSaveLabel}
          </div>
        </div>
      </Section>

      {/* ─────────────── SECTION 5: INTEGRATIONS ─────────────── */}
      <Section
        title={t.integrations}
        subtitle={t.integrationsDesc}
        defaultOpen={false}
      >
        <div className="card">
          <div className="card-header">
            <div className="card-title">Ultravox</div>
          </div>
          <div className="cred-grid">
            <div className="cred-field">
              <label>API Key</label>
              <input
                className="cred-input"
                type="text"
                value={ultravoxKey}
                onChange={(e) => setUltravoxKey(e.target.value)}
                onFocus={(e) => {
                  if (e.target.value.startsWith("****")) e.target.value = "";
                  setUltravoxKey("");
                }}
                placeholder="API key"
              />
            </div>
            <div className="cred-field">
              <label>Agent ID</label>
              <input
                className="cred-input"
                type="text"
                value={ultravoxAgentId}
                onChange={(e) => setUltravoxAgentId(e.target.value)}
                placeholder="Agent ID"
              />
            </div>
            <div className="cred-field">
              <label>Voice ID</label>
              <input
                className="cred-input"
                type="text"
                value={ultravoxVoiceId}
                onChange={(e) => setUltravoxVoiceId(e.target.value)}
                placeholder="Voice ID"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">GoHighLevel</div>
          </div>
          {ghlLoading ? (
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", padding: "12px 0" }}>
              Checking connection...
            </div>
          ) : ghlStatus.connected ? (
            <div>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 16px",
                background: "rgba(111, 192, 138, 0.08)",
                border: "1px solid rgba(111, 192, 138, 0.25)",
                borderRadius: 8,
                marginBottom: 12,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6FC08A", flexShrink: 0 }} />
                <span style={{ fontSize: "0.82rem", color: "#6FC08A", fontWeight: 500 }}>Connected</span>
                {ghlStatus.locationId && (
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                    Location: {ghlStatus.locationId.slice(0, 8)}...
                  </span>
                )}
              </div>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  if (!confirm("Disconnect GoHighLevel? Appointment booking will stop working.")) return;
                  await fetch("/api/crm/status", { method: "DELETE" });
                  setGhlStatus({ connected: false });
                  showToast("GoHighLevel disconnected");
                }}
                style={{ fontSize: "0.78rem" }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div>
              <p style={{
                fontSize: "0.78rem",
                color: "var(--text-secondary)",
                fontWeight: 300,
                marginBottom: 16,
                lineHeight: 1.6,
              }}>
                Connect your GoHighLevel account to enable appointment booking directly from AI calls.
              </p>
              <button
                onClick={() => { window.location.href = "/api/crm/authorize"; }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#f3880e",
                  color: "#fff",
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  fontFamily: "var(--sans)",
                }}
              >
                Connect GoHighLevel
              </button>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
