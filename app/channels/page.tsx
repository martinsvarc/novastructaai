"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

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
  system_prompt: string;
}

interface TelnyxNumber {
  phone_number: string;
  monthly_cost: string;
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

function formatPhone(phone: string | undefined | null) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export default function ChannelsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Number flow
  const [showSearch, setShowSearch] = useState(false);
  const [areaCode, setAreaCode] = useState("");
  const [searchResults, setSearchResults] = useState<TelnyxNumber[]>([]);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState(false);
  const [confirmNumber, setConfirmNumber] = useState<TelnyxNumber | null>(null);
  const [searchError, setSearchError] = useState("");
  const [buyError, setBuyError] = useState("");

  // Remove flow
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      if (res.ok) setChannels(await res.json());
    } catch (e) {
      console.error("Failed to fetch channels:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  const searchNumbers = async () => {
    if (areaCode.length !== 3) return;
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    setConfirmNumber(null);
    setBuyError("");
    try {
      const res = await fetch(`/api/telnyx/numbers/search?areaCode=${areaCode}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
        if (!data.length) setSearchError("No numbers found for that area code.");
      } else {
        setSearchError("Search failed. Try a different area code.");
      }
    } catch {
      setSearchError("Search failed. Check your connection.");
    } finally {
      setSearching(false);
    }
  };

  const buyNumber = async () => {
    if (!confirmNumber) return;
    setBuying(true);
    setBuyError("");
    try {
      const res = await fetch("/api/telnyx/numbers/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: confirmNumber.phone_number }),
      });
      if (res.ok) {
        resetSearch();
        fetchChannels();
      } else {
        const err = await res.json().catch(() => ({}));
        setBuyError(err.error || "Purchase failed. Please try again.");
        setConfirmNumber(null);
      }
    } catch {
      setBuyError("Purchase failed. Check your connection.");
      setConfirmNumber(null);
    } finally {
      setBuying(false);
    }
  };

  const resetSearch = () => {
    setShowSearch(false);
    setAreaCode("");
    setSearchResults([]);
    setSearching(false);
    setBuying(false);
    setConfirmNumber(null);
    setSearchError("");
    setBuyError("");
  };

  const removeChannel = async (id: number) => {
    setRemoving(true);
    try {
      await fetch(`/api/telnyx/numbers/${id}`, { method: "DELETE" });
      setConfirmRemoveId(null);
      fetchChannels();
    } catch (e) {
      console.error("Failed to remove channel:", e);
    } finally {
      setRemoving(false);
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
      <div>
        <div className="page-header">
          <div className="page-tag">Number Management</div>
          <h2>Channels</h2>
        </div>
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-tag">Number Management</div>
        <h2>Channels</h2>
      </div>

      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <div className="stat-value">{totals.calls}</div>
          <div className="stat-label">Total Calls · 30 Days</div>
        </div>
        <div className="stat-item">
          <div className="stat-value" style={{ color: "var(--whiskey)" }}>{totals.transferred}</div>
          <div className="stat-label">Transferred</div>
        </div>
        <div className="stat-item">
          <div className="stat-value" style={{ color: "#4caf76" }}>{totals.callbacks}</div>
          <div className="stat-label">Callbacks</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{channels.length}</div>
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
          <div>Connected %</div>
          <div></div>
          <div></div>
        </div>

        {channels.map((ch) => (
          <div key={ch.id} className="channels-row">
            <div className="channel-name-cell">
              <div className="channel-dot" style={{ background: ch.color }} />
              <span>{ch.name}</span>
              {ch.system_prompt && (
                <span style={{ fontSize: "0.65rem", color: "var(--whiskey)", marginLeft: 6, fontWeight: 500, letterSpacing: "0.04em" }}>
                  CUSTOM
                </span>
              )}
            </div>
            <div className="channel-phone">{formatPhone(ch.phone)}</div>
            <div className="channel-cell">{ch.total_calls}</div>
            <div className="channel-cell" style={{ color: "#4caf76", fontWeight: 500 }}>{ch.transferred}</div>
            <div className="channel-cell">
              <div className="conv-bar">
                <span style={{
                  color: ch.connected_pct >= 50 ? "#4caf76" : "var(--text-primary)",
                  fontWeight: ch.connected_pct >= 50 ? 600 : 400,
                }}>
                  {ch.connected_pct}%
                </span>
                <div className="conv-track">
                  <div className="conv-fill" style={{
                    width: `${ch.connected_pct}%`,
                    background: ch.connected_pct >= 50 ? "#4caf76" : "var(--whiskey)",
                  }} />
                </div>
              </div>
            </div>
            <div className="channel-cell">
              <button
                onClick={() => router.push(`/channels/${ch.id}`)}
                style={{
                  background: "none",
                  border: "1px solid var(--graphite)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-secondary)",
                  fontSize: "0.78rem",
                  padding: "4px 12px",
                  cursor: "pointer",
                  fontFamily: "var(--sans)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--whiskey)"; e.currentTarget.style.color = "var(--whiskey)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--graphite)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
              >
                Edit
              </button>
            </div>
            <div className="channel-cell">
              {confirmRemoveId === ch.id ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  <button onClick={() => removeChannel(ch.id)} disabled={removing} className="channel-save-btn" style={{ fontSize: 11, padding: "2px 8px" }}>
                    {removing ? "…" : "Release"}
                  </button>
                  <button onClick={() => setConfirmRemoveId(null)} className="channel-cancel-btn" style={{ fontSize: 11, padding: "2px 8px" }}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmRemoveId(ch.id)} className="channel-remove" title="Release number">×</button>
              )}
            </div>
          </div>
        ))}

        {/* + Add Number */}
        {showSearch ? (
          <div style={{ padding: "14px 20px", borderTop: "1px solid var(--graphite)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: searchResults.length || searchError ? 12 : 0 }}>
              <input
                type="text"
                value={areaCode}
                onChange={(e) => { setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3)); setSearchError(""); setBuyError(""); }}
                onKeyDown={(e) => e.key === "Enter" && searchNumbers()}
                placeholder="Area code (e.g. 386)"
                className="channel-input"
                autoFocus
                maxLength={3}
                style={{ width: 140 }}
              />
              <button onClick={searchNumbers} disabled={searching || areaCode.length !== 3} className="channel-save-btn">
                {searching ? "Searching…" : "Search"}
              </button>
              <button onClick={resetSearch} className="channel-cancel-btn">Cancel</button>
            </div>

            {searchError && <p style={{ fontSize: 12, color: "#e55", margin: "8px 0 0" }}>{searchError}</p>}
            {buyError && <p style={{ fontSize: 12, color: "#e55", margin: "8px 0 0" }}>{buyError}</p>}

            {searchResults.length > 0 && !confirmNumber && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {searchResults.map((num) => (
                  <div key={num.phone_number} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", background: "var(--graphite)", borderRadius: 6, fontSize: 13,
                  }}>
                    <span style={{ fontFamily: "monospace", letterSpacing: "0.03em" }}>{formatPhone(num.phone_number)}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--text-muted)" }}>
                      <span style={{ fontSize: 12 }}>{num.monthly_cost}/mo</span>
                      <button onClick={() => { setConfirmNumber(num); setBuyError(""); }} className="channel-save-btn" style={{ fontSize: 12, padding: "3px 10px" }}>Buy</button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {confirmNumber && (
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", background: "var(--graphite)", borderRadius: 6, fontSize: 13, marginTop: 4,
              }}>
                <span style={{ color: "var(--text-muted)" }}>
                  Buy <strong style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>{formatPhone(confirmNumber.phone_number)}</strong> for {confirmNumber.monthly_cost}/mo?
                </span>
                <button onClick={buyNumber} disabled={buying} className="channel-save-btn" style={{ fontSize: 12, padding: "3px 12px" }}>
                  {buying ? "Buying…" : "Confirm"}
                </button>
                <button onClick={() => setConfirmNumber(null)} className="channel-cancel-btn" style={{ fontSize: 12, padding: "3px 10px" }}>Cancel</button>
              </div>
            )}
          </div>
        ) : (
          <div className="channels-row channels-add-trigger" onClick={() => setShowSearch(true)} style={{ cursor: "pointer" }}>
            <div className="channel-name-cell" style={{ color: "var(--text-muted)" }}>
              <div className="channel-dot" style={{ background: "transparent", border: "1px dashed var(--text-muted)" }} />
              + Add Number
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
              const transferredH = ch.total_calls > 0 ? (ch.transferred / ch.total_calls) * height : 0;
              const otherH = height - transferredH;
              return (
                <div key={ch.id} className="chart-bar-group">
                  <div className="chart-bar-value">{ch.total_calls}</div>
                  <div className="chart-bar-stack">
                    {otherH > 0 && <div className="chart-bar-segment" style={{ height: `${otherH}px`, background: ch.color, opacity: 0.35 }} />}
                    {transferredH > 0 && <div className="chart-bar-segment" style={{ height: `${transferredH}px`, background: ch.color }} />}
                  </div>
                  <div className="chart-bar-label">{ch.name}</div>
                </div>
              );
            })}
          </div>
          <div className="chart-legend">
            <div className="legend-item"><div className="legend-dot" style={{ background: "var(--whiskey)" }} /> Transferred</div>
            <div className="legend-item"><div className="legend-dot" style={{ background: "var(--whiskey)", opacity: 0.35 }} /> Other calls</div>
          </div>
        </div>
      )}
    </div>
  );
}
