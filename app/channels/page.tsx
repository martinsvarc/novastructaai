"use client";

import { useState, useEffect, useCallback } from "react";

interface Channel {
  id: number;
  name: string;
  phone: string;
  color: string;
  total_calls: number;
  transferred: number;
  callbacks: number;
  booked: number;
  after_hours: number;
  disqualified: number;
  dropped: number;
  connected_pct: number;
}

const CHANNEL_COLORS = [
  "#4A90D9",
  "#EA4335",
  "#60A5FA",
  "#F59E0B",
  "#6FC08A",
  "#9B7DD4",
  "#E07555",
  "#4ECDC4",
];

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
      }
    } catch (e) {
      console.error("Failed to fetch channels:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const addChannel = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    setSaving(true);
    try {
      const color = CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length];
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim(), color }),
      });
      if (res.ok) {
        setNewName("");
        setNewPhone("");
        setShowAdd(false);
        fetchChannels();
      }
    } catch (e) {
      console.error("Failed to add channel:", e);
    } finally {
      setSaving(false);
    }
  };

  const removeChannel = async (id: number) => {
    try {
      await fetch("/api/channels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      fetchChannels();
    } catch (e) {
      console.error("Failed to remove channel:", e);
    }
  };

  const totals = channels.reduce(
    (acc, ch) => ({
      calls: acc.calls + ch.total_calls,
      transferred: acc.transferred + ch.transferred,
      callbacks: acc.callbacks + ch.callbacks,
    }),
    { calls: 0, transferred: 0, callbacks: 0 }
  );

  const maxCalls = Math.max(...channels.map((c) => c.total_calls), 1);

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-tag">Channel Tracking</div>
        <h2 className="page-title">Performance by Source</h2>
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-tag">Channel Tracking</div>
      <h2 className="page-title">Performance by Source</h2>

      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <div className="stat-number">{totals.calls}</div>
          <div className="stat-label">Total Calls · 30 Days</div>
        </div>
        <div className="stat-item">
          <div className="stat-number" style={{ color: "var(--whiskey)" }}>
            {totals.transferred}
          </div>
          <div className="stat-label">Transferred</div>
        </div>
        <div className="stat-item">
          <div className="stat-number" style={{ color: "var(--green, #4caf76)" }}>
            {totals.callbacks}
          </div>
          <div className="stat-label">Callbacks</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">{channels.length}</div>
          <div className="stat-label">Active Channels</div>
        </div>
      </div>

      {/* Channel table */}
      <div className="channels-card">
        <div className="channels-header">
          <div>Channel</div>
          <div>Number</div>
          <div>Calls</div>
          <div>Transferred</div>
          <div>Callbacks</div>
          <div>Connected %</div>
          <div></div>
        </div>

        {channels.map((ch) => (
          <div key={ch.id} className="channels-row">
            <div className="channel-name-cell">
              <div
                className="channel-dot"
                style={{ background: ch.color }}
              />
              {ch.name}
            </div>
            <div className="channel-phone">{formatPhone(ch.phone)}</div>
            <div className="channel-cell">{ch.total_calls}</div>
            <div className="channel-cell" style={{ color: "var(--green, #4caf76)", fontWeight: 500 }}>
              {ch.transferred}
            </div>
            <div className="channel-cell" style={{ color: "var(--text-secondary)" }}>
              {ch.callbacks}
            </div>
            <div className="channel-cell">
              <div className="conv-bar">
                <span
                  style={{
                    color: ch.connected_pct >= 50 ? "var(--green, #4caf76)" : "var(--text-primary)",
                    fontWeight: ch.connected_pct >= 50 ? 600 : 400,
                  }}
                >
                  {ch.connected_pct}%
                </span>
                <div className="conv-track">
                  <div
                    className="conv-fill"
                    style={{
                      width: `${ch.connected_pct}%`,
                      background: ch.connected_pct >= 50 ? "var(--green, #4caf76)" : "var(--whiskey)",
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="channel-cell">
              <button
                onClick={() => removeChannel(ch.id)}
                className="channel-remove"
                title="Remove channel"
              >
                ×
              </button>
            </div>
          </div>
        ))}

        {/* Add channel row */}
        {showAdd ? (
          <div className="channels-row channels-add-row">
            <div className="channel-name-cell">
              <div
                className="channel-dot"
                style={{ background: CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length] }}
              />
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Channel name"
                className="channel-input"
                autoFocus
              />
            </div>
            <div>
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+1234567890"
                className="channel-input"
                onKeyDown={(e) => e.key === "Enter" && addChannel()}
              />
            </div>
            <div className="channel-cell" style={{ gridColumn: "span 4", display: "flex", gap: "8px" }}>
              <button onClick={addChannel} className="channel-save-btn" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => {
                  setShowAdd(false);
                  setNewName("");
                  setNewPhone("");
                }}
                className="channel-cancel-btn"
              >
                Cancel
              </button>
            </div>
            <div />
          </div>
        ) : (
          <div
            className="channels-row channels-add-trigger"
            onClick={() => setShowAdd(true)}
          >
            <div className="channel-name-cell" style={{ color: "var(--text-muted)", cursor: "pointer" }}>
              <div
                className="channel-dot"
                style={{ background: "var(--ash)", border: "1px dashed var(--text-muted)" }}
              />
              + Add channel
            </div>
          </div>
        )}
      </div>

      {/* Bar chart */}
      {channels.length > 0 && (
        <div className="channels-chart">
          <div className="chart-label">Calls by Channel · 30 Days</div>
          <div className="chart-bars">
            {channels.map((ch) => {
              const height = Math.max((ch.total_calls / maxCalls) * 120, 4);
              const transferredH = ch.total_calls > 0
                ? (ch.transferred / ch.total_calls) * height
                : 0;
              const otherH = height - transferredH;
              return (
                <div key={ch.id} className="chart-bar-group">
                  <div className="chart-bar-value">{ch.total_calls}</div>
                  <div className="chart-bar-stack">
                    {otherH > 0 && (
                      <div
                        className="chart-bar-segment"
                        style={{ height: `${otherH}px`, background: ch.color, opacity: 0.35 }}
                      />
                    )}
                    {transferredH > 0 && (
                      <div
                        className="chart-bar-segment"
                        style={{ height: `${transferredH}px`, background: ch.color }}
                      />
                    )}
                  </div>
                  <div className="chart-bar-label">{ch.name}</div>
                </div>
              );
            })}
          </div>
          <div className="chart-legend">
            <div className="legend-item">
              <div className="legend-dot" style={{ background: "var(--whiskey)" }} />
              Transferred
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: "var(--whiskey)", opacity: 0.35 }} />
              Other calls
            </div>
          </div>
        </div>
      )}

      {/* Insight */}
      {channels.length > 1 && (() => {
        const best = [...channels].sort((a, b) => b.connected_pct - a.connected_pct)[0];
        if (!best || best.total_calls === 0) return null;
        return (
          <div className="channels-insight">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6FC08A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>
              <strong style={{ color: best.color, fontWeight: 500 }}>{best.name}</strong>{" "}
              connects at {best.connected_pct}% — highest quality channel.
            </span>
          </div>
        );
      })()}
    </div>
  );
}
