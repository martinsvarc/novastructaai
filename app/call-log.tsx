"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useI18n } from "@/lib/i18n";

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

export function CallLog({ calls, channels }: { calls: Call[]; channels?: { id: number; name: string; phone: string; color: string }[] }) {
  const { t } = useI18n();
  const [currentRange, setCurrentRange] = useState("7d");
  const [currentFilter, setCurrentFilter] = useState("all");
  const [currentChannel, setCurrentChannel] = useState("all");

  const channelMap = useMemo(() => {
    const map: Record<string, { name: string; color: string }> = {};
    if (channels) {
      for (const ch of channels) {
        map[ch.phone] = { name: ch.name, color: ch.color };
      }
    }
    return map;
  }, [channels]);
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

      {/* Channel filter */}
      {channels && channels.length > 0 && (
        <div className="toolbar" style={{ marginBottom: 0, paddingBottom: 0 }}>
          <div className="toolbar-left">
            <button
              className={`pill ${currentChannel === "all" ? "active" : ""}`}
              onClick={() => { setCurrentChannel("all"); setExpandedId(null); }}
            >
              All Channels
            </button>
            {channels.map((ch) => (
              <button
                key={ch.id}
                className={`pill ${currentChannel === ch.phone ? "active" : ""}`}
                onClick={() => { setCurrentChannel(ch.phone); setExpandedId(null); }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: ch.color,
                    marginRight: 6,
                    flexShrink: 0,
                  }}
                />
                {ch.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Date range toolbar */}
      <div className="toolbar">
        <div className="toolbar-left"></div>
        <div className="toolbar-right">
          {["today", "7d", "30d"].map((r) => (
            <button
              key={r}
              className={`pill ${currentRange === r ? "active" : ""}`}
              onClick={() => handleRangeChange(r)}
            >
              {r === "today" ? t.today : r}
            </button>
          ))}
          <div style={{ position: "relative", display: "inline-flex" }}>
            <button
              className={`cal-trigger ${currentRange === "custom" ? "active" : ""} ${calOpen ? "open" : ""}`}
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
        ] as const).map((s, i, arr) => (
          <span key={s.key} style={{ display: "contents" }}>
            <button
              className={`stat-item stat-filter ${currentFilter === s.key ? "stat-active" : ""}`}
              onClick={() => {
                setCurrentFilter(currentFilter === s.key ? "all" : s.key);
                setExpandedId(null);
              }}
            >
              <div className={`stat-value ${s.colorClass}`}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </button>
            {i < arr.length - 1 && <div className="stats-divider"></div>}
          </span>
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
                  className={`call-row ${isExp ? "expanded" : ""}`}
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
                  <div className="detail-cols">
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
                      {c.ghl_contact_url && (
                        <div className="detail-actions">
                          <a
                            href={c.ghl_contact_url}
                            className="btn btn-ghost"
                            onClick={(e) => e.stopPropagation()}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t.openInGhl} ↗
                          </a>
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
