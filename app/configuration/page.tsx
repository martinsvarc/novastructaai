"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  const t = document.getElementById("toast");
  const m = document.getElementById("toast-msg");
  if (t && m) {
    m.textContent = text ? "Copied" : "Copied";
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2000);
  }
}

function MessageContent({ content, labels }: { content: string; labels: { scriptReady: string; copy: string } }) {
  // Parse content to find code blocks and render them with copy buttons
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          // Extract the code content (remove ``` and optional language tag)
          const lines = part.slice(3, -3).split("\n");
          const firstLine = lines[0].trim();
          // If first line looks like a language tag (no spaces, short), skip it
          const hasLang = firstLine && !firstLine.includes(" ") && firstLine.length < 20;
          const code = hasLang ? lines.slice(1).join("\n").trim() : lines.join("\n").trim();

          return (
            <div
              key={i}
              style={{
                position: "relative",
                margin: "12px 0",
                borderRadius: "8px",
                overflow: "hidden",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: "rgba(96,165,250,0.06)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.68rem",
                    color: "var(--whiskey)",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {labels.scriptReady}
                </span>
                <button
                  onClick={() => copyToClipboard(code)}
                  style={{
                    background: "var(--whiskey)",
                    color: "#000",
                    border: "none",
                    borderRadius: "4px",
                    padding: "4px 10px",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {labels.copy}
                </button>
              </div>
              <pre
                style={{
                  padding: "14px 16px",
                  margin: 0,
                  fontSize: "0.78rem",
                  lineHeight: 1.7,
                  color: "var(--text-primary)",
                  background: "var(--bg-input, rgba(0,0,0,0.2))",
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "var(--sans)",
                }}
              >
                {code}
              </pre>
            </div>
          );
        }

        // Regular text — handle **bold**, line breaks
        if (!part.trim()) return null;
        const formatted = part
          .split(/(\*\*.*?\*\*)/g)
          .map((seg, j) => {
            if (seg.startsWith("**") && seg.endsWith("**")) {
              return (
                <strong key={j} style={{ fontWeight: 600 }}>
                  {seg.slice(2, -2)}
                </strong>
              );
            }
            return <span key={j}>{seg}</span>;
          });

        return (
          <span key={i} style={{ whiteSpace: "pre-wrap" }}>
            {formatted}
          </span>
        );
      })}
    </div>
  );
}

export default function ConfigurationPage() {
  const { t } = useI18n();
  const SUGGESTIONS = [t.sug1, t.sug2, t.sug3, t.sug4, t.sug5, t.sug6];
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  async function send(text?: string) {
    const msg = text || input.trim();
    if (!msg || streaming) return;

    const userMessage: Message = { role: "user", content: msg };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    // Add empty assistant message that we'll stream into
    const assistantIdx = newMessages.length;
    setMessages([...newMessages, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to connect to AI");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

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
            if (json.content) {
              fullContent += json.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[assistantIdx] = {
                  role: "assistant",
                  content: fullContent,
                };
                return updated;
              });
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      console.error("Editor error:", err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantIdx] = {
          role: "assistant",
          content:
            "Sorry, I couldn't connect right now. Please try again in a moment.",
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 40px)",
        maxHeight: "calc(100vh - 40px)",
      }}
    >
      {/* Header */}
      <div style={{ flexShrink: 0, padding: "28px 0 0" }}>
        <div className="page-tag">{t.aiPowered}</div>
        <h2
          style={{
            fontFamily: "var(--serif)",
            fontSize: "1.6rem",
            fontWeight: 400,
            margin: "8px 0 4px",
          }}
        >
          {t.scriptEditorTitle}
        </h2>
        <p
          style={{
            fontSize: "0.78rem",
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          {t.scriptEditorDesc}
        </p>
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 0",
          minHeight: 0,
        }}
      >
        {isEmpty ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "24px",
              padding: "20px",
            }}
          >
            <div
              style={{
                textAlign: "center",
                maxWidth: "400px",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: "1.2rem",
                  color: "var(--text-primary)",
                  marginBottom: "8px",
                }}
              >
                {t.whatToChange}
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                }}
              >
                {t.scriptEditorContext}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
                width: "100%",
                maxWidth: "540px",
              }}
            >
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                    fontSize: "0.74rem",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    textAlign: "left",
                    lineHeight: 1.5,
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = "var(--whiskey)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = "var(--border)")
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    background:
                      msg.role === "user"
                        ? "var(--whiskey)"
                        : "var(--bg-card)",
                    border:
                      msg.role === "assistant"
                        ? "1px solid var(--border)"
                        : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    color: msg.role === "user" ? "#000" : "var(--text-muted)",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                >
                  {msg.role === "user" ? "R" : "AI"}
                </div>
                <div
                  style={{
                    flex: 1,
                    fontSize: "0.84rem",
                    lineHeight: 1.7,
                    color: "var(--text-primary)",
                    minWidth: 0,
                  }}
                >
                  {msg.role === "assistant" ? (
                    <MessageContent content={msg.content} labels={{ scriptReady: t.scriptReadyToPaste, copy: t.copy }} />
                  ) : (
                    <span style={{ whiteSpace: "pre-wrap" }}>
                      {msg.content}
                    </span>
                  )}
                  {msg.role === "assistant" &&
                    streaming &&
                    i === messages.length - 1 && (
                      <span
                        style={{
                          display: "inline-block",
                          width: "6px",
                          height: "14px",
                          background: "var(--whiskey)",
                          marginLeft: "2px",
                          animation: "blink 1s infinite",
                          verticalAlign: "text-bottom",
                        }}
                      />
                    )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid var(--border)",
          padding: "16px 0 20px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "flex-end",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "10px 14px",
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.tellMeWhatToChange}
            disabled={streaming}
            rows={1}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: "var(--text-primary)",
              fontSize: "0.85rem",
              lineHeight: 1.5,
              resize: "none",
              fontFamily: "var(--sans)",
              maxHeight: "160px",
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || streaming}
            style={{
              background:
                input.trim() && !streaming
                  ? "var(--whiskey)"
                  : "var(--border)",
              color: input.trim() && !streaming ? "#000" : "var(--text-muted)",
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor:
                input.trim() && !streaming ? "pointer" : "not-allowed",
              flexShrink: 0,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {streaming ? t.writing : t.send}
          </button>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "8px",
            padding: "0 4px",
          }}
        >
          <span
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
            }}
          >
            {t.shiftEnter}
          </span>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontSize: "0.68rem",
                cursor: "pointer",
                padding: "2px 6px",
              }}
            >
              {t.clearChat}
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
