"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

interface Channel {
  id: number;
  name: string;
  phone: string;
  color: string;
  system_prompt: string;
  opener: string;
  opener_speaks_first: boolean;
  scenario_a_script: string;
  scenario_b_script: string;
  close_mode: string;
  ghl_calendar_id: string;
}

interface GhlCalendar {
  id: string;
  name: string;
}

function formatPhone(phone: string | undefined | null) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
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

export default function ChannelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [channel, setChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);

  // Toggle: use default or custom script
  const [useCustom, setUseCustom] = useState(false);

  // Editable fields
  const [name, setName] = useState("");
  const [opener, setOpener] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [scenarioA, setScenarioA] = useState("");
  const [scenarioB, setScenarioB] = useState("");
  const [closeMode, setCloseMode] = useState("transfer");
  const [ghlCalendarId, setGhlCalendarId] = useState("");
  const [ghlCalendars, setGhlCalendars] = useState<GhlCalendar[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    fetch("/api/channels")
      .then((res) => res.json())
      .then((channels: Channel[]) => {
        const ch = channels.find((c: Channel) => c.id === Number(id));
        if (ch) {
          setChannel(ch);
          setName(ch.name || "");
          setOpener(ch.opener || "");
          setSystemPrompt(ch.system_prompt || "");
          setScenarioA(ch.scenario_a_script || "");
          setScenarioB(ch.scenario_b_script || "");
          setCloseMode(ch.close_mode || "transfer");
          setGhlCalendarId(ch.ghl_calendar_id || "");
          // If any script field has content, it's custom
          setUseCustom(!!(ch.system_prompt || ch.opener || ch.scenario_a_script || ch.scenario_b_script));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Fetch GHL calendars
    setLoadingCalendars(true);
    fetch("/api/crm/calendars")
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setGhlCalendars(data); })
      .catch(() => {})
      .finally(() => setLoadingCalendars(false));
  }, [id]);

  const saveChanges = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Number(id),
          name,
          opener: useCustom ? opener : "",
          system_prompt: useCustom ? systemPrompt : "",
          scenario_a_script: useCustom ? scenarioA : "",
          scenario_b_script: useCustom ? scenarioB : "",
          close_mode: closeMode,
          ghl_calendar_id: ghlCalendarId,
        }),
      });
      if (res.ok) showToast("Saved — live on next call");
    } catch {
      showToast("Error saving");
    } finally {
      setSaving(false);
    }
  }, [id, name, opener, systemPrompt, scenarioA, scenarioB, useCustom, closeMode, ghlCalendarId]);

  // Auto-save on changes (1s debounce)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveChanges(), 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [saveChanges]);

  if (loading) {
    return (
      <div className="skeleton-fade-in">
        <div className="page-header">
          <div className="page-tag">Channel</div>
          <div className="skeleton" style={{ width: 160, height: 24, marginTop: 6 }} />
        </div>
        <div className="skeleton-card">
          <div className="skeleton" style={{ width: 100, height: 14, marginBottom: 16 }} />
          <div className="skeleton" style={{ width: "60%", height: 14, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: "40%", height: 14 }} />
        </div>
        <div className="skeleton-card" style={{ opacity: 0.7 }}>
          <div className="skeleton" style={{ width: 110, height: 14, marginBottom: 16 }} />
          <div className="skeleton" style={{ width: "100%", height: 100, borderRadius: 8 }} />
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div>
        <div className="page-header">
          <div className="page-tag">Channel</div>
          <h2>Not found</h2>
          <p><button onClick={() => router.push("/channels")} className="btn btn-ghost" style={{ marginTop: 12 }}>Back to Channels</button></p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <button
          onClick={() => router.push("/channels")}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "0.82rem",
            padding: 0,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--sans)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Channels
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: channel.color, flexShrink: 0 }} />
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                background: "none",
                border: "none",
                fontFamily: "var(--serif)",
                fontSize: "1.8rem",
                fontWeight: 500,
                color: "var(--text-primary)",
                outline: "none",
                width: "100%",
                padding: 0,
              }}
              placeholder="Channel name"
            />
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 2 }}>
              {formatPhone(channel.phone)}
              {saving && <span style={{ color: "var(--whiskey)", marginLeft: 12 }}>Saving...</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Script mode toggle */}
      <div className="card">
        <div className="toggle-row">
          <div className="toggle-label">
            <strong>Custom Script</strong>
            <span>{useCustom ? "This channel uses its own script" : "Using the default script from Settings"}</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={useCustom}
              onChange={(e) => setUseCustom(e.target.checked)}
            />
            <span className="toggle-track"></span>
          </label>
        </div>
      </div>

      {/* Script fields — only shown when custom is on */}
      {useCustom ? (
        <>
          {/* Opener */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Opener</div>
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 300, marginBottom: 12, lineHeight: 1.6 }}>
              The first thing the AI says when it picks up a call on this number.
            </p>
            <input
              type="text"
              className="cred-input"
              value={opener}
              onChange={(e) => setOpener(e.target.value)}
              placeholder="Hi, thanks for calling..."
              style={{ width: "100%", fontSize: "0.95rem" }}
            />
          </div>

          {/* Main Script */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Main Script</div>
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 300, marginBottom: 12, lineHeight: 1.6 }}>
              The core instructions the AI follows on every call to this number.
            </p>
            <textarea
              className="prompt-textarea"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Custom system prompt for this channel..."
            />
            <div className="textarea-footer">
              <span className="char-count">{systemPrompt.length.toLocaleString()} characters</span>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                {saving ? "Saving..." : "Auto-saves"}
              </span>
            </div>
          </div>

          {/* Scenario A */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Scenario A — Advisors Busy</div>
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 300, marginBottom: 12, lineHeight: 1.6 }}>
              What the AI says when all advisors are busy during business hours.
            </p>
            <textarea
              className="prompt-textarea"
              value={scenarioA}
              onChange={(e) => setScenarioA(e.target.value)}
              placeholder="Custom Scenario A script..."
              style={{ minHeight: 120 }}
            />
            <div className="textarea-footer">
              <span className="char-count">{scenarioA.length.toLocaleString()} characters</span>
            </div>
          </div>

          {/* Scenario B */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Scenario B — After Hours</div>
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 300, marginBottom: 12, lineHeight: 1.6 }}>
              What the AI says when a qualified lead calls outside business hours.
            </p>
            <textarea
              className="prompt-textarea"
              value={scenarioB}
              onChange={(e) => setScenarioB(e.target.value)}
              placeholder="Custom Scenario B script..."
              style={{ minHeight: 120 }}
            />
            <div className="textarea-footer">
              <span className="char-count">{scenarioB.length.toLocaleString()} characters</span>
            </div>
          </div>
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: "1rem", fontWeight: 400, lineHeight: 1.5 }}>
            This channel uses the default script from Settings.
          </p>
          <p style={{ fontSize: "0.78rem", marginTop: 8, fontWeight: 300 }}>
            Toggle &ldquo;Custom Script&rdquo; to write a unique script for this number.
          </p>
        </div>
      )}
    </div>
  );
}
