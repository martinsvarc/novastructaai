"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useI18n } from "@/lib/i18n";

interface CallDetails {
  homeowner?: string;
  location?: string;
  dwelling?: string;
  bill?: string;
  credit?: string;
  roof?: string;
  shade?: string;
  decision_makers?: string;
  address?: string;
  appointment?: string;
  disqualify_reason?: string;
}

interface Call {
  id: number;
  lead_name: string;
  phone: string;
  outcome: string;
  outcome_sub: string;
  oneliner: string;
  ghl_contact_url: string;
  duration_seconds: number;
  recording_url: string;
  short_summary: string;
  created_at: string;
  channel_phone?: string;
  call_details?: CallDetails | null;
}

function fmtDur(s: number) {
  if (!s || s < 1) return "0s";
  const m = Math.floor(s / 60),
    r = s % 60;
  return m ? m + "m" + (r ? " " + r + "s" : "") : r + "s";
}

function fmtMinSec(s: number) {
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const t = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (d >= todayStart) return "Today, " + t;
  if (d >= yesterdayStart) return "Yesterday, " + t;
  return (
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "America/New_York",
    }) +
    ", " +
    t
  );
}

function fmtPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function getDateBounds(
  range: string,
  calStart: Date | null,
  calEnd: Date | null
) {
  const now = new Date();
  let from: Date;
  let to = new Date(now);

  switch (range) {
    case "today":
      from = new Date(now);
      from.setHours(0, 0, 0, 0);
      break;
    case "7d":
      from = new Date(now);
      from.setDate(from.getDate() - 7);
      from.setHours(0, 0, 0, 0);
      break;
    case "30d":
      from = new Date(now);
      from.setDate(from.getDate() - 30);
      from.setHours(0, 0, 0, 0);
      break;
    case "custom":
      from = calStart
        ? new Date(
            calStart.getFullYear(),
            calStart.getMonth(),
            calStart.getDate()
          )
        : new Date("2020-01-01");
      to = calEnd
        ? new Date(
            calEnd.getFullYear(),
            calEnd.getMonth(),
            calEnd.getDate(),
            23,
            59,
            59
          )
        : new Date(now);
      break;
    default:
      from = new Date(now);
      from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

function proxyRecUrl(url: string): string {
  // Convert direct Ultravox URLs to our proxy endpoint
  const match = url.match(/ultravox\.ai\/api\/calls\/([^/]+)\/recording/);
  if (match) return `/api/recording/${match[1]}`;
  return url;
}

function RecPlayer({ url, duration }: { url: string; duration: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      a.play();
    }
    setPlaying(!playing);
  }, [playing]);

  return (
    <div className="rec-player">
      <audio
        ref={audioRef}
        src={proxyRecUrl(url)}
        preload="metadata"
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration;
          if (d && isFinite(d)) setAudioDuration(d);
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
      />
      <button className="rec-play" onClick={toggle}>
        <svg viewBox="0 0 24 24">
          {playing ? (
            <>
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </>
          ) : (
            <polygon points="6,3 20,12 6,21" />
          )}
        </svg>
      </button>
      <div className="rec-track">
        <div
          className="rec-bar-wrap"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            const a = audioRef.current;
            if (a) {
              a.currentTime = pct * audioDuration;
              setCurrentTime(a.currentTime);
            }
          }}
        >
          <div
            className="rec-bar-fill"
            style={{
              width: audioDuration > 0
                ? `${(currentTime / audioDuration) * 100}%`
                : "0%",
            }}
          ></div>
        </div>
        <div className="rec-times">
          <span>{fmtMinSec(Math.floor(currentTime))}</span>
          <span>{fmtMinSec(Math.floor(audioDuration))}</span>
        </div>
      </div>
    </div>
  );
}

const OUTCOMES = ["transferred", "booked", "callback", "after_hours", "disqualified", "dropped"] as const;

export function CallLog({ calls: initialCalls, channels }: { calls: Call[]; channels?: { id: number; name: string; phone: string; color: string }[] }) {
  const { t } = useI18n();
  const [calls, setCalls] = useState(initialCalls);
  const [currentRange, setCurrentRange] = useState("7d");
  const [currentFilter, setCurrentFilter] = useState("all");
  const [currentChannel, setCurrentChannel] = useState("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editOutcome, setEditOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const channelMap = useMemo(() => {
    const map: Record<string, { name: string; color: string }> = {};
    if (channels) {
      for (const ch of channels) {
        map[ch.phone] = { name: ch.name, color: ch.color };
      }
    }
    return map;
  }, [channels]);
  function startEditing(c: Call) {
    setEditingId(c.id);
    setEditName(c.lead_name);
    setEditSummary(c.short_summary);
    setEditOutcome(c.outcome);
    setConfirmDeleteId(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setConfirmDeleteId(null);
  }

  async function saveEdit(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/calls/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_name: editName,
          short_summary: editSummary,
          outcome: editOutcome,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCalls((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
        setEditingId(null);
      }
    } catch (e) {
      console.error("Failed to save:", e);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCall(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/calls/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCalls((prev) => prev.filter((c) => c.id !== id));
        setExpandedId(null);
        setConfirmDeleteId(null);
      }
    } catch (e) {
      console.error("Failed to delete:", e);
    } finally {
      setSaving(false);
    }
  }

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [calStart, setCalStart] = useState<Date | null>(null);
  const [calEnd, setCalEnd] = useState<Date | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  const { from, to } = useMemo(
    () => getDateBounds(currentRange, calStart, calEnd),
    [currentRange, calStart, calEnd]
  );

  const allInRange = useMemo(
    () =>
      calls.filter((c) => {
        const t = new Date(c.created_at);
        return t >= from && t <= to;
      }),
    [calls, from, to]
  );

  const visible = useMemo(
    () =>
      allInRange.filter(
        (c) =>
          (currentFilter === "all" || c.outcome === currentFilter) &&
          (currentChannel === "all" || c.channel_phone === currentChannel)
      ),
    [allInRange, currentFilter, currentChannel]
  );

  const stats = useMemo(() => {
    return {
      total: allInRange.length,
      transferred: allInRange.filter((c) => c.outcome === "transferred")
        .length,
      booked: allInRange.filter((c) => c.outcome === "booked").length,
      callback: allInRange.filter((c) => c.outcome === "callback").length,
      after_hours: allInRange.filter((c) => c.outcome === "after_hours")
        .length,
      disqualified: allInRange.filter((c) => c.outcome === "disqualified")
        .length,
      dropped: allInRange.filter((c) => c.outcome === "dropped").length,
    };
  }, [allInRange]);

  const rangeLabels: Record<string, string> = {
    today: t.today,
    "7d": "7 days",
    "30d": "30 days",
    custom: t.custom,
  };

  function handleRangeChange(range: string) {
    setCurrentRange(range);
    setExpandedId(null);
    if (range !== "custom") {
      setCalStart(null);
      setCalEnd(null);
    }
  }

  function calNav(dir: number) {
    let m = calMonth + dir;
    let y = calYear;
    if (m < 0) {
      m = 11;
      y--;
    }
    if (m > 11) {
      m = 0;
      y++;
    }
    setCalMonth(m);
    setCalYear(y);
  }

  function pickDay(d: number) {
    const picked = new Date(calYear, calMonth, d);
    if (!calStart || (calStart && calEnd)) {
      setCalStart(picked);
      setCalEnd(null);
    } else {
      if (picked < calStart) {
        setCalEnd(calStart);
        setCalStart(picked);
      } else {
        setCalEnd(picked);
      }
      setCurrentRange("custom");
      setExpandedId(null);
    }
  }

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const dows = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startDay = new Date(calYear, calMonth, 1).getDay();
  const todayStr = `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`;

  function calLabel() {
    if (calStart && calEnd) {
      const fmt = (dt: Date) => dt.getMonth() + 1 + "/" + dt.getDate();
      return fmt(calStart) + " – " + fmt(calEnd);
    }
    return "Custom";
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-tag">{t.inboundVoice}</div>
        <h2>{t.callLogTitle}</h2>
      </div>

      {/* Unified filter bar */}
      <div className="filter-bar">
        {channels && channels.length > 0 && (
          <div className="filter-group">
            <button
              className={`filter-chip ${currentChannel === "all" ? "active" : ""}`}
              onClick={() => { setCurrentChannel("all"); setExpandedId(null); }}
            >
              All Channels
            </button>
            {channels.map((ch) => (
              <button
                key={ch.id}
                className={`filter-chip ${currentChannel === ch.phone ? "active" : ""}`}
                onClick={() => { setCurrentChannel(ch.phone); setExpandedId(null); }}
              >
                <span className="filter-dot" style={{ backgroundColor: ch.color }} />
                {ch.name}
              </button>
            ))}
          </div>
        )}

        <div className="filter-group">
          {["today", "7d", "30d"].map((r) => (
            <button
              key={r}
              className={`filter-chip ${currentRange === r ? "active" : ""}`}
              onClick={() => handleRangeChange(r)}
            >
              {r === "today" ? t.today : r}
            </button>
          ))}
          <div style={{ position: "relative", display: "inline-flex" }}>
            <button
              className={`filter-chip filter-chip-cal ${currentRange === "custom" ? "active" : ""} ${calOpen ? "open" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setCalOpen(!calOpen);
              }}
            >
              <svg viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>{calLabel()}</span>
            </button>
            {calOpen && (
              <div
                className="cal-dropdown show"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="cal-nav">
                  <button className="cal-nav-btn" onClick={() => calNav(-1)}>
                    &#8249;
                  </button>
                  <span className="cal-month-label">
                    {months[calMonth]} {calYear}
                  </span>
                  <button className="cal-nav-btn" onClick={() => calNav(1)}>
                    &#8250;
                  </button>
                </div>
                <div className="cal-grid">
                  {dows.map((d) => (
                    <div key={d} className="cal-dow">
                      {d}
                    </div>
                  ))}
                  {Array.from({ length: startDay }).map((_, i) => (
                    <div key={"e" + i} className="cal-day empty"></div>
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const d = i + 1;
                    const dt = new Date(calYear, calMonth, d);
                    const dateStr = `${calYear}-${calMonth + 1}-${d}`;
                    let cls = "cal-day";
                    if (dateStr === todayStr) cls += " today";
                    if (calStart && calEnd) {
                      if (
                        dt.getTime() === calStart.getTime() &&
                        dt.getTime() === calEnd.getTime()
                      )
                        cls += " range-start range-end";
                      else if (dt.getTime() === calStart.getTime())
                        cls += " range-start";
                      else if (dt.getTime() === calEnd.getTime())
                        cls += " range-end";
                      else if (dt > calStart && dt < calEnd)
                        cls += " in-range";
                    } else if (calStart && dt.getTime() === calStart.getTime()) {
                      cls += " range-start range-end";
                    }
                    return (
                      <div
                        key={d}
                        className={cls}
                        onClick={(e) => {
                          e.stopPropagation();
                          pickDay(d);
                        }}
                      >
                        {d}
                      </div>
                    );
                  })}
                </div>
                <div className="cal-hint">
                  {!calStart
                    ? t.clickStartDate
                    : !calEnd
                      ? t.clickEndDate
                      : t.rangeSelected}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats — clickable as filters */}
      <div className="stats-bar">
        {([
          { key: "all", value: stats.total, label: `${t.total} · ${rangeLabels[currentRange] || t.today}`, colorClass: "" },
          { key: "transferred", value: stats.transferred, label: t.transferred, colorClass: "gold" },
          { key: "booked", value: stats.booked, label: t.booked, colorClass: "green" },
          { key: "callback", value: stats.callback, label: t.callback, colorClass: "blue" },
          { key: "after_hours", value: stats.after_hours, label: t.afterHours, colorClass: "purple" },
          { key: "disqualified", value: stats.disqualified, label: t.disqualified, colorClass: "" },
          { key: "dropped", value: stats.dropped, label: t.dropped, colorClass: "" },
        ] as const).map((s) => (
          <button
            key={s.key}
            className={`stat-item stat-filter ${currentFilter === s.key ? "stat-active" : ""}`}
            onClick={() => {
              setCurrentFilter(currentFilter === s.key ? "all" : s.key);
              setExpandedId(null);
            }}
          >
            <div className={`stat-value ${s.colorClass}`}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Call List */}
      <div className="calls-list">
        {visible.length === 0 ? (
          <div className="empty-state">
            <p>{t.noCallsMatch}</p>
          </div>
        ) : (
          visible.map((c) => {
            const isExp = expandedId === c.id;
            return (
              <div key={c.id}>
                <div
                  className={`call-row ${isExp ? "expanded" : ""} ${c.outcome === "booked" ? "booked-row" : ""}`}
                  onClick={() => setExpandedId(isExp ? null : c.id)}
                >
                  <div className={`call-accent ${c.outcome}`}></div>
                  <div className="call-outcome">
                    <span className={`outcome-word ${c.outcome}`}>
                      {c.outcome[0].toUpperCase() + c.outcome.slice(1)}
                    </span>
                    <span className="outcome-sub">{c.outcome_sub}</span>
                  </div>
                  <div className="call-body">
                    <div className="call-top-line">
                      <span className="call-name">{c.lead_name}</span>
                      <span className="call-route">
                        <span className="call-phone">{fmtPhone(c.phone)}</span>
                        {c.channel_phone && channelMap[c.channel_phone] && (
                          <>
                            <span className="call-route-arrow">→</span>
                            <span
                              className="call-channel-tag"
                              style={{ borderColor: channelMap[c.channel_phone].color + "66", color: channelMap[c.channel_phone].color }}
                            >
                              <span className="call-channel-dot" style={{ background: channelMap[c.channel_phone].color }} />
                              {channelMap[c.channel_phone].name}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="call-meta">{c.oneliner}</div>
                  </div>
                  <div className="call-right">
                    <div className="call-time-block">
                      <span className="call-time">
                        {fmtTime(c.created_at)}
                      </span>
                      <span className="call-dur">
                        {fmtDur(c.duration_seconds)}
                      </span>
                    </div>
                    {c.ghl_contact_url ? (
                      <a
                        href={c.ghl_contact_url}
                        className="call-ghl"
                        onClick={(e) => e.stopPropagation()}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        GHL ↗
                      </a>
                    ) : (
                      <span></span>
                    )}
                    <svg
                      className="call-expand-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
                <div className={`call-detail ${isExp ? "show" : ""}`}>
                  <div className="detail-inner">
                    <div className="detail-content">
                      {editingId === c.id ? (
                        /* ===== EDIT MODE ===== */
                        <div className="detail-edit" onClick={(e) => e.stopPropagation()}>
                          <div className="detail-edit-row">
                            <div className="detail-edit-field">
                              <label className="detail-label">Lead Name</label>
                              <input
                                className="detail-input"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                              />
                            </div>
                            <div className="detail-edit-field">
                              <label className="detail-label">Outcome</label>
                              <div className="detail-outcome-pills">
                                {OUTCOMES.map((o) => (
                                  <button
                                    key={o}
                                    className={`detail-outcome-pill ${o} ${editOutcome === o ? "active" : ""}`}
                                    onClick={() => setEditOutcome(o)}
                                  >
                                    {o === "after_hours" ? "After Hours" : o.charAt(0).toUpperCase() + o.slice(1)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="detail-edit-field" style={{ marginTop: 12 }}>
                            <label className="detail-label">{t.callSummary}</label>
                            <textarea
                              className="detail-textarea"
                              value={editSummary}
                              onChange={(e) => setEditSummary(e.target.value)}
                              rows={3}
                            />
                          </div>
                          <div className="detail-edit-actions">
                            <button className="detail-btn detail-btn-save" onClick={() => saveEdit(c.id)} disabled={saving}>
                              {saving ? "Saving..." : "Save"}
                            </button>
                            <button className="detail-btn detail-btn-cancel" onClick={cancelEditing}>
                              Cancel
                            </button>
                            <div style={{ flex: 1 }} />
                            {confirmDeleteId === c.id ? (
                              <span className="detail-delete-confirm">
                                <span style={{ fontSize: "0.78rem", color: "var(--dim)" }}>Delete this call?</span>
                                <button className="detail-btn detail-btn-delete" onClick={() => deleteCall(c.id)} disabled={saving}>
                                  {saving ? "..." : "Yes, delete"}
                                </button>
                                <button className="detail-btn detail-btn-cancel" onClick={() => setConfirmDeleteId(null)}>
                                  No
                                </button>
                              </span>
                            ) : (
                              <button className="detail-btn detail-btn-delete-trigger" onClick={() => setConfirmDeleteId(c.id)}>
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* ===== VIEW MODE ===== */
                        <div className="detail-view">
                          {/* Qualification grid */}
                          {c.call_details && Object.keys(c.call_details).length > 0 ? (
                            <>
                              <div className="detail-label">Qualification</div>
                              <div className="qual-grid">
                                {([
                                  { key: "homeowner", label: "Homeowner", icon: "M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" },
                                  { key: "location", label: "Location", icon: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" },
                                  { key: "dwelling", label: "Property", icon: "M3 21h18M3 7v1a3 3 0 006 0V7m0 0v1a3 3 0 006 0V7m0 0v1a3 3 0 006 0V7M3 7h18M6 21V10.7M18 21V10.7" },
                                  { key: "bill", label: "Electric Bill", icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z" },
                                  { key: "credit", label: "Credit Score", icon: "M2 10h20M2 14h20M6 18h2M12 18h6M4 6h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" },
                                  { key: "roof", label: "Roof", icon: "M3 21l9-9 9 9M3 21V9l9-7 9 7v12" },
                                  { key: "shade", label: "Sun/Shade", icon: "M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 6a6 6 0 100 12 6 6 0 000-12z" },
                                  { key: "decision_makers", label: "Decision Makers", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
                                  { key: "address", label: "Address", icon: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 7v6M9 10h6" },
                                  { key: "appointment", label: "Appointment", icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" },
                                  { key: "disqualify_reason", label: "Disqualified", icon: "M18 6L6 18M6 6l12 12" },
                                ] as const).map(({ key, label, icon }) => {
                                  const val = c.call_details?.[key as keyof CallDetails];
                                  if (!val) return null;
                                  return (
                                    <div key={key} className="qual-item">
                                      <svg className="qual-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d={icon} />
                                      </svg>
                                      <div>
                                        <div className="qual-label">{label}</div>
                                        <div className="qual-value">{val}</div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          ) : null}

                          {/* Summary + Recording side by side */}
                          <div className="detail-bottom-cols">
                            <div>
                              <div className="detail-label">{t.callSummary}</div>
                              <div className="summary-text">
                                {c.short_summary || t.noSummary}
                              </div>
                            </div>
                            <div>
                              <div className="detail-label">{t.recording}</div>
                              {c.recording_url ? (
                                <RecPlayer
                                  url={c.recording_url}
                                  duration={c.duration_seconds}
                                />
                              ) : (
                                <div className="no-rec">{t.noRecording}</div>
                              )}
                            </div>
                          </div>

                          <div className="detail-actions">
                            {c.ghl_contact_url && (
                              <a
                                href={c.ghl_contact_url}
                                className="btn btn-ghost"
                                onClick={(e) => e.stopPropagation()}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {t.openInGhl} ↗
                              </a>
                            )}
                            <button
                              className="btn btn-ghost"
                              onClick={(e) => { e.stopPropagation(); startEditing(c); }}
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
